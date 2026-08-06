require('dotenv').config();
const express = require('express');
const { initDB } = require('./db');
initDB(); // Initialize table
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'COLLEGE_DOMAIN', 'GOOGLE_CLIENT_ID'];

const missingEnv = REQUIRED_ENV.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`CRITICAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Trust the Render proxy so express-rate-limit and req.ip see real client IPs.
app.set('trust proxy', 1);

// Security headers. The API only serves JSON + static model files, so the
// content-security-policy is handled on the frontend (Vercel headers) instead.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // 1. Allow internal requests (no origin)
    if (!origin) return callback(null, true);
    
    // 2. Define known valid origins (including current frontend)
    const validOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://stdatd.vercel.app',
      'https://stdatd.netlify.app',
      'https://stdadt.netlify.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    // 3. Normalize for trailing slashes
    const formattedOrigin = origin.replace(/\/$/, "");
    const formattedAllowed = validOrigins.map(o => String(o).replace(/\/$/, ""));

    // 4. Check for match
    if (formattedAllowed.includes(formattedOrigin)) {
      return callback(null, true);
    }

    // 5. Fallback: Log mismatch but don't crash (return false instead of Error)
    console.error(`CORS Mismatch: ${origin} not in [${validOrigins.join(', ')}]`);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Static models
app.use('/models', express.static(path.join(__dirname, '../models')));

// Rate limiting: slow down credential-guessing on auth endpoints.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait a few minutes and try again.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many registration attempts from this device. Please try again later.' }
});

const genericAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
});

// Routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/google-login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', genericAuthLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Attendance Portal Backend is running' });
});

// 404 Handler - Catch all for debugging
app.use((req, res) => {
  console.log(`[404] Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    message: 'Endpoint not found', 
    requestedPath: req.url,
    method: req.method 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// Final check 
