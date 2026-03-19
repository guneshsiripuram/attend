require('dotenv').config();
const express = require('express');
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
    if (!origin) return callback(null, true);
    
    // Normalize origins for comparison
    const formattedOrigin = origin.replace(/\/$/, "");
    const formattedAllowed = allowedOrigins.map(o => o.replace(/\/$/, ""));

    if (formattedAllowed.indexOf(formattedOrigin) === -1) {
      const msg = `CORS Error: Origin ${origin} not allowed. Approved: ${allowedOrigins.join(', ')}`;
      console.error(msg);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
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
