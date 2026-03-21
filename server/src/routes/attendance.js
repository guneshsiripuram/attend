const express = require('express');
const { query } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');


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
  console.log('[VERIFY_START] Body:', JSON.stringify(req.body).substring(0, 200) + '...');
  const { face_descriptor, location } = req.body; 
  const userId = req.user.id;
  console.log('[VERIFY_USER] ID:', userId);

  try {
    // 0. Session Gatekeeper Check
    const sessionResult = await query("SELECT is_open, expires_at FROM portal_settings WHERE id = 1");
    const session = sessionResult.rows[0];
    
    if (!session || !session.is_open) {
      return res.status(403).json({ message: 'Portal Closed: Faculty has not opened attendance for this session.' });
    }
    
    if (session.expires_at && new Date() > new Date(session.expires_at)) {
      // Auto-close if expired
      await query("UPDATE portal_settings SET is_open = FALSE WHERE id = 1");
      return res.status(403).json({ message: 'Session Expired: The attendance window has closed automatically.' });
    }

    // --- SESSION ENFORCEMENT ---
    const currentSession = new Date().getHours() < 12 ? 'Morning' : 'Afternoon';
    const existingLog = await query(
      `SELECT id FROM attendance_logs 
       WHERE user_id = $1 AND status = 'Present' 
       AND "timestamp"::date = CURRENT_DATE 
       AND (CASE WHEN EXTRACT(HOUR FROM "timestamp") < 12 THEN 'Morning' ELSE 'Afternoon' END) = $2`,
      [userId, currentSession]
    );

    if (existingLog.rows.length > 0) {
      return res.status(403).json({ 
        message: `Duplicate Entry: Your ${currentSession} attendance is already recorded.` 
      });
    }
    // ---------------------------

    // 1. Fetch user data (including roll_number, section and embedding)
    const userResult = await query('SELECT full_name, roll_number, section, face_embedding FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // --- Identity Check Removed (Using Database Ground Truth) ---

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      console.error('[VERIFY_ERROR] Invalid location data:', location);
      return res.status(400).json({ message: 'Invalid or missing location data.' });
    }

    // 3. Location Check
    const campusLat = parseFloat(process.env.CAMPUS_LAT);
    const campusLng = parseFloat(process.env.CAMPUS_LNG);
    console.log('[VERIFY_LOCATION_CHECK] Campus:', campusLat, campusLng);
    const distance = calculateDistance(location.lat, location.lng, campusLat, campusLng);

    const MAX_DISTANCE = parseFloat(process.env.MAX_DISTANCE_METERS || '200');
    const isInside = distance <= MAX_DISTANCE;

    console.log(`[DEBUG] User Location: ${location.lat}, ${location.lng}`);
    console.log(`[DEBUG] Campus Center: ${campusLat}, ${campusLng}`);
    console.log(`[DEBUG] Calculated Distance: ${distance.toFixed(2)}m (Max: ${MAX_DISTANCE}m)`);

    if (!isInside) {
      await query(
        'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
        [userId, user.roll_number, user.section, 'Failed_Location', JSON.stringify({ ...location, distance, maxDistance: MAX_DISTANCE })]
      );
      return res.status(403).json({ 
        message: `Outside Campus: ${distance.toFixed(2)}m away`,
        details: `You are currently ${distance.toFixed(2)}m away from the campus gate. Maximum allowed is ${MAX_DISTANCE}m.`
      });
    }



    // 3. Process Live Identity (Option 2: Direct Descriptor from Client)
    const { face_descriptor } = req.body;
    
    if (!face_descriptor) {
      return res.status(400).json({ message: 'Missing facial data for verification.' });
    }

    // 4. Compare Embeddings
    let storedEmbedding = user.face_embedding;
    
    if (typeof storedEmbedding === 'string') {
        try {
            storedEmbedding = JSON.parse(storedEmbedding);
        } catch (e) {
            console.error('[DEBUG] JSON.parse failed for embedding:', e);
        }
    }

    const finalStored = Array.isArray(storedEmbedding) ? storedEmbedding : (storedEmbedding?.descriptor || storedEmbedding);
    
    if (!finalStored) {
      return res.status(400).json({ 
        message: 'Face enrollment required. Please register your face first.',
        needsEnrollment: true 
      });
    }

    const { compareDescriptors } = require('../utils/faceUtils');
    
    // Detailed logging for debugging
    console.log(`[DEBUG] FinalStored: type=${typeof finalStored}, isArray=${Array.isArray(finalStored)}, len=${finalStored?.length}`);
    console.log(`[DEBUG] ProvidedDescriptor: type=${typeof face_descriptor}, isArray=${Array.isArray(face_descriptor)}, len=${face_descriptor?.length}`);
    
    const faceDistance = compareDescriptors(finalStored, face_descriptor);
    const similarity = 1 - faceDistance; 
    
    console.log(`[DEBUG] Comparison: FaceDistance=${faceDistance.toFixed(4)}, Similarity=${similarity.toFixed(4)}`);
    const threshold = 0.40;

    if (similarity < threshold) {
      console.log(`[DEBUG] Match failed: ${similarity} < ${threshold}`);
      await query(
        'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
        [userId, user.roll_number, user.section, 'Failed_Face', JSON.stringify({ ...location, similarity: similarity.toFixed(4) })]
      );
      return res.status(403).json({ message: 'Match Failed', details: 'The face captured does not match your registered profile. Please ensure your face is clearly visible and well-lit.', similarity });
    }

    console.log(`[DEBUG] Verification Successful! Recording attendance...`);
    // 6. Success
    await query(
      'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
      [userId, user.roll_number, user.section, 'Present', JSON.stringify(location)]
    );

    res.json({ 
      message: 'Attendance Marked! Success.', 
      confidence: similarity,
      student: {
        name: user.full_name,
        rollNumber: user.roll_number
      }
    });
  } catch (error) {
    console.error('[ATTENDANCE_CRITICAL_ERROR]:', error);
    res.status(500).json({ 
      message: 'Server error during verification', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Get Personal Attendance
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM attendance_logs WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );
    
    // Calculate stats dynamic based on unique capture days in system
    const dayCountResult = await query('SELECT COUNT(DISTINCT "timestamp"::date) as count FROM attendance_logs');
    const totalDays = parseInt(dayCountResult.rows[0].count) || 1; 

    // Full-day logic: Must have at least one morning (<12) AND one afternoon (>=12) log
    const statsByDate = {};
    result.rows.forEach(log => {
      if (log.status !== 'Present') return;
      const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
      const hour = new Date(log.timestamp).getHours();
      const session = hour < 12 ? 'morning' : 'afternoon';
      
      if (!statsByDate[dateStr]) statsByDate[dateStr] = { morning: false, afternoon: false };
      statsByDate[dateStr][session] = true;
    });

    const presentDays = Object.values(statsByDate).filter(day => day.morning && day.afternoon).length;
    const percentage = (presentDays / totalDays) * 100;

    res.json({ logs: result.rows, stats: { percentage, present: presentDays, total: totalDays } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching attendance' });
  }
});

// Get Portal Session Status (Student endpoint)
router.get('/session', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT is_open, expires_at FROM portal_settings WHERE id = 1');
    let session = result.rows[0];

    // Auto-expiration check
    if (session && session.is_open && session.expires_at && new Date() > new Date(session.expires_at)) {
      await query('UPDATE portal_settings SET is_open = false, expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
      session = { ...session, is_open: false, expires_at: null };
      console.log('--- STUDENT SESSION AUTO-CLOSED (EXPIRED) ---');
    }

    res.json(session);
  } catch (err) {
    console.error('Session fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
});

module.exports = router;
