-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    college_email VARCHAR(255) UNIQUE NOT NULL CHECK (college_email LIKE '%@raghuenggcollege.in'),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    face_embedding JSONB, -- Stores the 128D/512D vector as a JSON array
    roll_number VARCHAR(50) UNIQUE,
    section VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Attendance Logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    roll_number VARCHAR(50), -- Roll number entered at the time of attendance
    section VARCHAR(20), -- Section entered at the time of attendance
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Present', 'Failed_Match', 'Failed_Location', 'Pending', 'Failed_Roll', 'Failed_Liveness')),
    location_data JSONB -- Stores lat/lng for verification
);

-- Create an index for faster attendance queries
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp);
