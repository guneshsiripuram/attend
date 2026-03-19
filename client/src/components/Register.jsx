import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Webcam from 'react-webcam';
import { User, Mail, Lock, UserPlus, AlertCircle, Camera, CheckCircle, Loader2 } from 'lucide-react';
import { BRANCHES, SECTIONS, COLLEGE_DOMAIN } from '../constants';


const Register = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    roll_number: '',
    branch: '',
    section: '',
    college_email: '',
    password: '',
    role: 'student'
  });
  const [isRecording, setIsRecording] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const webcamRef = useRef(null);
  const recordingTimer = useRef(null);
  const navigate = useNavigate();

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: "user"
  };

  const onUserMedia = () => {
    setIsCameraReady(true);
    setCameraError('');
  };

  const onUserMediaError = (err) => {
    console.error("Camera Error:", err);
    setIsCameraReady(false);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setCameraError('Camera access denied. Please allow camera permissions in your browser settings.');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      setCameraError('No camera found on this device.');
    } else {
      setCameraError('Could not access camera. Please check if it is being used by another app.');
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setCapturedFrames([]);
    let count = 0;
    
    recordingTimer.current = setInterval(() => {
      if (count < 10) {
        const frame = webcamRef.current.getScreenshot();
        if (frame) {
          setCapturedFrames(prev => [...prev, frame]);
        }
        count++;
      } else {
        stopRecording();
      }
    }, 500); // Capture frame every 500ms
  };

  const stopRecording = () => {
    clearInterval(recordingTimer.current);
    setIsRecording(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const currentRole = formData.role.toLowerCase();
    if (currentRole === 'student' && capturedFrames.length < 5) {
      setError('Please record a short video of your face (at least 5 frames) for registration.');
      return;
    }

    const emailToTest = formData.college_email.trim().toLowerCase();
    const isSpecialAdmin = currentRole === 'admin' && emailToTest === 'raghumail';
    const isDomainOk = emailToTest.endsWith(COLLEGE_DOMAIN.toLowerCase());
    
    if (currentRole === 'student' && !isDomainOk) {
      setError(`Only ${COLLEGE_DOMAIN} emails are allowed for students.`);
      return;
    }

    setLoading(true);
    try {
      const resp = await axios.post('/auth/register', {
        ...formData,
        images: capturedFrames 
      });

      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 animate-fade-in">
      <div className="glass p-8 rounded-3xl shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Create Account</h1>
          <p className="text-slate-500 mt-2">Join the secure attendance portal</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`grid grid-cols-1 ${formData.role === 'student' ? 'md:grid-cols-2' : ''} gap-8`}>
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold text-slate-700 mb-2">Personal Information</h3>
            {formData.role === 'student' && (
              <>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Full Name"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    required
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Roll Number (e.g. 24981A057E)"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                    value={formData.roll_number}
                    onChange={(e) => setFormData({...formData, roll_number: e.target.value.toUpperCase()})}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <select
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white appearance-none"
                      value={formData.branch}
                      onChange={(e) => setFormData({...formData, branch: e.target.value})}
                      required
                    >
                      <option value="" disabled>Branch</option>
                      {BRANCHES.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <select
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white appearance-none"
                      value={formData.section}
                      onChange={(e) => setFormData({...formData, section: e.target.value})}
                      required
                    >
                      <option value="" disabled>Section</option>
                      {SECTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Email or Admin ID"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                value={formData.college_email}
                onChange={(e) => setFormData({...formData, college_email: e.target.value})}
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
              />
            </div>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="role" 
                  value="student" 
                  checked={formData.role === 'student'} 
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                />
                <span className="text-sm">Student</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="role" 
                  value="admin" 
                  checked={formData.role === 'admin'} 
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                />
                <span className="text-sm">Admin (Faculty)</span>
              </label>
            </div>
          </div>

          {formData.role === 'student' && (
            <div className="flex flex-col items-center gap-4">
              <h3 className="font-semibold text-slate-700 self-start mb-2">Face Enrollment (Video)</h3>
              <div className="relative w-full aspect-video bg-slate-100 rounded-2xl overflow-hidden ring-2 ring-slate-200">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  onUserMedia={onUserMedia}
                  onUserMediaError={onUserMediaError}
                  className="w-full h-full object-cover"
                />
                
                {!isCameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100">
                    <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-2" />
                    <p className="text-sm text-slate-500 font-medium">Starting Camera...</p>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                      <Camera className="w-8 h-8 text-red-500" />
                    </div>
                    <h4 className="text-red-900 font-bold mb-2">Camera Access Blocked</h4>
                    <p className="text-sm text-red-600 mb-4">{cameraError}</p>
                    <button 
                      type="button"
                      onClick={() => window.location.reload()}
                      className="text-primary-600 font-bold text-sm hover:underline"
                    >
                      Try Refreshing Page
                    </button>
                  </div>
                )}

                {isCameraReady && isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full animate-pulse shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-xs font-bold uppercase">Recording: {capturedFrames.length}/10</span>
                  </div>
                )}
                {!isRecording && capturedFrames.length > 0 && (
                  <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full shadow-lg">
                    <span className="text-xs font-bold uppercase">Face Captured Successfully</span>
                  </div>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={loading}
                    className={`p-4 rounded-full shadow-lg transition-all flex items-center gap-2 px-6 font-bold ${
                      isRecording 
                        ? 'bg-red-500 text-white hover:bg-red-600' 
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    <Camera className="w-6 h-6" />
                    <span>{isRecording ? 'Stop Recording' : (capturedFrames.length > 0 ? 'Re-enroll Face' : 'Start Enrollment')}</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 italic text-center">
                Look straight and move your head slightly during the 5-second recording.
              </p>
            </div>
          )}

          <div className="md:col-span-2 mt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl shadow-xl shadow-primary-100 transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Creating Account...' : (
                <>
                  <UserPlus className="w-6 h-6" />
                  <span>Complete Registration</span>
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-slate-500 text-sm mt-8">
          Already have an account? <Link to="/login" className="text-primary-600 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

const XCircle = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
);

export default Register;
