const express = require('express');
const { query } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// A GPS coordinate is only trusted when both values are real finite numbers
// within valid geographic ranges. Anything else (NaN, strings, out-of-range)
// would poison the Haversine math (NaN > max is false) and bypass the fence.
const isValidLocation = (location) =>
  !!location &&
  typeof location.lat === 'number' &&
  Number.isFinite(location.lat) &&
  typeof location.lng === 'number' &&
  Number.isFinite(location.lng) &&
  location.lat >= -90 && location.lat <= 90 &&
  location.lng >= -180 && location.lng <= 180;

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
  
  if (!isValidLocation(location)) {
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
     // Reject malformed coordinates up front (see isValidLocation above).
     if (!isValidLocation(location)) {
       return res.status(400).json({ message: 'IDENTITY FAILED: Invalid location data. Please retry with location enabled.' });
     }

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
     const { normalizeDescriptor, isValidDescriptor, compareDescriptors, FACE_DISTANCE_THRESHOLD } = require('../utils/faceUtils');

     // Stored templates may be a flat descriptor, a burst of samples, or an
     // object wrapper. Normalize everything to one flat descriptor.
     let storedEmbedding = user.face_embedding;
     if (typeof storedEmbedding === 'string') {
       try { storedEmbedding = JSON.parse(storedEmbedding); } catch (e) { }
     }
     const finalStored = normalizeDescriptor(storedEmbedding);
     const probe = normalizeDescriptor(face_descriptor);

     if (!finalStored) return res.status(400).json({ message: 'Face enrollment required. Please register your face first.' });
     if (!isValidDescriptor(finalStored)) {
       return res.status(403).json({ message: 'IDENTITY FAILED: Stored face data is invalid. Please re-enroll your face from the admin dashboard.' });
     }
     if (!isValidDescriptor(probe)) {
       return res.status(400).json({ message: 'IDENTITY FAILED: Face capture was invalid. Please retry in good lighting.' });
     }

     const faceDistance = compareDescriptors(finalStored, probe);
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

// Enroll (or re-enroll) the logged-in student's face template.
// This is the path admin-created accounts use to add their biometric profile,
// and it doubles as the re-enrollment flow after a biometric reset.
router.post('/enroll-face', authMiddleware, async (req, res) => {
  const { face_descriptor } = req.body;
  const userId = req.user.id;

  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can enroll a face template.' });
    }

    const { normalizeDescriptor, isValidDescriptor, compareDescriptors, FACE_DISTANCE_THRESHOLD } = require('../utils/faceUtils');
    const probe = normalizeDescriptor(face_descriptor);
    if (!isValidDescriptor(probe)) {
      return res.status(400).json({ message: 'Face capture was invalid. Please record a clear, well-lit video and try again.' });
    }

    // STRICT BIOMETRIC DEDUPLICATION: reject if this face is already enrolled
    // under another student's account.
    const allUsersResult = await query(
      'SELECT id, roll_number, face_embedding FROM users WHERE face_embedding IS NOT NULL AND id != $1 AND role = $2',
      [userId, 'student']
    );
    for (const existingUser of allUsersResult.rows) {
      let storedEmbedding = existingUser.face_embedding;
      if (typeof storedEmbedding === 'string') {
        try { storedEmbedding = JSON.parse(storedEmbedding); } catch (e) { }
      }
      const stored = normalizeDescriptor(storedEmbedding);
      if (!isValidDescriptor(stored)) continue;

      const faceDistance = compareDescriptors(stored, probe);
      if (faceDistance <= FACE_DISTANCE_THRESHOLD) {
        console.warn(`[SECURITY] Blocked face enrollment. Matches existing roll: ${existingUser.roll_number} (Dist: ${faceDistance.toFixed(3)})`);
        return res.status(400).json({
          message: `BIOMETRIC CONFLICT: This face is already enrolled under Roll Number ${existingUser.roll_number}. Duplicate physical registrations are strictly prohibited.`
        });
      }
    }

    const result = await query(
      'UPDATE users SET face_embedding = $1 WHERE id = $2 RETURNING face_embedding IS NOT NULL as has_face',
      [JSON.stringify(probe), userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    res.json({ message: 'Face enrollment saved successfully.', hasFace: true });
  } catch (error) {
    console.error('ENROLL_FACE_ERROR:', error);
    res.status(500).json({ message: 'Server error during face enrollment.' });
  }
});

// Get Personal Attendance (Fixed Total Days logic)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM attendance_logs WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );

    // Face-enrollment status so the dashboard can prompt when biometrics are missing.
    const userResult = await query('SELECT face_embedding IS NOT NULL as has_face, branch FROM users WHERE id = $1', [req.user.id]);
    const userMeta = userResult.rows[0] || { has_face: false, branch: null };

    // Total class days = distinct IST dates on which ANY student in the same
    // branch was marked Present. This is more accurate than a global count.
    const dayCountResult = await query(
      `SELECT COUNT(DISTINCT (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date) as count
       FROM attendance_logs al JOIN users u ON al.user_id = u.id
       WHERE al.status = 'Present' AND u.branch = $1`,
      [userMeta.branch]
    );
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

    res.json({ logs: result.rows, hasFace: !!userMeta.has_face, stats: { percentage, present: presentDays, total: totalDays } });
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
