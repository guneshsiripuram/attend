require('dotenv').config(); // v1.0.1 Deploy
const express = require('express'); // v1.0.1 Auth Fix
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'COLLEGE_DOMAIN', 'CAMPUS_LAT', 'CAMPUS_LNG', 'MAX_DISTANCE_METERS', 'GOOGLE_CLIENT_ID'];

const missingEnv = REQUIRED_ENV.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`CRITICAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // 1. Allow internal requests (no origin)
    if (!origin) return callback(null, true);
    
    // 2. Define known valid origins (including current frontend)
    const validOrigins = [
      'http://localhost:5173',
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Attendance Portal Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// Final check 
