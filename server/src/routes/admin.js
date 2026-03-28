const express = require('express');
const { query } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

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
    params.push(`%${branch}%`);
    q += ` AND u.branch ILIKE $${params.length}`;
  }
  if (section) {
    params.push(`%${section}%`);
    q += ` AND u.section ILIKE $${params.length}`;
  }
  if (email) {
    params.push(`%${email}%`);
    q += ` AND u.college_email ILIKE $${params.length}`;
  }
  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    
    params.push(startDate.toISOString().split('T')[0]);
    params.push(endDate.toISOString().split('T')[0]);
    q += ` AND al.timestamp >= $${params.length - 1} AND al.timestamp < $${params.length}`;
  }

  q += ` GROUP BY u.id, u.full_name, u.college_email, u.roll_number, u.section, u.branch, log_date, session`;
  q += ` ORDER BY timestamp DESC`;

  try {
    const result = await query(q, params);
    
    // Summary data
    const summaryResult = await query(`
      SELECT 
        COUNT(DISTINCT user_id) FILTER (WHERE status = 'Present') as presentToday,
        COUNT(DISTINCT user_id) as totalStudents
      FROM attendance_logs
      WHERE timestamp::date = CURRENT_DATE
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
  const targetDate = date || new Date().toISOString().split('T')[0];
  
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
        AND "timestamp"::date = $1
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
    params.push(`%${branch}%`);
    q += ` AND branch ILIKE $${params.length}`;
  }
  if (section) {
    params.push(`%${section}%`);
    q += ` AND section ILIKE $${params.length}`;
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
    // Note: We might want to keep logs or use CASCADE. Here we delete logs first.
    await query('DELETE FROM attendance_logs WHERE user_id = $1', [req.params.id]);
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
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
        (al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as date,
        COUNT(DISTINCT al.user_id) as present_count,
        json_agg(json_build_object(
          'id', al.id,
          'timestamp', al.timestamp,
          'status', al.status,
          'user_id', al.user_id,
          'full_name', u.full_name,
          'roll_number', u.roll_number,
          'email', u.college_email,
          'section', u.section,
          'branch', u.branch
        ) ORDER BY al.timestamp DESC) as present_records
      FROM attendance_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.status = 'Present'
      GROUP BY (al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY (al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date DESC
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
    const result = await query('SELECT is_open, session_starts_at as starts_at, expires_at FROM portal_settings WHERE id = 1');
    let session = result.rows[0];

    // Auto-expiration check in GET route to prevent desync
    if (session && session.is_open && session.expires_at && new Date() > new Date(session.expires_at)) {
      await query('UPDATE portal_settings SET is_open = false, session_starts_at = NULL, expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
      session = { ...session, is_open: false, starts_at: null, expires_at: null };
      console.log('--- SESSION AUTO-CLOSED (EXPIRED) ---');
    }

    // Attach current server time to help frontend calculate relative countdowns/status
    res.json({
        ...session,
        server_time: new Date()
    });
  } catch (err) {
    console.error('Session fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch session' });
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
      } else if (durationMinutes) {
        // Instant opening
        startsAt = new Date();
        expiresAt = new Date(Date.now() + durationMinutes * 60000);
      }
    }
    
    await query(
      "UPDATE portal_settings SET is_open = $1, session_starts_at = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      [isOpen, startsAt, expiresAt]
    );
    
    res.json({ message: `Attendance gate ${isOpen ? (startTime ? 'SCHEDULED' : 'OPEN') : 'CLOSED'}`, startsAt, expiresAt });
  } catch (error) {
    console.error('--- SESSION_TOGGLE_ERROR ---');
    console.error('Error details:', error.message);
    res.status(500).json({ 
      message: 'Error toggling session',
      error: error.message 
    });
  }
});

// Get Attendance Matrix (Pivot Table for Excel-style view)
router.get('/attendance/matrix', authMiddleware, adminMiddleware, async (req, res) => {
  const { branch, section, startDate, endDate } = req.query;
  
  try {
    // 1. Fetch Students
    let studentQ = `SELECT id, full_name, roll_number, branch, section FROM users WHERE role = 'student'`;
    const studentParams = [];
    if (branch) { studentParams.push(branch); studentQ += ` AND branch = $${studentParams.length}`; }
    if (section) { studentParams.push(section); studentQ += ` AND section = $${studentParams.length}`; }
    studentQ += ` ORDER BY roll_number ASC`;
    const studentsResult = await query(studentQ, studentParams);
    const students = studentsResult.rows;

    // 2. Fetch Logs in Range
    let logsQ = `
      SELECT 
        user_id, 
        (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as date,
        EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as hour
      FROM attendance_logs 
      WHERE status = 'Present'
    `;
    const logsParams = [];
    if (startDate) { logsParams.push(startDate); logsQ += ` AND (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $${logsParams.length}`; }
    if (endDate) { logsParams.push(endDate); logsQ += ` AND (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $${logsParams.length}`; }
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

module.exports = router;
