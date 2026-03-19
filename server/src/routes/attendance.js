const express = require('express');
const { query } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getEmbedding, compareEmbeddings } = require('../utils/faceEngine');
const { base64ToBuffer } = require('../utils/fileUtils');


const router = express.Router();

// Haversine formula to calculate distance between two GPS coordinates
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Verify Attendance
router.post('/verify', authMiddleware, async (req, res) => {
  const { images, location, rollNumber, section } = req.body; // images is object, location is { lat, lng }
  const userId = req.user.id;

  try {
    // 1. Fetch user data (including roll_number, section and embedding)
    const userResult = await query('SELECT roll_number, section, face_embedding FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Roll Number & Section Check
    console.log(`[DEBUG] Comparing Identity:`);
    console.log(`[DEBUG] Input: Roll=${rollNumber}, Section=${section}`);
    console.log(`[DEBUG] Database: Roll=${user.roll_number}, Section=${user.section}`);

    if (rollNumber !== user.roll_number || section !== user.section) {
      await query(
        'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
        [userId, rollNumber, section, 'Failed_Roll', JSON.stringify(location)]
      );
      return res.status(403).json({ message: 'Identity verification failed. Please check your Roll Number and Section.' });
    }

    // 3. Location Check
    const campusLat = parseFloat(process.env.CAMPUS_LAT);
    const campusLng = parseFloat(process.env.CAMPUS_LNG);
    const distance = calculateDistance(location.lat, location.lng, campusLat, campusLng);

    console.log(`[DEBUG] User Location: ${location.lat}, ${location.lng}`);
    console.log(`[DEBUG] Campus Center: ${campusLat}, ${campusLng}`);
    console.log(`[DEBUG] Calculated Distance: ${distance.toFixed(2)}m (Max: ${process.env.MAX_DISTANCE_METERS}m)`);

    if (distance > parseFloat(process.env.MAX_DISTANCE_METERS)) {
      await query(
        'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
        [userId, rollNumber, section, 'Failed_Location', JSON.stringify(location)]
      );
      return res.status(403).json({ message: 'Location verification failed. You must be on campus.', distance: distance.toFixed(2) });
    }



    // 3. Process Live Images
    let liveEmbedding = null;
    
    // Fast-path for single-image "Auto-Verify"
    if (req.body.image) {
      console.log(`[DEBUG] Executing single-image fast-path...`);
      const buffer = base64ToBuffer(req.body.image);

      const processStartTime = Date.now();
      const faceResult = await getEmbedding(buffer);
      console.log(`[DEBUG] Fast-path processing took ${Date.now() - processStartTime}ms`);
      
      if (!faceResult) {
        return res.status(400).json({ message: 'No face detected.' });
      }
      liveEmbedding = faceResult.descriptor;
    } 
    // Legacy 3-pose liveness check
    else if (images && images.straight && images.left && images.right) {
      const poses = ['straight', 'left', 'right'];
      const processStartTime = Date.now();
      const faceResults = await Promise.all(poses.map(async (targetPose) => {
        const buffer = base64ToBuffer(images[targetPose]);

        const faceResult = await getEmbedding(buffer);
        return { targetPose, faceResult };
      }));

      console.log(`[DEBUG] Parallel processing took ${Date.now() - processStartTime}ms`);

      const results = {};
      for (const { targetPose, faceResult } of faceResults) {
        if (!faceResult) return res.status(400).json({ message: `No face detected in ${targetPose}.` });
        if (faceResult.pose !== targetPose) {
          return res.status(403).json({ message: `Liveness failed: ${targetPose} pose incorrect.` });
        }
        results[targetPose] = faceResult.descriptor;
      }
      liveEmbedding = results.straight;
    } else {
      return res.status(400).json({ message: 'Missing facial data for verification.' });
    }

    console.log(`[DEBUG] All 3 poses verified. Starting facial comparison...`);
    // 4. Compare Embeddings (using the straight image for the primary match)
    let storedEmbedding = user.face_embedding;
    console.log(`[DEBUG] Raw Stored Type: ${typeof storedEmbedding}`);
    
    if (typeof storedEmbedding === 'string') {
        try {
            storedEmbedding = JSON.parse(storedEmbedding);
        } catch (e) {
            console.error('[DEBUG] JSON.parse failed for embedding:', e);
        }
    }

    // Handle both array and { descriptor: [...] } formats
    const finalStored = Array.isArray(storedEmbedding) ? storedEmbedding : (storedEmbedding?.descriptor || storedEmbedding);
    
    console.log(`[DEBUG] Comparing Embeddings: Stored length=${finalStored?.length}, Live length=${liveEmbedding?.length}`);
    
    if (!finalStored || !liveEmbedding) {
      throw new Error(`Embedding missing or invalid format: Stored=${!!finalStored}, Live=${!!liveEmbedding}`);
    }

    const similarity = compareEmbeddings(finalStored, liveEmbedding);
    console.log(`[DEBUG] Similarity score: ${similarity.toFixed(4)}`);
    const threshold = 0.60;

    if (similarity < threshold) {
      console.log(`[DEBUG] Match failed: ${similarity} < ${threshold}`);
      await query(
        'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
        [userId, rollNumber, section, 'Failed_Match', JSON.stringify(location)]
      );
      return res.status(403).json({ message: 'Facial recognition failed. Face does not match registered profile.', similarity });
    }

    console.log(`[DEBUG] Verification Successful! Recording attendance...`);
    // 6. Success
    await query(
      'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
      [userId, rollNumber, section, 'Present', JSON.stringify(location)]
    );

    res.json({ message: 'Attendance marked successfully!', confidence: similarity });
  } catch (error) {
    console.error('[ATTENDANCE_ERROR]:', error);
    res.status(500).json({ message: 'Server error during verification', details: error.message });
  }
});

// Get Personal Attendance
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM attendance_logs WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );
    
    // Calculate percentage
    const totalDays = 30; // Mocking a 30-day semester month for demo
    const presentDays = result.rows.filter(row => row.status === 'Present').length;
    const percentage = (presentDays / totalDays) * 100;

    res.json({ logs: result.rows, stats: { percentage, present: presentDays, total: totalDays } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching attendance' });
  }
});

module.exports = router;
