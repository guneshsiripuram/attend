const express = require('express'); // v1.0.1 Auth Ready
const { query } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// Google Login
router.post('/google-login', async (req, res) => {
  const { token, credential } = req.body;
  const idToken = token || credential;

  if (!idToken) {
    return res.status(400).json({ message: 'Google token is required' });
  }
  
  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    const { email, name, sub: googleId, picture } = payload;
    const emailLower = email.toLowerCase().trim();

    // Domain validation (skip for admins)
    const collegeDomain = (process.env.COLLEGE_DOMAIN || '@raghuenggcollege.in').toLowerCase();
    
    // Check if user exists
    let userResult = await query('SELECT * FROM users WHERE college_email = $1', [emailLower]);
    let user;

    if (userResult.rows.length === 0) {
      // Auto-register new user
      // Role is student by default
      if (!emailLower.endsWith(collegeDomain)) {
         return res.status(400).json({ message: `Only ${collegeDomain} emails are allowed.` });
      }

      console.log('Auto-registering new student from Google:', emailLower);
      const newUser = await query(
        'INSERT INTO users (full_name, college_email, role, face_embedding) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, emailLower, 'student', null]
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      user: { 
        id: user.id, 
        full_name: user.full_name, 
        role: user.role, 
        email: user.college_email,
        hasFace: !!user.face_embedding,
        picture
      },
      token,
      message: 'Logged in with Google'
    });

  } catch (error) {
    console.error('--- GOOGLE_AUTH_DETAILED_ERROR ---');
    console.error('Message:', error.message);
    console.error('Used Client ID:', process.env.GOOGLE_CLIENT_ID);
    res.status(401).json({ 
      message: 'Invalid Google token', 
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Registration
router.post('/register', async (req, res) => {
  console.log('--- REGISTRATION REQUEST START ---');
  console.log('Body:', { ...req.body, images: req.body.images ? `${req.body.images.length} frames` : 'none' });
  
  let { full_name, roll_number, section, branch, college_email, password, role, face_descriptor, face_embedding, image } = req.body;
  
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

// Complete Profile (for Google Users)
router.post('/complete-profile', async (req, res) => {
  const { roll_number, section, branch, face_descriptor, email } = req.body;
  
  try {
    console.log('Completing profile for:', email);
    const result = await query(
      'UPDATE users SET roll_number = $1, section = $2, branch = $3, face_embedding = $4 WHERE college_email = $5 RETURNING *',
      [roll_number, section, branch, JSON.stringify(face_descriptor), email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      user: result.rows[0], 
      message: 'Profile completed successfully' 
    });
  } catch (error) {
    console.error('COMPLETE_PROFILE_ERROR:', error);
    res.status(500).json({ message: 'Server error during profile completion' });
  }
});

module.exports = router;
