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

// 1. New Endpoint: Check Location Only
router.post('/check-location', authMiddleware, async (req, res) => {
  const { location } = req.body;
  
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return res.status(400).json({ success: false, message: 'Invalid or missing location data.' });
  }

  const sessionResult = await query('SELECT campus_lat, campus_lng, max_distance_meters FROM portal_settings WHERE id = 1');
  const session = sessionResult.rows[0];
  
  const campusLat = parseFloat(session?.campus_lat || process.env.CAMPUS_LAT);
  const campusLng = parseFloat(session?.campus_lng || process.env.CAMPUS_LNG);
  const distance = calculateDistance(location.lat, location.lng, campusLat, campusLng);
  const MAX_DISTANCE = parseInt(session?.max_distance_meters || process.env.MAX_DISTANCE_METERS || '200');
  const isInside = distance <= MAX_DISTANCE;

  if (!isInside) {
    return res.status(403).json({ 
      success: false, 
      message: 'LOCATION FAILED: You are out of campus range.',
      details: `Distance: ${distance.toFixed(2)}m (Max allowed: ${MAX_DISTANCE}m)`
    });
  }

  return res.json({ success: true, message: 'Location verified.' });
});

// 2. Verify Attendance (Face only now, assuming location was checked)
router.post('/verify', authMiddleware, async (req, res) => {
  const { face_descriptor, location } = req.body; 
  const userId = req.user.id;

  try {
     // Session Check
     const sessionResult = await query('SELECT is_open, session_starts_at, expires_at, campus_lat, campus_lng, max_distance_meters FROM portal_settings WHERE id = 1');
     const session = sessionResult.rows[0];
     if (!session || !session.is_open) return res.status(403).json({ message: 'Portal Closed: Faculty has not opened the attendance gate.' });
     
     const now = new Date();
     if (session.session_starts_at && now < new Date(session.session_starts_at)) return res.status(403).json({ message: 'Portal Scheduled: Opens at ' + new Date(session.session_starts_at).toLocaleTimeString() });
     if (session.expires_at && now > new Date(session.expires_at)) {
       await query('UPDATE portal_settings SET is_open = false WHERE id = 1');
       return res.status(403).json({ message: 'Session Expired: Gate closed automatically.' });
     }

     // Duplicate Check (IST)
     const istTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
     const istHour = istTime.getHours();
     const currentSession = istHour < 12 ? 'Morning' : 'Afternoon';

     const existingLog = await query(
       `SELECT id FROM attendance_logs 
        WHERE user_id = $1 AND status = 'Present' 
        AND (timestamp AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
        AND (CASE WHEN EXTRACT(HOUR FROM "timestamp" AT TIME ZONE 'Asia/Kolkata') < 12 THEN 'Morning' ELSE 'Afternoon' END) = $2`,
       [userId, currentSession]
     );

     if (existingLog && existingLog.rows.length > 0) {
       return res.status(403).json({ message: `Duplicate Entry: Your ${currentSession} attendance is already recorded for today.` });
     }

     // Fetch user data
     const userResult = await query('SELECT full_name, roll_number, section, face_embedding FROM users WHERE id = $1', [userId]);
     const user = userResult.rows[0];
     if (!user) return res.status(404).json({ message: 'User profile not found.' });

     // Final Location Security Check
     const campusLat = parseFloat(session?.campus_lat || process.env.CAMPUS_LAT);
     const campusLng = parseFloat(session?.campus_lng || process.env.CAMPUS_LNG);
     const distance = calculateDistance(location.lat, location.lng, campusLat, campusLng);
     const MAX_DISTANCE = parseInt(session?.max_distance_meters || process.env.MAX_DISTANCE_METERS || '200');
     if (distance > MAX_DISTANCE) {
        await query(
          'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
          [userId, user.roll_number, user.section, 'Failed_Location', JSON.stringify({ ...location, distance })]
        );
        return res.status(403).json({ message: 'LOCATION FAILED: You are out of campus range.' });
     }

     // Face Comparison
     let storedEmbedding = user.face_embedding;
     if (typeof storedEmbedding === 'string') storedEmbedding = JSON.parse(storedEmbedding);
     const finalStored = Array.isArray(storedEmbedding) ? storedEmbedding : (storedEmbedding?.descriptor || storedEmbedding);
     
     if (!finalStored) return res.status(400).json({ message: 'Face enrollment required. Please register your face first.' });

     const { compareDescriptors, isValidDescriptor, FACE_DISTANCE_THRESHOLD } = require('../utils/faceUtils');

     if (!isValidDescriptor(finalStored)) {
       return res.status(403).json({ message: 'IDENTITY FAILED: Stored face data is invalid. Please re-enroll your face from the admin dashboard.' });
     }
     if (!isValidDescriptor(face_descriptor)) {
       return res.status(400).json({ message: 'IDENTITY FAILED: Face capture was invalid. Please retry in good lighting.' });
     }

     const faceDistance = compareDescriptors(finalStored, face_descriptor);
     const similarity = 1 - faceDistance;

     if (faceDistance > FACE_DISTANCE_THRESHOLD) {
        await query(
          'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
          [userId, user.roll_number, user.section, 'Failed_Match', JSON.stringify({ ...location, face_similarity: +similarity.toFixed(4), face_distance: +faceDistance.toFixed(4) })]
        );
        return res.status(403).json({ message: 'IDENTITY FAILED: Face match failed.', details: 'Ensure you are in a well-lit area and looking directly at the camera.' });
     }

     // Success
     await query(
       'INSERT INTO attendance_logs (user_id, roll_number, section, status, location_data) VALUES ($1, $2, $3, $4, $5)',
       [userId, user.roll_number, user.section, 'Present', JSON.stringify({ ...location, face_similarity: +similarity.toFixed(4), face_distance: +faceDistance.toFixed(4) })]
     );

     res.json({ 
       message: 'Attendance Marked! Success.', 
       student: { name: user.full_name, rollNumber: user.roll_number }
     });
  } catch (error) {
    console.error('[CRITICAL_ERROR]:', error);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// Get Personal Attendance (Fixed Total Days logic)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM attendance_logs WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );
    
    // FIX: Calculate totalDays from ONLY valid active days (status = 'Present')
    const dayCountResult = await query('SELECT COUNT(DISTINCT ("timestamp" AT TIME ZONE \'Asia/Kolkata\')::date) as count FROM attendance_logs WHERE status = \'Present\'');
    const totalDays = parseInt(dayCountResult.rows[0].count) || 1; 

    const statsByDate = {};
    result.rows.forEach(log => {
      if (log.status !== 'Present') return;
      const istTime = new Date(new Date(log.timestamp).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const dateStr = istTime.toISOString().split('T')[0];
      const hour = istTime.getHours();
      const session = hour < 12 ? 'morning' : 'afternoon';
      if (!statsByDate[dateStr]) statsByDate[dateStr] = { morning: false, afternoon: false };
      statsByDate[dateStr][session] = true;
    });

    const presentDays = Object.values(statsByDate).reduce((acc, day) => {
      if (day.morning && day.afternoon) return acc + 1;
      if (day.morning || day.afternoon) return acc + 0.5;
      return acc;
    }, 0);
    const percentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    res.json({ logs: result.rows, stats: { percentage, present: presentDays, total: totalDays } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching history.' });
  }
});

// Get Session Status
router.get('/session', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT is_open, session_starts_at as starts_at, expires_at FROM portal_settings WHERE id = 1');
    let session = result.rows[0];
    if (session && session.is_open && session.expires_at && new Date() > new Date(session.expires_at)) {
      await query('UPDATE portal_settings SET is_open = false WHERE id = 1');
      session = { ...session, is_open: false };
    }
    res.json({ ...session, server_time: new Date() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch session status.' });
  }
});

module.exports = router;
