const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { isStrongPassword } = require('../utils/password');

const router = express.Router();

// Today's date in Asia/Kolkata (YYYY-MM-DD), so every "today" report uses the
// same timezone as the rest of the system.
const istToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const isValidLatLng = (lat, lng) => {
  const la = Number(lat), ln = Number(lng);
  return Number.isFinite(la) && la >= -90 && la <= 90 &&
         Number.isFinite(ln) && ln >= -180 && ln <= 180;
};

// Get All Attendance (Admin only)
router.get('/attendance/all', authMiddleware, adminMiddleware, async (req, res) => {
  console.log('--- ADMIN ATTENDANCE REQUEST ---');
  console.log('Query:', req.query);
  const { name, email, date, branch, section, rollNumber } = req.query;
  
  let q = `
    SELECT MAX(al.id) as id, MAX(al.timestamp) as timestamp, MAX(al.status) as status, 
           u.full_name, u.college_email, u.roll_number, u.section, u.branch,
           (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date as log_date,
           (CASE WHEN EXTRACT(HOUR FROM al.timestamp AT TIME ZONE 'Asia/Kolkata') < 12 THEN 'Morning' ELSE 'Afternoon' END) as session
    FROM attendance_logs al
    JOIN users u ON al.user_id = u.id
    WHERE al.status = 'Present'
  `;
  const params = [];

  if (name) {
    params.push(`%${name}%`);
    q += ` AND (u.full_name ILIKE $${params.length} OR u.roll_number ILIKE $${params.length})`;
  }
  if (rollNumber) {
    params.push(`%${rollNumber}%`);
    q += ` AND u.roll_number ILIKE $${params.length}`;
  }
  if (branch) {
    params.push(branch);
    q += ` AND u.branch = $${params.length}`;
  }
  if (section) {
    params.push(section);
    q += ` AND u.section = $${params.length}`;
  }
  if (email) {
    params.push(`%${email}%`);
    q += ` AND u.college_email ILIKE $${params.length}`;
  }
  if (date) {
    params.push(date);
    q += ` AND (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date = $${params.length}`;
  }

  q += ` GROUP BY u.id, u.full_name, u.college_email, u.roll_number, u.section, u.branch, log_date, session`;
  q += ` ORDER BY timestamp DESC`;

  try {
    const result = await query(q, params);
    
    // Summary data
    const summaryResult = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'student')::int as "totalstudents",
        (SELECT COUNT(DISTINCT user_id) FROM attendance_logs WHERE (timestamp AT TIME ZONE 'Asia/Kolkata')::date = CURRENT_DATE AND status = 'Present')::int as "presenttoday"
    `);

    res.json({ 
      data: result.rows,
      summary: summaryResult.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching admin data' });
  }
});

// Get Live Class Roster (Virtual Approach: Users LEFT JOIN Logs)
router.get('/attendance/roster', authMiddleware, adminMiddleware, async (req, res) => {
  const { date, branch, section } = req.query;
  // Default to IST today so the roster matches the attendance records' timezone.
  const targetDate = date || istToday();
  
  let q = `
    SELECT 
      u.id, 
      u.full_name, 
      u.roll_number, 
      u.college_email,
      u.branch, 
      u.section,
      al.status,
      al.timestamp
    FROM users u
    LEFT JOIN LATERAL (
      SELECT status, timestamp 
      FROM attendance_logs 
      WHERE user_id = u.id 
        AND (timestamp AT TIME ZONE 'Asia/Kolkata')::date = $1
      ORDER BY 
        CASE WHEN status = 'Present' THEN 1 ELSE 2 END,
        "timestamp" DESC
      LIMIT 1
    ) al ON true
    WHERE u.role = 'student'
  `;
  const params = [targetDate];

  if (branch) {
    params.push(branch);
    q += ` AND u.branch = $${params.length}`;
  }
  if (section) {
    params.push(section);
    q += ` AND u.section = $${params.length}`;
  }

  q += ` ORDER BY u.roll_number ASC`;

  try {
    const result = await query(q, params);
    
    // Calculate summary stats
    const totalEnrolled = result.rows.length;
    const presentCount = result.rows.filter(r => r.status === 'Present').length;
    const absentCount = totalEnrolled - presentCount;

    res.json({ 
      data: result.rows,
      summary: { totalEnrolled, presentCount, absentCount }
    });
  } catch (error) {
    console.error('[ROSTER_API_ERROR]:', error);
    res.status(500).json({ message: 'Server error fetching live roster' });
  }
});

// Get All Students (Manage Students Registry)
router.get('/students', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, rollNumber, branch, section } = req.query;
  
  let q = `SELECT id, full_name, roll_number, section, branch, college_email, role, 
            (face_embedding IS NOT NULL) as has_face_data 
           FROM users 
           WHERE role = 'student'`;
  const params = [];

  if (name) {
    params.push(`%${name}%`);
    q += ` AND full_name ILIKE $${params.length}`;
  }
  if (rollNumber) {
    params.push(`%${rollNumber}%`);
    q += ` AND roll_number ILIKE $${params.length}`;
  }
  if (branch) {
    params.push(branch);
    q += ` AND branch = $${params.length}`;
  }
  if (section) {
    params.push(section);
    q += ` AND section = $${params.length}`;
  }

  q += ` ORDER BY full_name ASC`;

  try {
    const result = await query(q, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Create Student (admin). Unlike the self-service /auth/register endpoint,
// an admin-created account does NOT require a face template yet — the student
// enrolls their face later from their own dashboard.
router.post('/students', authMiddleware, adminMiddleware, async (req, res) => {
  const { full_name, roll_number, branch, section, college_email, password } = req.body;

  if (!full_name || !roll_number || !branch || !section || !college_email) {
    return res.status(400).json({ message: 'Full name, roll number, branch, section and college email are required.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters, contain a letter and a number, and not be a common password.' });
  }

  const emailLower = college_email.toLowerCase().trim();
  const collegeDomain = (process.env.COLLEGE_DOMAIN || '@raghuenggcollege.in').toLowerCase();
  if (!emailLower.endsWith(collegeDomain)) {
    return res.status(400).json({ message: `Only ${collegeDomain} emails are allowed for students.` });
  }

  try {
    const duplicateCheck = await query(
      'SELECT college_email, roll_number FROM users WHERE college_email = $1 OR roll_number = $2',
      [emailLower, roll_number]
    );
    if (duplicateCheck.rows.length > 0) {
      const dup = duplicateCheck.rows[0];
      if (dup.college_email === emailLower) {
        return res.status(400).json({ message: 'An account with this college email is already registered.' });
      }
      return res.status(400).json({ message: `The Roll Number ${roll_number} is already registered to another student account.` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (full_name, roll_number, branch, section, college_email, password_hash, role, face_embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) RETURNING id, full_name, roll_number, branch, section, college_email, role',
      [full_name, roll_number, branch, section, emailLower, hashedPassword, 'student']
    );
    res.status(201).json({ user: result.rows[0], message: 'Student account created successfully.' });
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'A student with this email or roll number already exists.' });
    }
    res.status(500).json({ message: 'Server error creating student.' });
  }
});

// Reset Face Enrollment
router.post('/students/:id/reset-face', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await query('UPDATE users SET face_embedding = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Face enrollment reset successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to reset face data' });
  }
});

// Delete Student
router.delete('/students/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await query('BEGIN');
    await query('DELETE FROM attendance_logs WHERE user_id = $1', [req.params.id]);
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    await query('COMMIT');
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    await query('ROLLBACK');
    console.error(error);
    res.status(500).json({ message: 'Failed to delete student' });
  }
});

// Get Attendance History grouped by day
router.get('/attendance/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get total student count
    const registryCountResult = await query("SELECT COUNT(*) FROM users WHERE role = 'student'");
    const totalStudents = parseInt(registryCountResult.rows[0].count);

    const q = `
      SELECT 
        date,
        COUNT(*) as present_count,
        json_agg(json_build_object(
          'id', id,
          'timestamp', timestamp,
          'status', status,
          'user_id', user_id,
          'full_name', full_name,
          'roll_number', roll_number,
          'email', college_email,
          'section', section,
          'branch', branch
        ) ORDER BY timestamp DESC) as present_records
      FROM (
        SELECT DISTINCT ON (al.user_id, (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date)
          al.id, al.timestamp, al.status, al.user_id,
          u.full_name, u.roll_number, u.college_email, u.section, u.branch,
          (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date as date
        FROM attendance_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.status = 'Present'
        ORDER BY al.user_id, (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date, al.timestamp DESC
      ) unique_logs
      GROUP BY date
      ORDER BY date DESC
    `;
    const result = await query(q);

    // Get all students to help identify absentees on the frontend
    const allStudentsResult = await query("SELECT id, full_name, roll_number, section, branch FROM users WHERE role = 'student'");
    
    res.json({ 
      data: result.rows,
      totalStudents,
      allStudents: allStudentsResult.rows
    });
  } catch (error) {
    console.error('HISTORY_API_ERROR:', error);
    res.status(500).json({ message: 'Error fetching attendance history' });
  }
});

// Session Gate Controls (GET allowed for all auth users, POST for admins only)
router.get('/session', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT is_open, session_starts_at as starts_at, expires_at, campus_lat, campus_lng, max_distance_meters FROM portal_settings WHERE id = 1');
    let session = result.rows[0];

    // Auto-expiration check in GET route to prevent desync
    if (session && session.is_open && session.expires_at && new Date() > new Date(session.expires_at)) {
      await query('UPDATE portal_settings SET is_open = false, session_starts_at = NULL, expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
      session = { ...session, is_open: false, starts_at: null, expires_at: null };
      console.log('--- SESSION AUTO-CLOSED (EXPIRED) ---');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
        ...session,
        server_time: new Date()
    });
  } catch (err) {
    console.error('Session fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
});

// Update Location Settings
router.post('/session/location', authMiddleware, adminMiddleware, async (req, res) => {
  const { lat, lng, radius } = req.body;
  if (!isValidLatLng(lat, lng)) {
    return res.status(400).json({ message: 'Invalid latitude/longitude. Latitude must be between -90 and 90, longitude between -180 and 180.' });
  }
  const maxDistance = parseInt(radius, 10);
  if (!Number.isFinite(maxDistance) || maxDistance < 10 || maxDistance > 50000) {
    return res.status(400).json({ message: 'Max distance must be a number between 10 and 50000 meters.' });
  }
  try {
    await query(
      "UPDATE portal_settings SET campus_lat = $1, campus_lng = $2, max_distance_meters = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      [Number(lat), Number(lng), maxDistance]
    );
    res.json({ message: 'Geolocation settings updated successfully' });
  } catch (error) {
    console.error('LOCATION_UPDATE_ERROR:', error);
    res.status(500).json({ message: 'Error updating geolocation settings' });
  }
});

// Toggle Session (Open/Close / Schedule)
router.post('/session/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  const { isOpen, durationMinutes, startTime, endTime } = req.body;
  try {
    let startsAt = null;
    let expiresAt = null;

    if (isOpen) {
      if (startTime && endTime) {
        // Scheduled future session
        startsAt = new Date(startTime);
        expiresAt = new Date(endTime);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
          return res.status(400).json({ message: 'Invalid schedule times.' });
        }
        if (expiresAt <= startsAt) {
          return res.status(400).json({ message: 'Session end time must be after the start time.' });
        }
      } else if (durationMinutes) {
        // Instant opening
        const minutes = parseInt(durationMinutes, 10);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
          return res.status(400).json({ message: 'Duration must be between 1 and 1440 minutes.' });
        }
        startsAt = new Date();
        expiresAt = new Date(Date.now() + minutes * 60000);
      } else {
        return res.status(400).json({ message: 'Provide either a duration or a scheduled start/end window.' });
      }
    }

    await query(
      "UPDATE portal_settings SET is_open = $1, session_starts_at = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      [isOpen, startsAt, expiresAt]
    );

    res.json({
      message: `Attendance gate ${isOpen ? (startTime ? 'SCHEDULED' : 'OPEN') : 'CLOSED'}`,
      startsAt,
      expiresAt,
      serverTime: new Date(),
      isOpen
    });
  } catch (error) {
    console.error('--- SESSION_TOGGLE_ERROR ---');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);

    res.status(500).json({
      message: 'Error toggling session'
    });
  }
});

// Get Attendance Matrix (Pivot Table for Excel-style view)
router.get('/attendance/matrix', authMiddleware, adminMiddleware, async (req, res) => {
  const { branch, section, startDate, endDate, rollNumber } = req.query;
  
  try {
    // 1. Fetch Students
    let studentQ = `SELECT id, full_name, roll_number, branch, section FROM users WHERE role = 'student'`;
    const studentParams = [];
    if (branch) { studentParams.push(branch); studentQ += ` AND branch = $${studentParams.length}`; }
    if (section) { studentParams.push(section); studentQ += ` AND section = $${studentParams.length}`; }
    if (rollNumber) { 
      studentParams.push(`%${rollNumber}%`); 
      studentQ += ` AND roll_number ILIKE $${studentParams.length}`; 
    }
    studentQ += ` ORDER BY roll_number ASC`;
    const studentsResult = await query(studentQ, studentParams);
    const students = studentsResult.rows;

    // 2. Fetch Logs in Range
    let logsQ = `
      SELECT 
        user_id, 
        (timestamp AT TIME ZONE 'Asia/Kolkata')::date as date,
        EXTRACT(HOUR FROM timestamp AT TIME ZONE 'Asia/Kolkata') as hour
      FROM attendance_logs 
      WHERE status = 'Present'
    `;
    const logsParams = [];
    if (startDate) { logsParams.push(startDate); logsQ += ` AND (timestamp AT TIME ZONE 'Asia/Kolkata')::date >= $${logsParams.length}`; }
    if (endDate) { logsParams.push(endDate); logsQ += ` AND (timestamp AT TIME ZONE 'Asia/Kolkata')::date <= $${logsParams.length}`; }
    const logsResult = await query(logsQ, logsParams);

    // 3. Process Matrix
    const matrix = {};
    const uniqueDates = new Set();

    // Ensure today's date is included if it's within range
    const todayIST = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Kolkata', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).format(new Date());
    
    if ((!startDate || todayIST >= startDate) && (!endDate || todayIST <= endDate)) {
      uniqueDates.add(todayIST);
    }

    logsResult.rows.forEach(log => {
      const dateStr = new Date(log.date).toISOString().split('T')[0];
      uniqueDates.add(dateStr);
      
      if (!matrix[log.user_id]) matrix[log.user_id] = {};
      if (!matrix[log.user_id][dateStr]) matrix[log.user_id][dateStr] = { morning: false, afternoon: false };
      
      if (log.hour < 12) matrix[log.user_id][dateStr].morning = true;
      else matrix[log.user_id][dateStr].afternoon = true;
    });

    const sortedDates = Array.from(uniqueDates).sort();

    // 4. Format for Frontend
    const rows = students.map((s, idx) => {
      const attendance = {};
      sortedDates.forEach(d => {
        const stat = matrix[s.id]?.[d];
        if (!stat) attendance[d] = '-';
        else if (stat.morning && stat.afternoon) attendance[d] = 'P';
        else if (stat.morning) attendance[d] = 'M';
        else if (stat.afternoon) attendance[d] = 'A';
      });
      return {
        sn: idx + 1,
        id: s.id,
        name: s.full_name,
        roll: s.roll_number,
        branch: s.branch,
        section: s.section,
        attendance
      };
    });

    res.json({ dates: sortedDates, rows });
  } catch (error) {
    console.error('[MATRIX_API_ERROR]:', error);
    res.status(500).json({ message: 'Error generating attendance matrix' });
  }
});

// System Health Check
router.get('/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const dbCheck = await query('SELECT 1 as is_alive');
    const logsCount = await query('SELECT COUNT(*) FROM attendance_logs');
    const usersCount = await query('SELECT COUNT(*) FROM users');
    
    res.json({
      status: 'operational',
      database: dbCheck.rows[0].is_alive === 1 ? 'connected' : 'error',
      metrics: {
        total_logs: parseInt(logsCount.rows[0].count),
        total_users: parseInt(usersCount.rows[0].count)
      },
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

module.exports = router;
