const express = require('express');
const { query } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const router = express.Router();

// Registration
router.post('/register', async (req, res) => {
  console.log('--- REGISTRATION REQUEST START ---');
  console.log('Body:', { ...req.body, images: req.body.images ? `${req.body.images.length} frames` : 'none' });
  
  let { full_name, roll_number, section, branch, college_email, password, role, face_embedding, image } = req.body;
  
  // Normalize role
  const normalizedRole = (role || 'student').toLowerCase().trim();

  // Handle minimal admin registration data
  if (normalizedRole === 'admin') {
    if (!full_name) full_name = college_email;
    roll_number = roll_number || null;
    section = section || null;
    branch = branch || null;
  }

  // Safety: If section has hyphen (e.g. CSE-A) and branch is missing, decouple them
  if (section && section.includes('-') && !branch) {
    const parts = section.split('-');
    branch = parts[0];
    section = parts[1];
  }

  // Domain validation (skip for admins)
  const emailLower = college_email.toLowerCase().trim();
  const collegeDomain = (process.env.COLLEGE_DOMAIN || '@raghuenggcollege.in').toLowerCase();
  
  if (normalizedRole === 'student' && !emailLower.endsWith(collegeDomain)) {
    console.log('Domain validation failed for student');
    return res.status(400).json({ message: `Only ${collegeDomain} emails are allowed for students.` });
  }

  try {
    let finalEmbedding = face_descriptor; // Accept direct descriptor from client
    
    console.log('Registering user role:', normalizedRole, 'Email:', emailLower);

    if (!finalEmbedding && normalizedRole === 'student') {
      console.log('Face validation failed for student');
      return res.status(400).json({ message: 'Face enrollment is required for students. Please record a short video.' });
    }

    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Inserting user into database...');
    const result = await query(
      'INSERT INTO users (full_name, roll_number, section, branch, college_email, password_hash, role, face_embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, full_name, roll_number, section, branch, role',
      [full_name, roll_number, section, branch, emailLower, hashedPassword, normalizedRole, JSON.stringify(finalEmbedding)]
    );

    console.log('User registered successfully');
    res.status(201).json({ user: result.rows[0], message: 'User registered successfully' });
  } catch (error) {
    console.error('REGISTRATION_ERROR:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await query('SELECT * FROM users WHERE college_email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, full_name: user.full_name, role: user.role, email: user.college_email },
      token, // Also send token for frontend convenience if needed
      message: 'Logged in successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
