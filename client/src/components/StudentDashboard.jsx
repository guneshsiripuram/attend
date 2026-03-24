import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, MapPin, CheckCircle, XCircle, Loader2, Calendar, Percent, Shield, Clock, Lock, ShieldCheck } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BRANCHES, SECTIONS } from '../constants';
import FaceService from '../services/FaceService';

const StudentDashboard = ({ user }) => {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState('idle'); // idle, challenge, success, failed
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ percentage: 0, present: 0, total: 0 });
  const [currLocation, setCurrLocation] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const autoVerifyTimeout = useRef(null);
  
  // Session Gates
  const [session, setSession] = useState({ is_open: false, expires_at: null, starts_at: null, server_time: null });
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0); // Offset in ms: ServerTime - LocalTime

  console.log('StudentDashboard rendering, user:', user?.email);

  const fetchHistory = useCallback(async () => {
    try {
      const resp = await axios.get('/attendance/me');
      setHistory(resp.data.logs);
      setStats(resp.data.stats);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
    // Pre-fetch location to avoid delay during scanning
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, [fetchHistory]);

  // Periodic location refresh (every 60s)
  React.useEffect(() => {
    const locInterval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          setCurrLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      }
    }, 60000);
    return () => clearInterval(locInterval);
  }, []);

  const [isModelsLoaded, setIsModelsLoaded] = useState(false);

  const checkSession = async () => {
    console.log('Checking session...');
    const localBefore = Date.now();
    try {
      const response = await axios.get('/attendance/session');
      const localAfter = Date.now();
      const serverTime = new Date(response.data.server_time).getTime();
      // Estimate server time at the moment of arrival (avg of request/response trip)
      const estimatedLocalAtServer = (localBefore + localAfter) / 2;
      const offset = serverTime - estimatedLocalAtServer;
      
      setServerTimeOffset(offset);
      console.log('Session response:', response.data, 'Clock Offset (ms):', offset);
      setSession({ ...response.data, error: false, isExpired: false });
    } catch (err) {
      console.error('Failed to fetch session', err);
      const isAuthError = err.response?.status === 401 || err.response?.status === 403;
      const statusCode = err.response?.status ? `[${err.response.status}] ` : '';
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Sync Error';
      
      setSession({ 
        is_open: false, 
        expires_at: null, 
        starts_at: null,
        error: true, 
        isExpired: isAuthError,
        errorMessage: isAuthError ? 'Your session has expired. Please log out and back in.' : `${statusCode}${msg}` 
      });
    } finally {
      setIsSessionLoading(false);
    }
  };

  React.useEffect(() => {
    FaceService.loadModels().then(() => setIsModelsLoaded(true));
    checkSession();
    const interval = setInterval(checkSession, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = async () => {
    if (isVerifying || livenessStatus === 'challenge') return;
    setIsVerifying(true);
    setLivenessStatus('challenge');
    setBlinkDetected(false);
    setResult(null);

    // 1. Liveness Step: Blink Detection
    let blinkFound = false;
    const startLiveness = Date.now();
    
    const livenessInterval = setInterval(async () => {
      const frame = webcamRef.current.getScreenshot();
      if (frame) {
        const detection = await FaceService.getDescriptorFromBase64(frame);
        if (FaceService.detectBlink(detection)) {
          blinkFound = true;
          setBlinkDetected(true);
          setLivenessStatus('success');
          clearInterval(livenessInterval);
          performBurstCapture();
        }
      }
      
      // Timeout liveness after 10 seconds
      if (Date.now() - startLiveness > 10000 && !blinkFound) {
        clearInterval(livenessInterval);
        setLivenessStatus('failed');
        setResult({ success: false, message: 'Liveness failed: No blink detected. Please try again.' });
        setIsVerifying(false);
      }
    }, 200);
  };

  const performBurstCapture = async () => {
    // 2. Burst Capture: Take 5 frames quickly
    const burstDescriptors = [];
    for (let i = 0; i < 5; i++) {
      const frame = webcamRef.current.getScreenshot();
      if (frame) {
        const detection = await FaceService.getDescriptorFromBase64(frame);
        if (detection && FaceService.getFaceQuality(detection).isGood) {
          burstDescriptors.push(Array.from(detection.descriptor));
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (burstDescriptors.length === 0) {
      setResult({ success: false, message: 'Could not capture high-quality face samples. Adjust lighting.' });
      setIsVerifying(false);
      setLivenessStatus('idle');
      return;
    }

    // 3. Location and Submit
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          const response = await axios.post('/attendance/verify', {
            face_descriptor: burstDescriptors, // Send burst array
            location: loc
          });
          setResult({ success: true, message: response.data.message });
          setLivenessStatus('idle');
          fetchHistory();
        } catch (err) {
          setResult({ 
            success: false, 
            message: err.response?.data?.message || 'Verification failed. Try again.' 
          });
          setLivenessStatus('idle');
        } finally {
          setIsVerifying(false);
        }
      },
      (err) => {
        setResult({ success: false, message: 'Location access denied.' });
        setIsVerifying(false);
        setLivenessStatus('idle');
      },
      { timeout: 5000 }
    );
  };

  // Adaptive Auto-Verify Loop
  React.useEffect(() => {
    if (isAutoMode && !result?.success && !isVerifying && session.is_open) {
      autoVerifyTimeout.current = setTimeout(() => {
        handleVerify();
      }, 1500);
    }
    return () => clearTimeout(autoVerifyTimeout.current);
  }, [isAutoMode, result, isVerifying, session.is_open]);

  const chartData = [
    { name: 'Present', value: stats.present },
    { name: 'Absent', value: stats.total - stats.present },
  ];
  const COLORS = ['#0ea5e9', '#e2e8f0'];

  const getServerNow = useCallback(() => new Date(Date.now() + serverTimeOffset), [serverTimeOffset]);
  
  const isTrulyOpen = session.is_open && (!session.starts_at || new Date(session.starts_at) <= getServerNow());
  const isScheduled = !isTrulyOpen && session.is_open && session.starts_at && new Date(session.starts_at) > getServerNow();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
      {/* Left Column: Stats & History */}
      <div className="lg:col-span-1 flex flex-col gap-8">
        <div className="glass p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
            <Percent className="text-primary-600 w-5 h-5" />
            Your Attendance
          </h2>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-primary-600">{Math.round(stats.percentage)}%</span>
              <span className="text-sm text-slate-500">Overall</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
            <div className="p-3 bg-primary-50 rounded-xl">
              <p className="text-sm text-primary-600 font-semibold">Present</p>
              <p className="text-xl font-bold">{stats.present} Days</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500 font-semibold">Total Days</p>
              <p className="text-xl font-bold">{stats.total} Days</p>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl shadow-lg h-[450px] overflow-hidden flex flex-col">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Calendar className="text-primary-600 w-5 h-5" />
            Recent Logs
          </h2>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {history.length === 0 ? (
              <p className="text-slate-400 text-center mt-10">No records found</p>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-white border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">
                        {new Date(log.timestamp).toLocaleDateString('en-IN')} - 
                        <span className="ml-2 text-primary-600 text-[10px] uppercase font-black">
                          {new Date(new Date(log.timestamp).toLocaleString("en-US", {timeZone: "Asia/Kolkata"})).getHours() < 12 ? 'Morning' : 'Afternoon'}
                        </span>
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">{new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      log.status === 'Present' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Right Column: Camera & verification */}
       <div className="lg:col-span-2 space-y-6">
         {/* Session Status Banner */}
         <div className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all duration-500 shadow-sm ${
           isTrulyOpen ? 'bg-green-50 border-green-100' : (isScheduled ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100')
         }`}>
           <div className="flex items-center gap-4">
             <div className={`p-2.5 rounded-xl flex items-center justify-center shadow-lg ${isTrulyOpen ? 'bg-green-500 shadow-green-200' : (isScheduled ? 'bg-amber-500 shadow-amber-200' : 'bg-red-500 shadow-red-200')}`}>
               {isTrulyOpen ? <Shield className="w-5 h-5 text-white" /> : (isScheduled ? <Clock className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />)}
             </div>
             <div>
                <p className={`text-sm font-black uppercase tracking-widest ${isTrulyOpen ? 'text-green-700' : (isScheduled ? 'text-amber-700' : 'text-red-700')}`}>
                  {isTrulyOpen ? 'Portal is OPEN' : (isScheduled ? 'Portal is SCHEDULED' : 'Portal is CLOSED')}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {isTrulyOpen 
                    ? (session.expires_at ? `Automatically closing at ${new Date(session.expires_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Closing soon by faculty') 
                    : (isScheduled ? `Attendance opens exactly at ${new Date(session.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Wait for faculty to open the attendance gate')}
                </p>
             </div>
           </div>
           {isTrulyOpen && (
             <div className="flex flex-col items-end gap-1">
               <div className="px-4 py-2 bg-white rounded-xl border border-green-200 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
                  <span className="text-[10px] font-black text-green-600 uppercase">Live</span>
               </div>
               <p className="text-[9px] text-green-400 font-bold">Synced just now</p>
             </div>
           )}
           {isTrulyOpen && (
             <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                   Synced {session.server_time ? `@ ${new Date(session.server_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'just now'}
                 </span>
               </div>
               <div className="text-[10px] font-bold text-slate-300 uppercase">v2.4.1</div>
             </div>
           )}
            {session.error && (
              <div className="px-4 py-2 bg-red-50 rounded-xl border border-red-200 flex flex-col items-center gap-1">
                 <div className="flex items-center gap-2">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="text-[10px] font-black text-red-600 uppercase">
                      {session.isExpired ? 'Session Expired' : 'Sync Error'}
                    </span>
                 </div>
                 <p className="text-[8px] text-red-400 font-bold mb-1 text-center">{session.errorMessage}</p>
                 <div className="flex gap-2">
                    {session.isExpired ? (
                      <button 
                        onClick={() => navigate('/login')}
                        className="px-3 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition-all uppercase tracking-widest"
                      >
                        Log In Again
                      </button>
                    ) : (
                      <button 
                        onClick={checkSession}
                        disabled={isSessionLoading}
                        className="px-3 py-1 bg-slate-800 text-white text-[9px] font-black rounded-lg hover:bg-slate-900 transition-all uppercase tracking-widest flex items-center gap-1"
                      >
                        {isSessionLoading ? <Loader2 className="w-2 h-2 animate-spin" /> : <RotateCcw className="w-2 h-2" />}
                        Sync Now
                      </button>
                    )}
                 </div>
              </div>
            )}
         </div>

         <div className="glass p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-8 min-h-[600px] border border-white/50 relative overflow-hidden">
            {!isTrulyOpen && (
              <div className="absolute inset-0 z-40 bg-slate-900/5 backdrop-blur-[1px] flex items-center justify-center p-8 transition-opacity duration-500">
                 <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-sm text-center space-y-4 transform translate-y-[-20px]">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${isScheduled ? 'bg-amber-50' : 'bg-red-50'}`}>
                       {isScheduled ? <Clock className="w-8 h-8 text-amber-500 animate-pulse" /> : <Lock className="w-8 h-8 text-red-500" />}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {isScheduled ? 'Scheduled Attendance' : 'Attendance Gate Locked'}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {isScheduled ? (<>The portal is scheduled to open at <strong className="text-amber-600">{new Date(session.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong>. Please get your face ready.</>) : "Faculty hasn't opened the attendance portal yet. Please wait until the session begins."}
                    </p>
                 </div>
              </div>
            )}
            <div className="text-center">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI Identity Verification</h1>
              <div className="mt-4 flex flex-col items-center gap-2">
                {isAutoMode && !result?.success && session.is_open ? (
                  <p className="text-primary-600 font-black animate-pulse flex items-center justify-center gap-3 uppercase tracking-widest text-xs h-6">
                    <span className="flex gap-1">
                       <span className="w-1 h-1 bg-primary-600 rounded-full animate-bounce"></span>
                       <span className="w-1 h-1 bg-primary-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                       <span className="w-1 h-1 bg-primary-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </span>
                    Scanning Face...
                  </p>
                ) : (
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest h-6">
                     {result?.success ? `Verified: ${result.student?.name}` : 'Scanning for your identity...'}
                  </p>
                )}
              </div>
            </div>
  
            <div className="relative w-full max-w-lg aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/50">
               <Webcam
                 audio={false}
                 ref={webcamRef}
                 screenshotFormat="image/jpeg"
                 className="w-full h-full object-cover"
                 videoConstraints={{ facingMode: "user" }}
                 onUserMedia={() => { setIsCameraReady(true); setCameraError(''); }}
                 onUserMediaError={(err) => {
                   console.error("Camera Error:", err);
                   setIsCameraReady(false);
                   if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                     setCameraError('Camera access denied.');
                   } else {
                     setCameraError('Camera blocked or not found.');
                   }
                 }}
               />
               
               <div className="absolute inset-0 border-[16px] border-black/10 pointer-events-none"></div>
              
              {/* Corner Accents */}
              <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-white/40 rounded-tl-lg"></div>
              <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-white/40 rounded-tr-lg"></div>
              <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-white/40 rounded-bl-lg"></div>
              <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-white/40 rounded-br-lg"></div>

              {/* No need for duplicate overlay here, handled by the main glass container overlay */}

               {/* Liveness Challenge Overlay */}
               {isVerifying && livenessStatus === 'challenge' && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary-600/90 backdrop-blur-md z-50 transition-all duration-500">
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse border-4 border-white/30">
                       <Camera className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 animate-bounce">Blink Now!</h3>
                    <p className="text-white/80 text-xs font-bold text-center px-12 leading-relaxed">
                       We need to verify you are a live person.<br/>
                       Please blink your eyes clearly at the camera.
                    </p>
                    <div className="mt-10 flex gap-2">
                       <div className={`w-3 h-3 rounded-full transition-all duration-300 ${blinkDetected ? 'bg-green-400 scale-125' : 'bg-white/20'}`}></div>
                    </div>
                 </div>
               )}

               {isVerifying && livenessStatus === 'success' && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-600/90 backdrop-blur-md z-50 animate-fade-in">
                    <CheckCircle className="w-16 h-16 text-white mb-4 animate-scale-in" />
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Liveness Verified!</h3>
                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-2">Capturing biometric burst...</p>
                 </div>
               )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-8 text-center ring-inset ring-2 ring-red-500/20">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                     <Camera className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-sm text-red-500 font-black uppercase tracking-widest">{cameraError}</p>
                </div>
              )}
   
              <div className={`absolute inset-0 border-[4px] transition-all duration-700 pointer-events-none ${
                isVerifying ? 'border-primary-500 animate-pulse' : (result?.success ? 'border-green-500' : 'border-white/5')
              }`} />
              
              {isVerifying && (
                 <div className="absolute inset-0 flex items-center justify-center bg-primary-950/20 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                       <Loader2 className="w-16 h-16 text-white animate-spin" />
                       <span className="text-white text-xs font-black uppercase tracking-[0.3em]">Processing</span>
                    </div>
                 </div>
              )}
            </div>
   
            <div className="w-full max-w-lg flex flex-col gap-4">
              {/* Inputs Removed - Automated Identity */}
   
              {result && (
                <div className={`p-4 rounded-2xl flex items-center gap-4 animate-fade-in ${
                  result.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {result.success ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                  <div className="flex-1 text-center">
                    <p className="font-black text-lg">
                      {result.message}
                    </p>
                    {result.details && (
                      <p className="text-[10px] mt-1 opacity-80 italic">Debug: {result.details}</p>
                    )}
                    {result.success && result.student?.name && (
                      <div className="mt-1">
                        <p className="font-medium text-sm text-green-600">Welcome, {result.student.name}</p>
                        <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{result.student.rollNumber}</p>
                      </div>
                    )}
                    {result.message?.includes('enrollment required') && (
                      <button 
                        onClick={() => navigate('/register', { state: { googleUser: user } })}
                        className="mt-2 text-sm font-bold bg-white text-red-600 px-4 py-2 rounded-xl shadow-sm hover:bg-red-100 transition-colors"
                      >
                        Register Now →
                      </button>
                    )}
                  </div>
               </div>
             )}
   
             <button
               onClick={() => handleVerify()}
               disabled={isVerifying || result?.success || !session.is_open}
               className={`w-full py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-4 transition-all transform active:scale-95 ${
                 isVerifying || result?.success || !session.is_open
                 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                 : 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-200 hover:shadow-primary-300/50'
               }`}
             >
               {isVerifying ? (
                 <>
                   <Loader2 className="w-6 h-6 animate-spin" />
                   <span>Verifying</span>
                 </>
               ) : (
                 <>
                   <MapPin className="w-6 h-6" />
                   <span>{result?.success ? 'Fulfilled' : 'Confirm Attendance'}</span>
                 </>
               )}
             </button>
 
              {result?.success && (
                 <button 
                     onClick={() => { setResult(null); setIsAutoMode(true); }}
                     className="text-primary-600 text-sm font-semibold hover:underline"
                 >
                     Mark Another Attendance
                 </button>
              )}
            </div>
         </div>
       </div>
    </div>
  );
};

export default StudentDashboard;
