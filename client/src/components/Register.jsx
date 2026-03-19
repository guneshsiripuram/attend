import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import Webcam from 'react-webcam';
import { User, Mail, Lock, UserPlus, AlertCircle, Camera, CheckCircle, Loader2, PartyPopper } from 'lucide-react';
import { BRANCHES, SECTIONS } from '../constants';
import FaceService from '../services/FaceService';

const Register = () => {
  const location = useLocation();
  const googleUser = location.state?.googleUser;

  const [formData, setFormData] = useState({
    full_name: googleUser?.full_name || '',
    roll_number: '',
    branch: '',
    section: '',
    college_email: googleUser?.email || '',
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

  useEffect(() => {
    FaceService.loadModels().then(() => setIsCameraReady(true));
  }, []);

  const onUserMedia = () => {
    setIsCameraReady(true);
    setCameraError('');
  };

  const onUserMediaError = (err) => {
    console.error("Camera Error:", err);
    setIsCameraReady(false);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setCameraError('Camera access denied. Please allow camera permissions.');
    } else {
      setCameraError('Could not access camera.');
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
    }, 500); 
  };

  const stopRecording = () => {
    clearInterval(recordingTimer.current);
    setIsRecording(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (formData.role === 'student' && capturedFrames.length < 5) {
      setError('Face enrollment is mandatory for students. Please record a short video.');
      return;
    }

    setLoading(true);
    try {
      let face_descriptor = null;

      if (formData.role === 'student') {
        const descriptors = [];
        for (const frame of capturedFrames) {
          const desc = await FaceService.getDescriptorFromBase64(frame);
          if (desc) descriptors.push(desc);
        }

        if (descriptors.length === 0) {
          throw new Error('No face detected. Please try again with better lighting.');
        }
        face_descriptor = FaceService.averageDescriptors(descriptors);
      }

      if (googleUser) {
        await axios.post('/auth/complete-profile', {
          email: googleUser.email,
          roll_number: formData.roll_number,
          branch: formData.branch,
          section: formData.section,
          face_descriptor
        });
        setSuccess('Profile completed! Redirecting to Dashboard...');
        setTimeout(() => navigate('/student'), 2000);
      } else {
        await axios.post('/auth/register', {
          ...formData,
          face_descriptor 
        });
        setSuccess('Account created! Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 animate-fade-in px-4">
      <div className="glass p-10 rounded-3xl shadow-2xl flex flex-col gap-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {googleUser ? <PartyPopper className="w-8 h-8 text-primary-600" /> : <UserPlus className="w-8 h-8 text-primary-600" />}
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {googleUser ? 'Finish Enrollment' : 'Create Account'}
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            {googleUser ? 'Just a few more details to activate your account' : 'Join the secure attendance portal'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs font-bold">{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs font-bold">{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`grid grid-cols-1 ${formData.role === 'student' ? 'md:grid-cols-2' : ''} gap-10`}>
          <div className="flex flex-col gap-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Identification</h3>
            
            {!googleUser ? (
              <>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Full Name"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    required
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="College Email"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    value={formData.college_email}
                    onChange={(e) => setFormData({...formData, college_email: e.target.value})}
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Password"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>
              </>
            ) : (
              <div className="p-5 bg-primary-50 rounded-2xl border border-primary-100">
                <p className="text-[10px] font-black text-primary-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" /> Authenticated via Google
                </p>
                <p className="font-bold text-slate-800">{googleUser.full_name}</p>
                <p className="text-xs text-slate-500">{googleUser.email}</p>
              </div>
            )}

            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Roll Number (e.g. 24981A057E)"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none transition-all uppercase"
                value={formData.roll_number}
                onChange={(e) => setFormData({...formData, roll_number: e.target.value.toUpperCase()})}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                value={formData.branch}
                onChange={(e) => setFormData({...formData, branch: e.target.value})}
                required
              >
                <option value="" disabled>Branch</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                value={formData.section}
                onChange={(e) => setFormData({...formData, section: e.target.value})}
                required
              >
                <option value="" disabled>Section</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {!googleUser && (
              <div className="flex gap-6 mt-2 p-4 bg-slate-50 rounded-2xl">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="student" checked={formData.role === 'student'} onChange={(e) => setFormData({...formData, role: e.target.value})} className="accent-primary-600" />
                  <span className="text-sm font-bold text-slate-600">Student</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="admin" checked={formData.role === 'admin'} onChange={(e) => setFormData({...formData, role: e.target.value})} className="accent-primary-600" />
                  <span className="text-sm font-bold text-slate-600">Admin</span>
                </label>
              </div>
            )}
          </div>

          {formData.role === 'student' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Face Enrollment</h3>
              <div className="relative w-full aspect-square bg-slate-100 rounded-3xl overflow-hidden ring-4 ring-slate-50 group">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  onUserMedia={onUserMedia}
                  onUserMediaError={onUserMediaError}
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                
                {!isCameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
                    <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                    <p className="text-sm font-bold text-slate-500">Initializing Optics...</p>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 p-8 text-center z-20">
                    <Camera className="w-12 h-12 text-red-500 mb-4" />
                    <p className="text-red-900 font-bold mb-4">{cameraError}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-100 text-red-600 rounded-full font-bold text-xs hover:bg-red-200">Restart Hardware</button>
                  </div>
                )}

                {isCameraReady && isRecording && (
                  <div className="absolute top-6 left-6 flex items-center gap-3 bg-red-500 text-white px-4 py-2 rounded-2xl animate-pulse shadow-2xl z-30">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-[10px] font-black uppercase">Recording: {capturedFrames.length}/10</span>
                  </div>
                )}
                
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={loading}
                    className={`py-4 px-8 rounded-2xl shadow-2xl transition-all flex items-center gap-3 font-black text-sm uppercase tracking-wider ${
                      isRecording 
                        ? 'bg-red-500 text-white hover:bg-red-600' 
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    <Camera className="w-5 h-5" />
                    <span>{isRecording ? 'Stop' : (capturedFrames.length > 0 ? 'Retry Enrollment' : 'Start Enrollment')}</span>
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold text-center italic">
                Secure biometric data will be encrypted and stored for authentication only.
              </p>
            </div>
          )}

          <div className="md:col-span-2 pt-6">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-2xl shadow-2xl shadow-primary-200 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>{googleUser ? 'Activate Account' : 'Create Account'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-slate-400 text-xs font-bold">
          Already verified? <Link to="/login" className="text-primary-600 hover:underline px-1">Sign In</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
