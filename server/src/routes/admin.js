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
    SELECT al.id, al.timestamp, al.status, u.full_name, u.college_email, u.roll_number, u.section, u.branch
    FROM attendance_logs al
    JOIN users u ON al.user_id = u.id
    WHERE 1=1
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

  q += ` ORDER BY al.timestamp DESC`;

  try {
    const result = await query(q, params);
    
    // Summary data
    const summaryResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Present') as presentToday,
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
        DATE(al.timestamp) as date,
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
      GROUP BY DATE(al.timestamp)
      ORDER BY DATE(al.timestamp) DESC
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

module.exports = router;
