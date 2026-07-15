import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, Filter, Download, Users, CheckCircle, Clock, AlertCircle, Shield, LogOut, ChevronRight, UserPlus, Settings, Database, RotateCcw, Trash2, Fingerprint, X, History, Loader, MapPin, LayoutDashboard, Calendar } from 'lucide-react';
import AttendanceHistory from './AttendanceHistory';
import { BRANCHES, SECTIONS } from '../constants';

const AdminDashboard = ({ user }) => {
  const [data, setData] = useState([]);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({ presenttoday: 0, totalstudents: 0 });
  const [filters, setFilters] = useState({ 
    name: '', 
    email: '', 
    date: new Date().toISOString().split('T')[0],
    branch: '',
    section: '',
    rollNumber: ''
  });
  const [studentFilters, setStudentFilters] = useState({
    name: '',
    rollNumber: '',
    branch: '',
    section: ''
  });
  const [rosterData, setRosterData] = useState([]);
  const [rosterSummary, setRosterSummary] = useState({ totalEnrolled: 0, presentCount: 0, absentCount: 0 });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('roster');
  const [currentPage, setCurrentPage] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [healthData, setHealthData] = useState(null);
  
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', action: null });
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    roll_number: '',
    college_email: '',
    branch: '',
    section: '',
    password: 'password123'
  });
  
  const [session, setSession] = useState({ is_open: false, starts_at: null, expires_at: null, server_time: null, campus_lat: '', campus_lng: '', max_distance_meters: '' });
  const [locSettings, setLocSettings] = useState({ lat: '', lng: '', radius: '' });
  const [locLoading, setLocLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');

  const fetchSession = useCallback(async () => {
    try {
      const resp = await axios.get('/admin/session');
      setSession(resp.data);
      setLocSettings({
        lat: resp.data.campus_lat || '',
        lng: resp.data.campus_lng || '',
        radius: resp.data.max_distance_meters || ''
      });
    } catch (err) {
      console.error('Failed to fetch session', err);
      setSession(prev => ({ ...prev, error: true }));
    }
  }, []);

  const fetchData = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    fetchSession();
    try {
      if (activeTab === 'attendance') {
        const { name, email, date, branch, section, rollNumber } = filters;
        const resp = await axios.get('/admin/attendance/all', {
          params: { name, email, date, branch, section, rollNumber }
        });
        setData(resp.data.data);
        if (resp.data.summary) setSummary(resp.data.summary);
      } else if (activeTab === 'roster') {
        const { date, branch, section } = filters;
        const resp = await axios.get('/admin/attendance/roster', {
          params: { date, branch, section }
        });
        setRosterData(resp.data.data);
        if (resp.data.summary) setRosterSummary(resp.data.summary);
      } else if (activeTab === 'students') {
        const { name, rollNumber, branch, section } = studentFilters;
        const resp = await axios.get('/admin/students', {
          params: { name, rollNumber, branch, section }
        });
        setStudents(resp.data.data);
      } else if (activeTab === 'health') {
        const resp = await axios.get('/admin/health');
        setHealthData(resp.data);
      }
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [activeTab, filters, studentFilters, fetchSession]);

  useEffect(() => {
    fetchData();
    setCurrentPage(1);
  }, [fetchData]);

  useEffect(() => {
    let interval;
    if (activeTab === 'roster' || activeTab === 'attendance') {
      interval = setInterval(() => fetchData(true), 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, fetchData]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const stringToColor = (str) => {
    let hash = 0;
    if (!str) return 'hsl(0, 0%, 50%)';
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 65%, 45%)`;
  };

  const handleToggleSession = async (minutes, startTime = null, endTime = null) => {
    setSessionLoading(true);
    try {
      const resp = await axios.post('/admin/session/toggle', {
        isOpen: !session.is_open,
        durationMinutes: !session.is_open && minutes ? minutes : null,
        startTime: !session.is_open && startTime ? new Date(startTime).toISOString() : null,
        endTime: !session.is_open && endTime ? new Date(endTime).toISOString() : null
      });
      setSession({ 
        is_open: resp.data.isOpen !== undefined ? resp.data.isOpen : !session.is_open, 
        starts_at: resp.data.startsAt, 
        expires_at: resp.data.expiresAt, 
        server_time: resp.data.serverTime || new Date() 
      });
      if (startTime) {
        setScheduleStart('');
        setScheduleEnd('');
      }
      showToast(!session.is_open ? 'Gate opened successfully' : 'Gate closed');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      alert(`Failed to update session: ${errorMsg}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleUpdateLocation = async () => {
    setLocLoading(true);
    try {
      await axios.post('/admin/session/location', locSettings);
      showToast('Geolocation settings updated successfully!');
      fetchSession();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating location');
    } finally {
      setLocLoading(false);
    }
  };

  const handleResetFace = (id) => {
    setConfirmDialog({
      isOpen: true,
      message: 'Are you sure you want to completely reset this student\'s face biometric data?',
      action: async () => {
        try {
          await axios.post(`/admin/students/${id}/reset-face`);
          fetchData();
          showToast('Face biometric data reset successfully.');
        } catch (err) {
          alert('Failed to reset face data');
        }
      }
    });
  };

  const handleDeleteStudent = (id) => {
    setConfirmDialog({
      isOpen: true,
      message: 'WARNING: Permanently delete this student and all of their attendance history? This cannot be undone.',
      action: async () => {
        try {
          await axios.delete(`/admin/students/${id}`);
          fetchData();
          showToast('Student record permanently deleted.');
        } catch (err) {
          alert('Failed to delete student');
        }
      }
    });
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    try {
      await axios.post('/auth/register', { ...newStudent, role: 'student' });
      setIsAddModalOpen(false);
      setNewStudent({ full_name: '', roll_number: '', college_email: '', branch: '', section: '', password: 'password123' });
      fetchData();
      showToast('Student enrolled successfully!');
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add student');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDownloadReport = () => {
    let exportData = activeTab === 'attendance' ? data : (activeTab === 'roster' ? rosterData : []);
    if (exportData.length === 0) return alert('No data to export');

    const headers = ['Name', 'Roll Number', 'Branch', 'Section', 'Email', 'Date', 'Time', 'Status'];
    const rows = exportData.map(log => [
      log.full_name, log.roll_number, log.branch || '--', log.section || '--', 
      log.college_email || log.email || '--', 
      new Date(log.timestamp).toLocaleDateString(), 
      new Date(log.timestamp).toLocaleTimeString(), 
      log.status
    ]);

    const escapeCSV = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => escapeCSV(cell)).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_Report_${activeTab}_${filters.date}.csv`;
    link.click();
  };

  const [matrixData, setMatrixData] = useState({ dates: [], rows: [] });
  const [matrixRange, setMatrixRange] = useState({ 
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [matrixLoading, setMatrixLoading] = useState(false);

  const fetchMatrix = useCallback(async () => {
    setMatrixLoading(true);
    try {
      const resp = await axios.get('/admin/attendance/matrix', { 
        params: { ...filters, startDate: matrixRange.start, endDate: matrixRange.end } 
      });
      // Bulletproof the response to prevent map() crashes on undefined properties
      setMatrixData({ 
        dates: resp.data?.dates || [], 
        rows: resp.data?.rows || [] 
      });
    } catch (err) {
      console.error('Matrix fetch failed', err);
    } finally {
      setMatrixLoading(false);
    }
  }, [filters, matrixRange]);

  useEffect(() => {
    if (activeTab === 'matrix') {
      fetchMatrix();
    }
  }, [activeTab, fetchMatrix]);

  const handleDownloadMatrix = () => {
    if (!matrixData.rows.length) return alert('No data to export');
    const headers = ['S.No', 'Roll Number', 'Name', 'Branch', 'Section', ...matrixData.dates.map(d => new Date(d).toLocaleDateString('en-IN')), 'Total', 'Present'];
    const rows = matrixData.rows.map(r => {
      const att = matrixData.dates.map(d => (r.attendance[d] === 'M' || r.attendance[d] === 'A' || r.attendance[d] === 'P' || r.attendance[d] === 'Present' ? 'P' : '-'));
      return [r.sn, r.roll, r.name, r.branch, r.section, ...att, matrixData.dates.length, att.filter(v => v === 'P').length];
    });
    const escapeCSV = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => escapeCSV(cell)).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Matrix_${matrixRange.start}_to_${matrixRange.end}.csv`;
    link.click();
  };

  const menuItems = [
    { id: 'roster', label: 'Class Roster', icon: Users },
    { id: 'attendance', label: 'Live Logs', icon: LayoutDashboard },
    { id: 'matrix', label: 'Master Matrix', icon: Filter },
    { id: 'history', label: 'Daily History', icon: Calendar },
    { id: 'students', label: 'Manage Students', icon: Users },
    { id: 'settings', label: 'Portal Settings', icon: Settings },
    { id: 'health', label: 'System Health', icon: Database },
  ];

  return (
    <div className="flex h-[calc(100vh-100px)] -mt-8 -mx-4 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-6 hidden md:flex flex-col gap-8 h-full flex-shrink-0 z-20">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-primary-500 rounded-lg shadow-lg shadow-primary-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">Admin OS</span>
        </div>

        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/50' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-800">
           <div className="p-4 bg-slate-800/50 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-primary-500/20">A</div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold truncate">{user?.full_name || 'Super Admin'}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{user?.college_email || 'Authorized'}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between z-10 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              {menuItems.find(i => i.id === activeTab).label}
            </h1>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mt-1">
              Portal Management & Monitoring
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-all ${session.is_open ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`w-2 h-2 rounded-full ${session.is_open ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{session.is_open ? 'Gate Open' : 'Gate Closed'}</span>
            </div>
            
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all transform active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
            {(activeTab === 'attendance' || activeTab === 'roster') && (
              <button 
                onClick={handleDownloadReport}
                className="p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all border border-slate-100 shadow-sm"
                title="Download Report"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
          
          {(activeTab === 'attendance' || activeTab === 'roster') && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 my-8">
                {[
                  { label: activeTab === 'roster' ? 'Total Enrolled' : 'Total Students', value: activeTab === 'roster' ? rosterSummary.totalEnrolled : summary.totalstudents, icon: Users, color: 'bg-indigo-500', light: 'bg-indigo-50', text: 'text-indigo-600' },
                  { label: 'Present Today', value: activeTab === 'roster' ? rosterSummary.presentCount : summary.presenttoday, icon: CheckCircle, color: 'bg-green-500', light: 'bg-green-50', text: 'text-green-600' },
                  { label: 'Absent Today', value: activeTab === 'roster' ? rosterSummary.absentCount : (summary.totalstudents - summary.presenttoday), icon: AlertCircle, color: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-600' },
                  { label: 'Attendance %', value: `${(activeTab === 'roster' ? (rosterSummary.totalEnrolled ? (rosterSummary.presentCount/rosterSummary.totalEnrolled)*100 : 0) : (summary.totalstudents ? (summary.presenttoday/summary.totalstudents)*100 : 0)).toFixed(0)}%`, icon: LayoutDashboard, color: 'bg-primary-500', light: 'bg-primary-50', text: 'text-primary-600' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 ${stat.light} rounded-full opacity-20 transition-transform group-hover:scale-150`}></div>
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`w-12 h-12 ${stat.light} rounded-2xl flex items-center justify-center`}>
                        <stat.icon className={`w-6 h-6 ${stat.text}`} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <p className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm mb-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none text-xs font-bold" value={filters.name} onChange={e => setFilters({...filters, name: e.target.value})} />
                  </div>
                  <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none text-xs font-bold font-mono" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} />
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-xs font-bold" value={filters.branch} onChange={e => setFilters({...filters, branch: e.target.value})}>
                    <option value="">All Branches</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-xs font-bold" value={filters.section} onChange={e => setFilters({...filters, section: e.target.value})}>
                    <option value="">All Sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={fetchData} className="bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                    <Filter className="w-4 h-4" /> Sync Now
                  </button>
                </div>
              </div>

              {/* Logs Table */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Student Information</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Course Detail</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Verification Log</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Gate Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading && (activeTab === 'attendance' ? data : rosterData).length === 0 ? (
                      <tr><td colSpan="4" className="p-20 text-center"><Loader className="w-10 h-10 animate-spin mx-auto text-primary-500 mb-4" /><p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Establishing Secure Sync...</p></td></tr>
                    ) : (activeTab === 'attendance' ? data : rosterData).length === 0 ? (
                      <tr><td colSpan="4" className="p-20 text-center text-slate-400 italic font-semibold">No records discovered for this timeframe.</td></tr>
                    ) : (activeTab === 'attendance' ? data : rosterData).slice((currentPage - 1) * 50, currentPage * 50).map((log, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-500 text-sm group-hover:bg-white group-hover:shadow-md transition-all">
                                 #{(currentPage - 1) * 50 + i + 1}
                              </div>
                              <div>
                                 <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{log.full_name}</p>
                                 <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider font-mono">{log.roll_number}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-6">
                           <div className="space-y-1">
                              <span className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-wider">{log.branch || 'CSE'}</span>
                              <p className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-tighter">Section {log.section || 'A'}</p>
                           </div>
                        </td>
                        <td className="px-6 py-6 font-mono text-[10px] text-slate-500 font-bold">
                           {log.timestamp ? (
                             <div className="flex flex-col gap-1">
                               <div className="flex items-center gap-1.5 text-slate-800">
                                 <Clock className="w-3.5 h-3.5 text-primary-500" />
                                 {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                               </div>
                               <p className="opacity-60">{new Date(log.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                             </div>
                           ) : '-- : --'}
                        </td>
                        <td className="px-8 py-6 text-right">
                           <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${log.status === 'Present' || log.status === 'P' || log.status === 'M' ? 'bg-green-50 border-green-100 text-green-700 shadow-sm shadow-green-100' : 'bg-red-50 border-red-100 text-red-700'}`}>
                             {log.status === 'M' ? 'Morning Scan' : (log.status === 'P' ? 'Afternoon Scan' : log.status)}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {((activeTab === 'attendance' ? data : rosterData).length > 50) && (
                <div className="flex items-center justify-between mt-6 px-4">
                   <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Showing {(currentPage - 1) * 50 + 1} - {Math.min(currentPage * 50, (activeTab === 'attendance' ? data : rosterData).length)} of {(activeTab === 'attendance' ? data : rosterData).length}</p>
                   <div className="flex items-center gap-2">
                     <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">Previous</button>
                     <button disabled={currentPage * 50 >= (activeTab === 'attendance' ? data : rosterData).length} onClick={() => setCurrentPage(p => p + 1)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">Next</button>
                   </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'matrix' && (
             <div className="space-y-8 mt-8">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                   <div className="flex flex-wrap items-end gap-6">
                      <div className="flex-1 min-w-[300px]">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Reporting Range</label>
                         <div className="flex items-center gap-3">
                            <input type="date" className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold font-mono outline-none" value={matrixRange.start} onChange={e => setMatrixRange({...matrixRange, start: e.target.value})} />
                            <span className="font-black text-slate-300">➜</span>
                            <input type="date" className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold font-mono outline-none" value={matrixRange.end} onChange={e => setMatrixRange({...matrixRange, end: e.target.value})} />
                         </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-40">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Branch</label>
                           <select className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" value={filters.branch} onChange={e => setFilters({...filters, branch: e.target.value})}>
                              <option value="">All Branches</option>
                              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                           </select>
                        </div>
                        <div className="w-40">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Section</label>
                           <select className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" value={filters.section} onChange={e => setFilters({...filters, section: e.target.value})}>
                              <option value="">All Sections</option>
                              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={fetchMatrix} className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 transition-all"><Search className="w-5 h-5" /></button>
                        <button onClick={handleDownloadMatrix} className="px-8 py-4 bg-green-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-green-100 hover:bg-green-700 transition-all flex items-center gap-2 px-10">
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                   </div>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden">
                   <div className="max-h-[600px] overflow-auto custom-scrollbar relative">
                      <table className="w-full text-left border-collapse">
                         <thead className="sticky top-0 z-40">
                            <tr className="bg-slate-900 text-white font-mono">
                               <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest sticky left-0 z-50 bg-slate-900 border-r border-slate-800">S.No</th>
                               <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest sticky left-16 z-50 bg-slate-900 min-w-[250px] border-r border-slate-800">Student Identity</th>
                               {matrixData.dates.map(date => (
                                 <th key={date} className="px-4 py-5 text-[9px] font-black uppercase tracking-widest text-center border-l border-slate-800 min-w-[100px] whitespace-nowrap bg-slate-900/90 backdrop-blur-md">
                                    {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                 </th>
                               ))}
                               <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-center border-l bg-slate-800 sticky right-0 z-30 shadow-2xl border-slate-700">Analytics</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {matrixLoading ? (
                               <tr><td colSpan={matrixData.dates.length + 3} className="p-24 text-center text-slate-400 font-black uppercase tracking-[0.3em] animate-pulse">Establishing Data Grid...</td></tr>
                            ) : matrixData.rows.map(row => {
                               const presentCount = matrixData.dates.filter(d => row.attendance[d] === 'P' || row.attendance[d] === 'M' || row.attendance[d] === 'Present').length;
                               const percentage = Math.round((presentCount / (matrixData.dates.length || 1)) * 100);
                               return (
                                 <tr key={row.roll} className="hover:bg-slate-50 transition-colors group border-b border-slate-50">
                                    <td className="px-6 py-4 text-[10px] font-black text-slate-400 sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-100 text-center">{row.sn}</td>
                                    <td className="px-8 py-4 sticky left-16 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200">
                                       <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{row.name}</p>
                                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 font-mono">{row.roll}</p>
                                    </td>
                                    {matrixData.dates.map(date => {
                                      const status = row.attendance[date] || '-';
                                      const isPresent = ['M','A','P','Present'].includes(status);
                                      return (
                                        <td key={date} className={`px-4 py-4 text-center border-l border-slate-50 ${isPresent ? 'bg-green-500/5' : ''}`}>
                                           <span className={`text-xs font-black ${isPresent ? 'text-green-600 drop-shadow-sm' : 'text-slate-200'}`}>{isPresent ? 'P' : '-'}</span>
                                        </td>
                                      )
                                    })}
                                    <td className="px-8 py-4 bg-slate-50/80 sticky right-0 z-20 backdrop-blur-sm border-l border-slate-200 group-hover:bg-slate-100 transition-colors">
                                       <div className="flex flex-col items-center">
                                          <p className={`text-lg font-black tracking-tighter ${percentage >= 75 ? 'text-green-600' : 'text-red-500'}`}>{percentage}%</p>
                                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Aggregate</p>
                                       </div>
                                    </td>
                                 </tr>
                               )
                            })}
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>
          )}

          {activeTab === 'students' && (
            <div className="mt-8 space-y-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search Registrations..." className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none text-xs font-bold" value={studentFilters.name} onChange={e => setStudentFilters({...studentFilters, name: e.target.value})} />
                  </div>
                  <select className="px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" value={studentFilters.branch} onChange={e => setStudentFilters({...studentFilters, branch: e.target.value})}>
                    <option value="">All Branches</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select className="px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none" value={studentFilters.section} onChange={e => setStudentFilters({...studentFilters, section: e.target.value})}>
                    <option value="">All Sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={fetchData} className="px-8 py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                    <Users className="w-4 h-4" /> Filter Registry
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Information</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Enrolled Course</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Secure Contact</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading && students.length === 0 ? (
                      <tr><td colSpan="4" className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest">Accessing Roster Vault...</td></tr>
                    ) : students.length === 0 ? (
                      <tr><td colSpan="4" className="p-20 text-center text-slate-400 italic font-semibold">No students found matching these filters.</td></tr>
                    ) : students.slice((currentPage - 1) * 50, currentPage * 50).map((student, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-50">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-500 text-sm group-hover:bg-white group-hover:shadow-md transition-all">
                                 #{(currentPage - 1) * 50 + i + 1}
                              </div>
                              <div>
                                 <p className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                    {student.full_name}
                                    {student.has_face_data ? (
                                       <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Face Enrolled"></span>
                                    ) : (
                                       <span className="w-2 h-2 rounded-full bg-slate-200" title="Face Not Enrolled"></span>
                                    )}
                                 </p>
                                 <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest font-mono">{student.roll_number}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-6">
                           <div className="flex flex-col gap-1">
                              <span className="inline-flex px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wider w-fit">{student.branch}</span>
                              <p className="text-[10px] font-bold text-slate-400 ml-1">SEC-{student.section}</p>
                           </div>
                        </td>
                        <td className="px-6 py-6">
                           <p className="text-xs font-bold text-slate-600 font-mono italic opacity-70 underline decoration-slate-200 underline-offset-4">{student.college_email}</p>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                              <button onClick={() => handleResetFace(student.id)} className="p-3 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-2xl transition-all shadow-sm bg-white" title="Reset Biometrics"><Fingerprint className="w-4.5 h-4.5" /></button>
                              <button onClick={() => handleDeleteStudent(student.id)} className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all shadow-sm bg-white" title="Purge Account"><Trash2 className="w-4.5 h-4.5" /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(students.length > 50) && (
                <div className="flex items-center justify-between mt-6 px-4">
                   <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Showing {(currentPage - 1) * 50 + 1} - {Math.min(currentPage * 50, students.length)} of {students.length}</p>
                   <div className="flex items-center gap-2">
                     <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">Previous</button>
                     <button disabled={currentPage * 50 >= students.length} onClick={() => setCurrentPage(p => p + 1)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">Next</button>
                   </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && <AttendanceHistory />}

          {activeTab === 'health' && (
             <div className="mt-8 max-w-2xl mx-auto animate-fade-in">
               <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center relative overflow-hidden">
                 <div className={`absolute top-0 left-0 w-full h-2 ${healthData?.database === 'connected' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                 <Database className={`w-20 h-20 mx-auto mb-6 drop-shadow-md ${healthData?.database === 'connected' ? 'text-green-500' : 'text-amber-500'}`} />
                 <h2 className="text-3xl font-black text-slate-900 tracking-tight">System Health</h2>
                 
                 {loading && !healthData ? (
                   <p className="text-slate-400 mt-6 animate-pulse font-bold uppercase tracking-widest text-xs">Pinging core servers...</p>
                 ) : (
                   <>
                     <div className={`mt-4 inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${healthData?.database === 'connected' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        <div className={`w-2 h-2 rounded-full animate-pulse ${healthData?.database === 'connected' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                        {healthData?.database === 'connected' ? 'Database Connected' : 'Database Offline'}
                     </div>
                     <p className="text-slate-500 mt-6 font-medium leading-relaxed">
                        Database connections and biometric facial models are fully operational.
                     </p>
                     {healthData?.metrics && (
                       <div className="mt-8 grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Logs Indexed</p>
                             <p className="text-2xl font-black text-slate-900">{healthData.metrics.total_logs.toLocaleString()}</p>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Users Enrolled</p>
                             <p className="text-2xl font-black text-slate-900">{healthData.metrics.total_users.toLocaleString()}</p>
                          </div>
                       </div>
                     )}
                   </>
                 )}
               </div>
             </div>
          )}

          {activeTab === 'settings' && (
             <div className="mt-12 max-w-4xl mx-auto">
                <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-primary-50 rounded-full blur-[100px] -mr-32 -mt-32 opacity-60"></div>
                   
                   <div className="relative z-10 flex flex-col md:flex-row items-center gap-16">
                      <div className="flex-1 space-y-8">
                         <div className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-2xl shadow-xl shadow-primary-200">
                           <Shield className="w-5 h-5 flex-shrink-0" />
                           <span className="text-[10px] font-black uppercase tracking-[0.2em]">Security Protocol Admin</span>
                         </div>
                         <h2 className="text-5xl font-black text-slate-900 leading-[1.1] tracking-tighter">Command <span className="text-primary-600 whitespace-nowrap overflow-hidden inline-block align-bottom animate-typing italic">Access</span> Portal</h2>
                         <p className="text-slate-500 text-lg font-medium leading-relaxed">
                            Globally control the attendance gate. Only when the gate is <span className="text-green-600 font-black">OPEN</span> can students perform biometric verification.
                         </p>

                         {session.is_open ? (
                           <div className="space-y-6 pt-4">
                              <div className={`p-8 border-2 rounded-[3rem] shadow-sm flex items-center justify-between transition-all duration-700 ${new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200 animate-pulse'}`}>
                                 <div className="flex items-center gap-5">
                                    <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-2xl ${new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'bg-amber-500 shadow-amber-200' : 'bg-green-500 shadow-green-200'}`}>
                                       <Clock className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                       <p className={`text-2xl font-black tracking-tight ${new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'text-amber-800' : 'text-green-800'}`}>{new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'GATE SCHEDULED' : 'GATE IS LIVE'}</p>
                                       <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? `Opens at ${new Date(session.starts_at).toLocaleTimeString()}` : 'Receiving biometric pings'}</p>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Time Left</p>
                                    <p className="text-3xl font-black text-slate-900 font-mono tabular-nums leading-none">
                                       {session.expires_at ? (() => {
                                           const diff = new Date(session.expires_at) - now;
                                           if (diff <= 0) return '00:00';
                                           const m = Math.floor(diff / 60000);
                                           const s = Math.floor((diff % 60000) / 1000);
                                           return `${m}:${s.toString().padStart(2, '0')}`;
                                       })() : '--:--'}
                                    </p>
                                 </div>
                              </div>
                              <button onClick={() => handleToggleSession(null)} className="w-full py-6 text-white bg-slate-900 hover:bg-black rounded-[2.5rem] shadow-2xl transition-all flex items-center justify-center gap-4 group">
                                 <LogOut className="w-6 h-6 transition-transform group-hover:scale-125" />
                                 <span className="text-sm font-black uppercase tracking-[0.3em]">Deactivate Secure Gate</span>
                              </button>
                           </div>
                         ) : (
                           <div className="space-y-8 pt-4 animate-in slide-in-from-bottom-5 duration-700">
                               <div className="grid grid-cols-3 gap-5">
                                  {[10, 20, 30].map(m => (
                                    <button key={m} onClick={() => handleToggleSession(m)} className="p-8 bg-white border border-slate-100 rounded-[2.5rem] hover:border-primary-500 hover:shadow-2xl hover:shadow-primary-100 transition-all group flex flex-col items-center gap-3">
                                       <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-primary-500 group-hover:text-white transition-all"><Clock className="w-6 h-6" /></div>
                                       <span className="text-[10px] font-black text-slate-400 group-hover:text-primary-700 uppercase tracking-widest">{m} MINS</span>
                                    </button>
                                  ))}
                               </div>
                               <div className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100">
                                  <div className="flex flex-col md:flex-row gap-6 items-end">
                                     <div className="flex-1 space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Scheduled Window</label>
                                        <div className="flex gap-4">
                                           <input type="datetime-local" className="flex-1 px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 text-xs font-bold font-mono" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} />
                                           <input type="datetime-local" className="flex-1 px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 text-xs font-bold font-mono" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} />
                                        </div>
                                     </div>
                                     <button onClick={() => handleToggleSession(null, scheduleStart, scheduleEnd)} disabled={!scheduleStart || !scheduleEnd} className="bg-primary-600 px-10 py-5 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-primary-200 hover:bg-primary-700 disabled:opacity-50 transition-all">Schedule</button>
                                  </div>
                               </div>
                           </div>
                         )}
                      </div>
                      <div className="hidden lg:flex w-80 h-80 flex-shrink-0 items-center justify-center relative scale-125">
                         <div className={`absolute inset-0 rounded-full border-[1.5rem] transition-all duration-1000 ${session.is_open ? 'border-green-500/20 animate-ping' : 'border-slate-50'}`}></div>
                         <div className={`absolute inset-0 m-6 rounded-full border-2 border-dashed transition-all duration-1000 ${session.is_open ? 'border-green-400 opacity-60 animate-spin-slow' : 'border-slate-100 opacity-40'}`}></div>
                         <Fingerprint className={`w-32 h-32 transition-all duration-1000 ${session.is_open ? 'text-green-500 drop-shadow-2xl' : 'text-slate-100'}`} />
                      </div>
                   </div>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className="px-6 py-4 bg-slate-900 text-white rounded-2xl shadow-2xl shadow-slate-900/20 flex items-center gap-3 border border-slate-700">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-sm font-bold">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full p-8 animate-in zoom-in-95 duration-200 text-center">
             <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8" />
             </div>
             <h3 className="text-xl font-black text-slate-900 mb-2">Are you sure?</h3>
             <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">{confirmDialog.message}</p>
             <div className="flex gap-3">
                <button onClick={() => setConfirmDialog({ isOpen: false, message: '', action: null })} className="flex-1 py-4 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all">Cancel</button>
                <button onClick={() => { confirmDialog.action(); setConfirmDialog({ isOpen: false, message: '', action: null }); }} className="flex-1 py-4 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all">Confirm</button>
             </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-12 duration-500">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Registry Entry</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Manual account creation</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-3 hover:bg-slate-50 rounded-2xl transition-all border border-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleAddStudent} className="p-8 space-y-6">
              <div className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Legal Full Name</label>
                    <input required type="text" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 outline-none transition-all font-bold text-sm" placeholder="e.g. ARJUN REDDY" value={newStudent.full_name} onChange={e => setNewStudent({...newStudent, full_name: e.target.value.toUpperCase()})} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">University Roll</label>
                      <input required type="text" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 outline-none transition-all uppercase font-mono text-sm font-black" placeholder="24981..." value={newStudent.roll_number} onChange={e => setNewStudent({...newStudent, roll_number: e.target.value.toUpperCase()})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">College Email</label>
                      <input required type="email" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-bold" placeholder="name@college.edu" value={newStudent.college_email} onChange={e => setNewStudent({...newStudent, college_email: e.target.value})} />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Branch</label>
                      <select required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" value={newStudent.branch} onChange={e => setNewStudent({...newStudent, branch: e.target.value})}>
                        <option value="">Select</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Section</label>
                      <select required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" value={newStudent.section} onChange={e => setNewStudent({...newStudent, section: e.target.value})}>
                        <option value="">Select</option>
                        {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Temporary Password</label>
                    <input required type="text" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 outline-none transition-all font-bold text-sm" placeholder="password123" value={newStudent.password} onChange={e => setNewStudent({...newStudent, password: e.target.value})} />
                 </div>
              </div>

              {addError && <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3"><AlertCircle className="w-5 h-5" />{addError}</div>}

              <button type="submit" disabled={addLoading} className="w-full py-5 bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-[0.3em] rounded-3xl shadow-2xl transition-all shadow-slate-200 flex items-center justify-center gap-4">
                {addLoading ? <Loader className="w-6 h-6 animate-spin" /> : <UserPlus className="w-6 h-6" />}
                {addLoading ? 'REGISTERING...' : 'REGISTER STUDENT ENROLLMENT'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
