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
  
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState('idle'); // idle, checking_location, challenge, success, failed
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ percentage: 0, present: 0, total: 0 });
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelLoadError, setModelLoadError] = useState('');
  const [gpsError, setGpsError] = useState('');
  
  const [session, setSession] = useState({ is_open: false, expires_at: null, starts_at: null, server_time: null });
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0); 

  const [hasFace, setHasFace] = useState(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0);
  const [enrollSamples, setEnrollSamples] = useState([]);
  const [enrollStatus, setEnrollStatus] = useState('idle');
  const [enrollError, setEnrollError] = useState('');

  const autoVerifyTimeout = useRef(null);
  const isBlinkSuccessful = useRef(false);

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
      if (typeof resp.data.hasFace === 'boolean') setHasFace(resp.data.hasFace);
    } catch (err) {
      console.error('History fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    FaceService.onProgress = (p) => setModelProgress(Math.round(p * 100));
    FaceService.loadModels()
      .then(() => setIsModelsLoaded(true))
      .catch(() => setModelLoadError('Face recognition models failed to load. Check your internet connection and refresh the page.'))
      .finally(() => setModelsLoading(false));
    checkSession();
    fetchHistory();
    const interval = setInterval(checkSession, 10000);
    return () => {
      clearInterval(interval);
      FaceService.onProgress = null;
    };
  }, [fetchHistory]);

  const getServerNow = useCallback(() => new Date(Date.now() + serverTimeOffset), [serverTimeOffset]);
  const isTrulyOpen = !!(session?.is_open && (!session.starts_at || new Date(session.starts_at) <= getServerNow()));

  // Students without an enrolled face template must enroll before they can
  // verify. Auto-open the enrollment overlay so the flow is impossible to miss.
  useEffect(() => {
    if (hasFace === false) setShowEnroll(true);
  }, [hasFace]);

  const captureEnrollSample = async () => {
    if (!webcamRef.current) return;
    setEnrollStatus('recording');
    setEnrollError('');
    const analysis = await FaceService.analyzeUntilGood(
      () => webcamRef.current && webcamRef.current.getScreenshot(),
      { isEnrollment: true }
    );
    if (!analysis.isGood) {
      setEnrollError(`Step ${enrollStep + 1} failed: ${analysis.reason}`);
      setEnrollStatus('idle');
      return;
    }
    const next = [...enrollSamples];
    next[enrollStep] = analysis.descriptor;
    setEnrollSamples(next);
    if (enrollStep < 2) setEnrollStep(enrollStep + 1);
    setEnrollStatus('idle');
  };

  const saveEnrollment = async () => {
    if (enrollSamples.length < 3) return;
    setEnrollStatus('saving');
    setEnrollError('');
    try {
      await axios.post('/attendance/enroll-face', { face_descriptor: enrollSamples });
      setHasFace(true);
      setShowEnroll(false);
      setEnrollSamples([]);
      setEnrollStep(0);
      fetchHistory();
    } catch (err) {
      setEnrollError(err.response?.data?.message || 'Enrollment failed. Please try again.');
      setEnrollStatus('idle');
    }
  };

  const openReEnroll = () => {
    setEnrollStep(0);
    setEnrollSamples([]);
    setEnrollError('');
    setShowEnroll(true);
  };

  const performFinalSubmit = useCallback(async (loc) => {
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
      setResult({ success: false, message: 'IDENTITY FAILED: Poor image quality.' });
      setIsAutoMode(false);
      setIsVerifying(false);
      setLivenessStatus('idle');
      return;
    }

    try {
      const response = await axios.post('/attendance/verify', {
        face_descriptor: FaceService.averageDescriptors(burstDescriptors),
        location: loc
      });
      setResult({ success: true, ...response.data });
      setLivenessStatus('idle');
      fetchHistory();
      checkSession();
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Verification failed.' });
      setIsAutoMode(false);
      setLivenessStatus('idle');
    } finally {
      setIsVerifying(false);
    }
  }, [fetchHistory]);

  const startLivenessChallenge = useCallback((loc) => {
    setLivenessStatus('challenge');
    isBlinkSuccessful.current = false;
    const framesForLiveness = [];
    const startLivenessTime = Date.now();
    
    const livenessInterval = setInterval(async () => {
      if (!webcamRef.current) return;
      if (isBlinkSuccessful.current) return; // Fix: Prevent execution if already successful

      const frame = webcamRef.current.getScreenshot();
      if (frame) {
        const analysis = await FaceService.analyzeBase64(frame);
        framesForLiveness.push(analysis);
        if (framesForLiveness.length > 15) framesForLiveness.shift();
        if (FaceService.detectBlinkSequence(framesForLiveness)) {
          isBlinkSuccessful.current = true;
          setBlinkDetected(true);
          setLivenessStatus('success');
          clearInterval(livenessInterval);
          performFinalSubmit(loc);
          return;
        }
      }
      if (Date.now() - startLivenessTime > 15000) {
        clearInterval(livenessInterval);
        if (!isBlinkSuccessful.current) { // Fix: Check ref instead of stale state
          setLivenessStatus('idle');
          setResult({ success: false, message: 'IDENTITY FAILED: Blink timeout.' });
          setIsAutoMode(false);
          setIsVerifying(false);
        }
      }
    }, 150);
  }, [performFinalSubmit]);

  const handleVerify = useCallback(async () => {
    if (isVerifying || livenessStatus === 'challenge' || !isTrulyOpen) return;
    setIsVerifying(true);
    setResult(null);
    setBlinkDetected(false);
    setGpsError('');
    setLivenessStatus('checking_location');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          const locCheck = await axios.post('/attendance/check-location', { location: loc });
          if (locCheck.data.success) {
            startLivenessChallenge(loc);
          }
        } catch (err) {
          setGpsError(err.response?.data?.message || 'LOCATION FAILED');
          setIsAutoMode(false);
          setLivenessStatus('idle');
          setIsVerifying(false);
        }
      },
      (err) => {
        const code = err && err.code;
        let message = 'LOCATION FAILED: GPS required.';
        if (code === 1) message = 'LOCATION FAILED: Location permission was denied. Enable location access for this site in your browser settings, then retry.';
        else if (code === 2) message = 'LOCATION FAILED: Position unavailable. Move to an area with better GPS signal and retry.';
        else if (code === 3) message = 'LOCATION FAILED: GPS timed out. Try again with a stronger GPS signal.';
        setGpsError(message);
        setIsAutoMode(false);
        setLivenessStatus('idle');
        setIsVerifying(false);
      },
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    );
  }, [isVerifying, livenessStatus, isTrulyOpen, startLivenessChallenge]);

  useEffect(() => {
    if (isAutoMode && !result?.success && !isVerifying && isTrulyOpen && !showEnroll) {
      autoVerifyTimeout.current = setTimeout(handleVerify, 1500);
    }
    return () => clearTimeout(autoVerifyTimeout.current);
  }, [isAutoMode, result, isVerifying, isTrulyOpen, showEnroll, handleVerify]);

  const getTodayStatus = useCallback(() => {
    const todayStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split('T')[0];
    
    let fn = false;
    let an = false;
    
    history.forEach(log => {
      if (log.status !== 'Present') return;
      const istTime = new Date(new Date(log.timestamp).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const dateStr = istTime.toISOString().split('T')[0];
      if (dateStr === todayStr) {
        if (istTime.getHours() < 12) fn = true;
        else an = true;
      }
    });

    return { fn, an };
  }, [history]);

  const todayStatus = getTodayStatus();

  const chartData = [
    { name: 'Present', value: Number(stats?.present || 0) },
    { name: 'Absent', value: Math.max(0, Number(stats?.total || 0) - Number(stats?.present || 0)) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
      <div className="lg:col-span-1 flex flex-col gap-8">
        <div className="glass p-6 rounded-2xl shadow-lg border border-white/50">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800"><Percent className="w-5 h-5" /> Performance</h2>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  <Cell fill="#0ea5e9" /><Cell fill="#e2e8f0" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-primary-600">{Math.round(Number(stats?.percentage || 0))}%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary-600">Present</p>
              <p className="text-xl font-bold">{Number(stats?.present || 0)} Days</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total</p>
              <p className="text-xl font-bold">{Number(stats?.total || 0)} Days</p>
            </div>
          </div>
          
          <div className="mt-4 p-4 rounded-2xl border border-slate-100 bg-white/60">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center mb-3">Today's Status</p>
            <div className="flex rounded-xl overflow-hidden shadow-sm">
               <div className={`flex-1 text-center py-2.5 text-xs font-black tracking-widest transition-colors duration-500 ${todayStatus.fn ? 'bg-green-500 text-white' : 'bg-red-50 text-red-500 border border-red-100'}`}>FN</div>
               <div className={`flex-1 text-center py-2.5 text-xs font-black tracking-widest transition-colors duration-500 ${todayStatus.an ? 'bg-green-500 text-white border-l border-white/20' : 'bg-red-50 text-red-500 border border-l-0 border-red-100'}`}>AN</div>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl shadow-lg border border-white/50 flex flex-col">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Calendar className="w-5 h-5 text-primary-600" /> Recent Logs</h2>
          <div className="overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[350px]">
            {history.map((log) => (
              <div key={log.id} className="p-3.5 rounded-xl bg-white/60 border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{new Date(log.timestamp).toLocaleDateString('en-IN')}</p>
                  <p className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString('en-IN')}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${log.status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>{log.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <div className={`p-4 rounded-2xl border-2 flex items-center justify-between ${isTrulyOpen ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-xl ${isTrulyOpen ? 'bg-green-500' : 'bg-red-500'} text-white`}><Shield className="w-5 h-5" /></div>
            <div>
              <p className={`text-sm font-black uppercase tracking-widest ${isTrulyOpen ? 'text-green-700' : 'text-red-700'}`}>{isTrulyOpen ? 'Attendance Open' : 'Portal Closed'}</p>
              <p className="text-xs font-semibold text-slate-500">{isTrulyOpen ? 'Identity verification active' : 'Waiting for faculty'}</p>
            </div>
          </div>
        </div>

        <div className="glass p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-8 min-h-[600px] border border-white/50 relative overflow-hidden">
           {!isTrulyOpen && <div className="absolute inset-0 z-40 bg-slate-900/5 backdrop-blur-sm flex items-center justify-center"><h3 className="text-2xl font-black text-slate-900">Portal Locked</h3></div>}
           <div className="text-center">
             <h1 className="text-3xl font-black text-slate-900">Biometric Verification</h1>
             <p className="mt-2 text-primary-600 text-xs font-black uppercase tracking-widest animate-pulse">{isVerifying ? (livenessStatus === 'challenge' ? 'Blink Now!' : 'Checking...') : 'Position Face'}</p>
           </div>
           <div className="relative w-full max-w-lg aspect-video bg-slate-950 rounded-[2rem] overflow-hidden shadow-2xl ring-4 ring-white/60">
             <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" onUserMedia={() => setIsCameraReady(true)} />
             {modelsLoading && (
               <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
                 <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
                 <p className="text-white text-xs font-black uppercase tracking-widest text-center px-6">Loading Face Recognition Models</p>
                 <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                   <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${modelProgress}%` }}></div>
                 </div>
                 <p className="text-slate-400 text-[10px] font-bold">{modelProgress}% — first load can take a minute</p>
               </div>
             )}
             {modelLoadError && (
               <div className="absolute inset-x-4 bottom-4 bg-red-950/90 text-red-200 text-xs font-semibold p-3 rounded-xl z-10 text-center">{modelLoadError}</div>
             )}
             {isVerifying && livenessStatus === 'challenge' && <div className="absolute inset-x-0 bottom-0 bg-slate-900/80 py-6 text-center text-white font-black text-2xl uppercase animate-pulse">Blink Now!</div>}
             {isVerifying && (livenessStatus === 'checking_location' || livenessStatus === 'success') && <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center"><Loader2 className="w-16 h-16 text-white animate-spin" /></div>}
             {showEnroll && (
               <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
                 <p className="text-white text-sm font-black uppercase tracking-widest">{hasFace ? 'Re-Enroll Face' : 'Face Enrollment Required'}</p>
                 <p className="text-white/90 text-lg font-black">Step {enrollStep + 1} / 3</p>
                 <p className="text-primary-300 text-xs font-bold uppercase tracking-widest">
                   {enrollStep === 0 ? 'Look straight at the camera' : enrollStep === 1 ? 'Tilt slightly to your left' : 'Tilt slightly to your right'}
                 </p>
                 <div className="flex items-center gap-2">
                   {[0, 1, 2].map(i => (
                     <span key={i} className={`w-3 h-3 rounded-full ${enrollSamples[i] ? 'bg-green-400' : enrollStep === i ? 'bg-primary-400 animate-pulse' : 'bg-slate-600'}`}></span>
                   ))}
                 </div>
                 {enrollError && <p className="text-red-300 text-xs font-bold max-w-xs">{enrollError}</p>}
                 {enrollStep < 3 ? (
                   <button
                     onClick={captureEnrollSample}
                     disabled={enrollStatus === 'recording' || enrollStatus === 'saving'}
                     className="flex items-center gap-2 py-4 px-8 rounded-2xl bg-primary-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-primary-700 disabled:opacity-50"
                   >
                     {enrollStatus === 'recording' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                     {enrollSamples[enrollStep] ? 'Retake' : 'Capture'} Step {enrollStep + 1}
                   </button>
                 ) : (
                   <button
                     onClick={saveEnrollment}
                     disabled={enrollStatus === 'saving' || enrollStatus === 'recording'}
                     className="flex items-center gap-2 py-4 px-8 rounded-2xl bg-green-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-green-700 disabled:opacity-50"
                   >
                     {enrollStatus === 'saving' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                     Save Face Enrollment
                   </button>
                 )}
                 {hasFace && (
                   <button onClick={() => setShowEnroll(false)} className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-white">
                     Cancel
                   </button>
                 )}
               </div>
             )}
           </div>
           <div className="w-full max-w-lg space-y-6">
             {result && <div className={`p-5 rounded-2xl border-2 ${result.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}><p className="text-lg font-black">{result.message}</p></div>}
             {gpsError && (
               <div className="p-5 rounded-2xl border-2 bg-amber-50 border-amber-200 text-amber-900">
                 <p className="text-sm font-black">{gpsError}</p>
                 <button onClick={handleVerify} disabled={isVerifying || !isTrulyOpen} className="mt-4 w-full py-3 rounded-2xl bg-amber-500 text-white font-black uppercase text-xs hover:bg-amber-600 disabled:opacity-50 transition-all">
                   Retry Location Check
                 </button>
               </div>
             )}
             <button onClick={handleVerify} disabled={isVerifying || result?.success || !isTrulyOpen || showEnroll} className={`w-full py-6 rounded-3xl font-black uppercase text-sm ${isVerifying || result?.success || !isTrulyOpen || showEnroll ? 'bg-slate-200 text-slate-400' : 'bg-primary-600 text-white shadow-xl shadow-primary-200'}`}>
               {isVerifying ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (result?.success ? 'Marked' : 'Confirm Attendance')}
             </button>
             {hasFace && !showEnroll && (
               <button onClick={openReEnroll} className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all">
                 Re-Enroll Face
               </button>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
