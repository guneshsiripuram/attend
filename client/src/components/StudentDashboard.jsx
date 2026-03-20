import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, MapPin, CheckCircle, XCircle, Loader2, Calendar, Percent, Shield as ShieldIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BRANCHES, SECTIONS } from '../constants';
import FaceService from '../services/FaceService';

const StudentDashboard = ({ user }) => {
  const webcamRef = useRef(null);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ percentage: 0, present: 0, total: 30 });
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [section, setSection] = useState('');
  const [currLocation, setCurrLocation] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const autoVerifyTimeout = useRef(null);
  
  // Session Gates
  const [session, setSession] = useState({ is_open: false, expires_at: null });
  const [isSessionLoading, setIsSessionLoading] = useState(true);

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

  const fetchSession = async () => {
    try {
      const resp = await axios.get('/admin/session'); // Students use the same endpoint (or a read-only one)
      setSession(resp.data);
    } catch (err) {
      console.error('Failed to fetch session', err);
      // If unauthorized or error, keep it closed to be safe
      setSession({ is_open: false, expires_at: null, error: true });
    } finally {
      setSessionLoading(false);
    }
  };

  React.useEffect(() => {
    FaceService.loadModels().then(() => setIsModelsLoaded(true));
    fetchSession();
    const interval = setInterval(fetchSession, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = async (manualImage = null) => {
    if (isVerifying || !isModelsLoaded || !session.is_open) return;
    
    const imageToVerify = manualImage || webcamRef.current.getScreenshot();
    if (!imageToVerify) return;

    if (!rollNumber || !section || !branch) {
      setResult({ success: false, message: 'Please enter Roll Number, Branch and Section' });
      return;
    }

    setIsVerifying(true);
    
    const performVerify = async (lat, lng) => {
      try {
        const descriptor = await FaceService.getDescriptorFromBase64(imageToVerify);
        if (!descriptor) {
          throw new Error('No face detected. Please ensure your face is clearly visible.');
        }

        const resp = await axios.post('/attendance/verify', {
          face_descriptor: descriptor,
          isAuto: true,
          rollNumber,
          section,
          branch,
          location: { lat, lng }
        });
        setResult({ success: true, message: resp.data.message });
        fetchHistory();
        setIsAutoMode(false); 
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Verification failed';
        setResult({ success: false, message: errorMsg });
        
        if (err.response?.status === 403) {
          setIsAutoMode(false);
        }
      } finally {
        setIsVerifying(false);
      }
    };

    if (currLocation) {
      await performVerify(currLocation.lat, currLocation.lng);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrLocation(loc);
          performVerify(loc.lat, loc.lng);
        },
        (err) => {
          setResult({ success: false, message: 'Location access denied.' });
          setIsVerifying(false);
        },
        { timeout: 5000 }
      );
    } else {
      setResult({ success: false, message: 'Geolocation not supported' });
      setIsVerifying(false);
    }
  };

  // Adaptive Auto-Verify Loop
  React.useEffect(() => {
    if (isAutoMode && rollNumber && section && branch && !result?.success && !isVerifying && session.is_open) {
      autoVerifyTimeout.current = setTimeout(() => {
        handleVerify();
      }, 1500);
    }
    return () => clearTimeout(autoVerifyTimeout.current);
  }, [isAutoMode, rollNumber, section, branch, result, isVerifying, session.is_open]);

  const chartData = [
    { name: 'Present', value: stats.present },
    { name: 'Absent', value: stats.total - stats.present },
  ];
  const COLORS = ['#0ea5e9', '#e2e8f0'];

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
              <p className="text-sm text-slate-500 font-semibold">Goal</p>
              <p className="text-xl font-bold">{stats.total} Days</p>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl shadow-lg flex-1 h-[400px] overflow-hidden flex flex-col">
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
                      <p className="font-semibold text-sm">{new Date(log.timestamp).toLocaleDateString()}</p>
                      <p className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</p>
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
       <div className="lg:col-span-2">
         <div className="glass p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-8 min-h-[600px]">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-900">Mark Attendance</h1>
              <div className="mt-4 flex flex-col items-center gap-2">
                {!session.is_open && !isSessionLoading ? (
                  <div className="flex flex-col items-center gap-2 animate-bounce">
                     <p className="text-red-500 font-black flex items-center gap-2 uppercase tracking-tighter bg-red-50 px-4 py-2 rounded-full border border-red-100">
                        <XCircle className="w-5 h-5" />
                        Portal is CLOSED
                     </p>
                     <p className="text-slate-400 text-xs font-medium italic">Wait for faculty to open the gate</p>
                  </div>
                ) : isAutoMode && rollNumber && section && branch && !result?.success ? (
                  <p className="text-primary-600 font-bold animate-pulse flex items-center justify-center gap-2 uppercase tracking-wider">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Auto-Scanning for your face...
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                   {session.is_open && (
                     <div className="flex flex-col items-end gap-1">
                       <div className="px-4 py-2 bg-white rounded-xl border border-green-200 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
                          <span className="text-[10px] font-black text-green-600 uppercase">Live</span>
                       </div>
                       <p className="text-[9px] text-green-400 font-bold">Synced just now</p>
                     </div>
                   )}
                   {session.error && (
                     <div className="px-4 py-2 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2">
                        <XCircle className="w-3 h-3 text-red-500" />
                        <span className="text-[10px] font-black text-red-600 uppercase">Sync Error</span>
                     </div>
                   )}
                    <p className="text-slate-500 text-sm">
                      {result?.success ? 'Attendance verified successfully' : 'Enter your details to start scanning'}
                    </p>
                  </div>
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
               
               {!isCameraReady && !cameraError && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50">
                   <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-2" />
                   <p className="text-sm text-slate-400">Starting Camera...</p>
                 </div>
               )}
 
               {cameraError && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                   <Camera className="w-10 h-10 text-red-500 mb-2" />
                   <p className="text-sm text-red-500 font-bold">{cameraError}</p>
                 </div>
               )}
   
              <div className={`absolute inset-0 border-8 transition-colors duration-500 pointer-events-none rounded-2xl ${
                isVerifying ? 'border-primary-500/50' : (result?.success ? 'border-green-500/50' : 'border-slate-800/10')
              }`} />
              
              {isVerifying && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                     <Loader2 className="w-12 h-12 text-white animate-spin" />
                 </div>
              )}

              {!session.is_open && !isSessionLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10 backdrop-blur-[2px] p-6 text-center z-20">
                   <div className="bg-white/95 p-8 rounded-[2rem] shadow-2xl border border-slate-200/50 flex flex-col items-center gap-4 max-w-xs animate-in zoom-in-95 duration-300">
                      <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center shadow-inner">
                         <ShieldIcon className="w-8 h-8 text-red-500" />
                      </div>
                      <div>
                         <h3 className="text-xl font-black text-slate-900">Gate is Locked</h3>
                         <p className="text-slate-500 text-sm leading-relaxed mt-2">
                           Verification is disabled until the faculty starts a session.
                         </p>
                      </div>
                   </div>
                </div>
              )}
            </div>
   
            <div className="w-full max-w-lg flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4 w-full">
                <input
                  type="text"
                  placeholder="Roll Number"
                  className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none text-center font-bold text-lg tracking-widest uppercase col-span-1"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                />
                <select
                  className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none text-center font-bold text-lg bg-white appearance-none"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  <option value="" disabled>Branch</option>
                   {BRANCHES.map(b => (
                     <option key={b} value={b}>{b}</option>
                   ))}
 
                </select>
                <select
                  className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-primary-500 outline-none text-center font-bold text-lg bg-white appearance-none"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  <option value="" disabled>Sec</option>
                   {SECTIONS.map(s => (
                     <option key={s} value={s}>{s}</option>
                   ))}
 
                </select>
              </div>
   
              {result && (
                <div className={`p-4 rounded-2xl flex items-center gap-4 animate-fade-in ${
                  result.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {result.success ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                  <p className="font-medium">{result.message}</p>
                </div>
              )}
   
              <button
                onClick={() => handleVerify()}
                disabled={isVerifying || !rollNumber || !section || !branch || result?.success || !session.is_open}
                className={`w-full py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-3 transition-all ${
                  isVerifying || !rollNumber || !section || !branch || result?.success || !session.is_open
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-200 active:scale-95'
                }`}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Identifying...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-6 h-6" />
                    <span>{!session.is_open && !isSessionLoading ? 'Gate Locked' : result?.success ? 'Attendance Marked' : 'Scan Now and Submit'}</span>
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
