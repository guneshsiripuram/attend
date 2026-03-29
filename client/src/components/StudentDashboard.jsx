import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, MapPin, CheckCircle, XCircle, Loader2, Calendar, Percent, Shield, Clock, Lock, RotateCcw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import FaceService from '../services/FaceService';

const StudentDashboard = ({ user }) => {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  
  // States
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState('idle'); // idle, challenge, success, failed
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ percentage: 0, present: 0, total: 0 });
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  
  // Session & Sync
  const [session, setSession] = useState({ is_open: false, expires_at: null, starts_at: null, server_time: null });
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0); 

  const autoVerifyTimeout = useRef(null);

  // 1. Session & Clock Synchronization
  const checkSession = async () => {
    const localBefore = Date.now();
    try {
      const response = await axios.get('/attendance/session');
      const localAfter = Date.now();
      const serverTime = new Date(response.data.server_time).getTime();
      const estimatedLocalAtServer = (localBefore + localAfter) / 2;
      const offset = serverTime - estimatedLocalAtServer;
      
      setServerTimeOffset(offset);
      setSession({ ...(response.data || {}), error: false, isExpired: false });
    } catch (err) {
      console.error('Session sync failed:', err);
      const isAuthError = err.response?.status === 401 || err.response?.status === 403;
      setSession({ 
        is_open: false, 
        error: true, 
        isExpired: isAuthError,
        errorMessage: isAuthError ? 'Session expired. Please log in again.' : 'Connection lost. Retrying sync...' 
      });
    } finally {
      setIsSessionLoading(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    try {
      const resp = await axios.get('/attendance/me');
      setHistory(resp.data.logs || []);
      setStats(resp.data.stats || { percentage: 0, present: 0, total: 0 });
    } catch (err) {
      console.error('History fetch failed:', err);
    }
  }, []);

  // Initialization
  useEffect(() => {
    FaceService.loadModels().then(() => setIsModelsLoaded(true));
    checkSession();
    fetchHistory();
    const interval = setInterval(checkSession, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // Derived Gate Logic
  const getServerNow = useCallback(() => new Date(Date.now() + serverTimeOffset), [serverTimeOffset]);
  const isTrulyOpen = !!(session?.is_open && (!session.starts_at || new Date(session.starts_at) <= getServerNow()));
  const isScheduled = !!(!isTrulyOpen && session?.is_open && session.starts_at && new Date(session.starts_at) > getServerNow());

  // 2. Direct Verification Flow (Liveness Removed)
  const handleVerify = async () => {
    if (isVerifying || !isTrulyOpen) return;
    
    setIsVerifying(true);
    setLivenessStatus('idle'); // Show loading spinner immediately
    setResult(null);

    // Briefly show the spinner before heavy processing thread blocks UI
    setTimeout(() => {
      performBurstCapture();
    }, 100);
  };

  const performBurstCapture = async () => {
    const burstDescriptors = [];
    for (let i = 0; i < 8; i++) {
        if (!webcamRef.current) break;
        const frame = webcamRef.current.getScreenshot();
        if (frame) {
            const analysis = await FaceService.analyzeBase64(frame);
            if (analysis.isGood) burstDescriptors.push(analysis.descriptor);
        }
        if (burstDescriptors.length >= 5) break;
        await new Promise(r => setTimeout(r, 150));
    }

    if (burstDescriptors.length < 3) {
      setResult({ success: false, message: 'Bad image quality. Ensure your face is well-lit.' });
      setIsVerifying(false);
      setLivenessStatus('idle');
      return;
    }

    // GPS & Submit
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const response = await axios.post('/attendance/verify', {
            face_descriptor: burstDescriptors,
            location: loc
          });
          setResult({ success: true, ...response.data });
          setLivenessStatus('idle');
          fetchHistory();
          checkSession();
        } catch (err) {
          setResult({ 
            success: false, 
            message: err.response?.data?.message || 'Verification failed. Please try again.',
            details: err.response?.data?.details
          });
          setLivenessStatus('idle');
        } finally {
          setIsVerifying(false);
        }
      },
      (err) => {
        setResult({ success: false, message: 'Location required to mark attendance.' });
        setIsVerifying(false);
        setLivenessStatus('idle');
      },
      { timeout: 5000 }
    );
  };

  // Auto-scanning loop
  useEffect(() => {
    if (isAutoMode && !result?.success && !isVerifying && isTrulyOpen) {
      autoVerifyTimeout.current = setTimeout(handleVerify, 1500);
    }
    return () => clearTimeout(autoVerifyTimeout.current);
  }, [isAutoMode, result, isVerifying, isTrulyOpen]);

  // Chart Logic
  const chartData = [
    { name: 'Present', value: Number(stats?.present || 0) },
    { name: 'Absent', value: Math.max(0, Number(stats?.total || 0) - Number(stats?.present || 0)) },
  ];
  const COLORS = ['#0ea5e9', '#e2e8f0'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
      
      {/* Sidebar: Stats & Logs */}
      <div className="lg:col-span-1 flex flex-col gap-8">
        {/* Attendance Card */}
        <div className="glass p-6 rounded-2xl shadow-lg border border-white/50">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800">
            <Percent className="text-primary-600 w-5 h-5" />
            Your Performance
          </h2>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-primary-600">{Math.round(Number(stats?.percentage || 0))}%</span>
              <span className="text-sm text-slate-500 font-medium">Present</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100 text-center">
              <p className="text-[10px] text-primary-600 font-black uppercase tracking-widest">Present</p>
              <p className="text-xl font-bold text-slate-800">{Number(stats?.present || 0)} Days</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total</p>
              <p className="text-xl font-bold text-slate-800">{Number(stats?.total || 0)} Days</p>
            </div>
          </div>
        </div>

        {/* History Card */}
        <div className="glass p-6 rounded-2xl shadow-lg flex-1 border border-white/50 h-[400px] flex flex-col">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-slate-800">
            <Calendar className="text-primary-600 w-5 h-5" />
            Recent Logs
          </h2>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
                <Clock className="w-8 h-8" />
                <p className="text-sm">No recent records</p>
              </div>
            ) : (
              history.map((log) => (
                <div key={log.id} className="p-3.5 rounded-xl bg-white/60 border border-slate-100 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{new Date(log.timestamp).toLocaleDateString('en-IN')}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(log.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</p>
                  </div>
                  {log.status === 'Present' || log.status === 'P' || log.status === 'M' ? (
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase">Present</span>
                  ) : log.status === 'Failed_Location' ? (
                    <span className="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-center shadow-sm">Location Failed</span>
                  ) : log.status === 'Failed_Face' ? (
                    <span className="bg-rose-50 text-rose-600 border border-rose-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-center shadow-sm">Identity Failed</span>
                  ) : (
                    <span className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-center shadow-sm">{log.status}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Column: Verification Center */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Status Banner */}
        <div className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all duration-500 ${
           isTrulyOpen ? 'bg-green-50/50 border-green-200' : (isScheduled ? 'bg-amber-50/50 border-amber-200' : 'bg-red-50/50 border-red-200')
        }`}>
          <div className="flex items-center gap-4">
             <div className={`p-2.5 rounded-xl flex items-center justify-center shadow-lg ${isTrulyOpen ? 'bg-green-500' : (isScheduled ? 'bg-amber-500' : 'bg-red-500')}`}>
               {isTrulyOpen ? <Shield className="w-5 h-5 text-white" /> : (isScheduled ? <Clock className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />)}
             </div>
             <div>
                <p className={`text-sm font-black uppercase tracking-widest ${isTrulyOpen ? 'text-green-700' : (isScheduled ? 'text-amber-700' : 'text-red-700')}`}>
                  {isTrulyOpen ? 'Attendance Open' : (isScheduled ? 'Upcoming Session' : 'Portal Closed')}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {isTrulyOpen ? 'Identity verification active' : (isScheduled ? `Begins at ${new Date(session.starts_at).toLocaleTimeString('en-IN')}` : 'Wait for faculty to open the gate')}
                </p>
             </div>
          </div>
          {session.error && (
            <div className="flex items-center gap-3">
               <span className="text-[10px] font-bold text-red-500 uppercase">{session.errorMessage}</span>
               {session.isExpired ? (
                 <button onClick={() => navigate('/login')} className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-red-700 transition-all shadow-md">Login</button>
               ) : (
                 <button onClick={checkSession} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all"><RotateCcw className="w-3 h-3 text-slate-400" /></button>
               )}
            </div>
          )}
        </div>

        {/* Camera Center */}
        <div className="glass p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-8 min-h-[600px] border border-white/50 relative overflow-hidden">
           
           {!isTrulyOpen && (
             <div className="absolute inset-0 z-40 bg-slate-900/5 backdrop-blur-[2px] flex items-center justify-center p-8 transition-opacity duration-500">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-sm text-center space-y-4">
                   <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto ${isScheduled ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'}`}>
                      {isScheduled ? <Clock className="w-10 h-10 animate-pulse" /> : <Lock className="w-10 h-10" />}
                   </div>
                   <h3 className="text-2xl font-black text-slate-900 leading-tight">
                     {isScheduled ? 'Prepare for Verification' : 'Portal is Closed'}
                   </h3>
                   <p className="text-sm text-slate-500 leading-relaxed font-medium">
                     {isScheduled ? 'The attendance window is opening shortly. Please ensure your camera and location permissions are active.' : 'Faculty hasn\'t opened the gate for this session. Please wait for the scheduled time.'}
                   </p>
                </div>
             </div>
           )}

           <div className="text-center">
             <h1 className="text-3xl font-black text-slate-900 tracking-tight">Biometric Verification</h1>
             <div className="mt-2 text-slate-400 text-xs font-black uppercase tracking-[0.2em] h-5">
               {isAutoMode && isTrulyOpen && !result?.success ? (
                 <p className="flex items-center justify-center gap-2 animate-pulse text-primary-600">
                   <span className="w-1.5 h-1.5 bg-primary-600 rounded-full"></span>
                   Scanning Face...
                 </p>
               ) : (
                 <p>{result?.success ? `Verified: ${result.student?.name || 'Success'}` : 'Position your face in the frame'}</p>
               )}
             </div>
           </div>

           {/* Webcam Box */}
           <div className="relative w-full max-w-lg aspect-video bg-slate-950 rounded-[2rem] overflow-hidden shadow-2xl ring-4 ring-white/60 group">
             <Webcam
               audio={false}
               ref={webcamRef}
               screenshotFormat="image/jpeg"
               className="w-full h-full object-cover"
               onUserMedia={() => setIsCameraReady(true)}
               onUserMediaError={() => setCameraError('Camera access denied')}
               videoConstraints={{ facingMode: "user" }}
             />
             
             {/* Liveness Overlays (Removed for speed/reliability) */}

             {(isVerifying && livenessStatus === 'idle') && (
               <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-30">
                 <Loader2 className="w-16 h-16 text-white animate-spin" />
               </div>
             )}

             {cameraError && (
               <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center px-12">
                 <XCircle className="w-16 h-16 text-red-500 mb-4" />
                 <p className="text-white font-black uppercase tracking-widest text-sm">{cameraError}</p>
                 <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20 transition-all border border-white/50">Retry Access</button>
               </div>
             )}

             {/* Decoration */}
             <div className="absolute inset-0 border-[20px] border-black/5 pointer-events-none"></div>
             <div className={`absolute inset-0 border-4 transition-all duration-700 pointer-events-none ${isVerifying ? 'border-primary-500 animate-pulse' : (result?.success ? 'border-green-500' : 'border-white/5')}`} />
           </div>

           {/* Results & Actions */}
           <div className="w-full max-w-lg space-y-6">
             {result && (
               <div className={`p-5 rounded-2xl flex items-center gap-5 border-2 animate-in slide-in-from-top-4 ${result.success ? 'bg-green-50/50 border-green-100 text-green-800' : 'bg-red-50/50 border-red-100 text-red-800'}`}>
                 <div className={`p-3 rounded-xl ${result.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white shadow-lg shadow-red-200'}`}>
                   {result.success ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                 </div>
                 <div className="flex-1">
                   <p className="text-lg font-black leading-tight">{result.message}</p>
                   {result.student?.name && <p className="text-sm font-semibold opacity-80 mt-1">Found: {result.student.name} ({result.student.rollNumber})</p>}
                   {result.details && <p className="text-[10px] opacity-60 mt-1 font-mono italic">Trace: {result.details}</p>}
                 </div>
               </div>
             )}

             <button
               onClick={handleVerify}
               disabled={isVerifying || result?.success || !isTrulyOpen}
               className={`w-full py-6 rounded-3xl font-black uppercase tracking-[0.3em] text-sm shadow-2xl flex items-center justify-center gap-4 transition-all transform active:scale-[0.98] ${
                 isVerifying || result?.success || !isTrulyOpen
                 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-300/50' 
                 : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-300/50 hover:shadow-primary-400/60'
               }`}
             >
               {isVerifying ? (
                 <>
                   <Loader2 className="w-6 h-6 animate-spin" />
                   <span>Verifying...</span>
                 </>
               ) : (
                 <>
                   <MapPin className="w-6 h-6" />
                   <span>{result?.success ? 'Attendance Marked' : 'Confirm Attendance'}</span>
                 </>
               )}
             </button>

             {result?.success && (
               <button onClick={() => { setResult(null); setIsAutoMode(true); }} className="w-full text-center text-primary-600 text-xs font-black uppercase tracking-widest hover:text-primary-800 transition-colors">
                 Scan Another Session
               </button>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default StudentDashboard;
