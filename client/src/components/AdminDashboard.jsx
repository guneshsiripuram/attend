import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Filter, Download, Users, CheckCircle, Clock, AlertCircle, Shield, LogOut, ChevronRight, UserPlus, Settings, Database, RotateCcw, Trash2, Fingerprint, X, History, Loader, MapPin, UserCheck, LayoutDashboard, Calendar } from 'lucide-react';
import AttendanceHistory from './AttendanceHistory';
import { BRANCHES, SECTIONS } from '../constants';

const AdminDashboard = () => {
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
  
  // New States for Add Student Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    roll_number: '',
    college_email: '',
    branch: '',
    section: '',
    password: 'password123' // Default password
  });
  
  // Session Gate States
  const [session, setSession] = useState({ is_open: false, starts_at: null, expires_at: null, server_time: null });
  const [sessionLoading, setSessionLoading] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');

  const fetchSession = async () => {
    try {
      const resp = await axios.get('/admin/session');
      setSession(resp.data);
    } catch (err) {
      console.error('Failed to fetch session', err);
      setSession(prev => ({ ...prev, error: true }));
    }
  };

  const fetchData = async () => {
    setLoading(true);
    fetchSession(); // Also fetch session status
    try {
      if (activeTab === 'attendance') {
        const { name, email, date, branch, section, rollNumber } = filters;
        const resp = await axios.get('/admin/attendance/all', {
          params: { name, email, date, branch, section, rollNumber }
        });
        setData(resp.data.data);
        if (resp.data.summary) {
          setSummary(resp.data.summary);
        }
      } else if (activeTab === 'roster') {
        const { date, branch, section } = filters;
        const resp = await axios.get('/admin/attendance/roster', {
          params: { date, branch, section }
        });
        setRosterData(resp.data.data);
        if (resp.data.summary) {
          setRosterSummary(resp.data.summary);
        }
      } else if (activeTab === 'students') {
        const { name, rollNumber, branch, section } = studentFilters;
        const resp = await axios.get('/admin/students', {
          params: { name, rollNumber, branch, section }
        });
        setStudents(resp.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [
    activeTab,
    filters.date, filters.name, filters.branch, filters.section, filters.rollNumber,
    studentFilters.name, studentFilters.rollNumber, studentFilters.branch, studentFilters.section
  ]);

  // Live polling effect specifically for the roster
  useEffect(() => {
    let interval;
    if (activeTab === 'roster' || activeTab === 'attendance') {
      interval = setInterval(() => {
        fetchData();
      }, 5000); // Poll every 5 seconds for real-time updates
    }
    return () => clearInterval(interval);
  }, [activeTab, filters.date, filters.branch, filters.section]);

  // Handle Session Toggle
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
        is_open: !session.is_open, 
        starts_at: resp.data.startsAt, 
        expires_at: resp.data.expiresAt, 
        server_time: resp.data.serverTime || new Date() 
      });
      if (startTime) {
        setScheduleStart('');
        setScheduleEnd('');
      }
    } catch (err) {
      console.error('--- FULL_TOGGLE_ERROR ---', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      const details = err.response?.data?.details || 'Check console for full trace';
      alert(`Failed to update session: ${errorMsg}\n\nDetails: ${details}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData();
  };

  const handleResetFace = async (id) => {
    if (!window.confirm('Are you sure you want to reset this student\'s face data? They will need to re-enroll next time they log in.')) return;
    try {
      await axios.post(`/admin/students/${id}/reset-face`);
      fetchData();
    } catch (err) {
      alert('Failed to reset face data');
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('DANGER: This will permanently delete the student and ALL their attendance logs. Proceed?')) return;
    try {
      await axios.delete(`/admin/students/${id}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete student');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    try {
      await axios.post('/auth/register', {
        ...newStudent,
        role: 'student'
      });
      setIsAddModalOpen(false);
      setNewStudent({
        full_name: '',
        roll_number: '',
        college_email: '',
        branch: '',
        section: '',
        password: 'password123'
      });
      fetchData();
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add student');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDownloadReport = () => {
    // Determine which dataset to export based on active tab
    let exportData = [];
    let filename = `Attendance_Report_${filters.date || 'Export'}.csv`;

    if (activeTab === 'attendance') {
      exportData = data;
    } else if (activeTab === 'roster') {
      exportData = rosterData;
      filename = `Live_Roster_${filters.date || 'Export'}.csv`;
    } else if (activeTab === 'history') {
      alert('Please use the "Download" button inside the Daily History section to export historical records.');
      return;
    }

    if (!exportData || exportData.length === 0) {
      alert('No data to export for current view');
      return;
    }

    // Create CSV header (Now including more student details)
    const headers = ['Name', 'Roll Number', 'Branch', 'Section', 'Email', 'Date', 'Time', 'Status'];
    
    // Convert data to rows
    const rows = exportData.map(log => [
      log.full_name,
      log.roll_number,
      log.branch || '--',
      log.section || '--',
      log.college_email || log.email || '--',
      new Date(log.timestamp).toLocaleDateString(),
      new Date(log.timestamp).toLocaleTimeString(),
      log.status
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [matrixData, setMatrixData] = useState({ dates: [], rows: [] });
  const [matrixRange, setMatrixRange] = useState({ start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
  const [matrixLoading, setMatrixLoading] = useState(false);

  const fetchMatrix = useCallback(async () => {
    setMatrixLoading(true);
    try {
      const resp = await axios.get('/admin/attendance/matrix', { 
        params: { 
          branch: filters.branch, 
          section: filters.section, 
          startDate: matrixRange.start, 
          endDate: matrixRange.end,
          rollNumber: filters.rollNumber
        } 
      });
      setMatrixData(resp.data);
    } catch (err) {
      console.error('Matrix fetch failed', err);
    } finally {
      setMatrixLoading(false);
    }
  }, [filters.branch, filters.section, filters.rollNumber, matrixRange]);

  useEffect(() => {
    if (activeTab === 'matrix') fetchMatrix();
  }, [activeTab, fetchMatrix]);

  const handleDownloadMatrix = () => {
    if (!matrixData.rows.length) return alert('No data to export');
    
    const headers = [
      'S.No', 'Roll Number', 'Name', 'Branch', 'Section', 
      ...matrixData.dates.map(d => new Date(d).toLocaleDateString('en-IN')),
      'Total Days', 'No. of Presentees'
    ];
    const rows = matrixData.rows.map(r => {
      const attendanceValues = matrixData.dates.map(d => {
        const status = r.attendance[d] || '-';
        return status === 'M' ? 'P' : status;
      });
      const presentCount = attendanceValues.filter(v => v === 'P').length;
      
      return [
        r.sn,
        r.roll,
        r.name,
        r.branch,
        r.section,
        ...attendanceValues,
        matrixData.dates.length,
        presentCount
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Master_Attendance_Matrix_${matrixRange.start}_to_${matrixRange.end}.csv`;
    link.click();
  };

  const menuItems = [
    { id: 'roster', label: 'Class Roster', icon: Users },
    { id: 'attendance', label: 'Live Logs', icon: LayoutDashboard },
    { id: 'matrix', label: 'Master Matrix', icon: Filter },
    { id: 'history', label: 'Daily History', icon: Calendar },
    { id: 'students', label: 'Manage Students', icon: Users },
    { id: 'system', label: 'System Health', icon: Database },
    { id: 'settings', label: 'Portal Settings', icon: Settings },
  ];

  return (
    <div className="flex h-[calc(100vh-100px)] -mt-8 -mx-4 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-6 hidden md:flex flex-col gap-8 h-full flex-shrink-0 z-20">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-primary-500 rounded-lg">
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
              <span className="font-semibold">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-800">
           <div className="p-4 bg-slate-800/50 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center font-bold">R</div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold truncate">Super Admin</p>
                <p className="text-xs text-slate-500 truncate">raghumail</p>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-slate-100/50 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
              {menuItems.find(i => i.id === activeTab).label}
            </h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
              Portal Management & Monitoring
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <div className={`w-2 h-2 rounded-full ${session.is_open ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
              <span className="text-xs font-bold text-slate-600 uppercase">{session.is_open ? 'Gate Open' : 'Gate Closed'}</span>
            </div>
            
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all transform active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
            <button 
              onClick={handleDownloadReport}
              className="p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all border border-transparent hover:border-primary-100"
              title="Download Current View"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </header>

        {activeTab === 'attendance' || activeTab === 'roster' ? (
          <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar bg-slate-50/30">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 my-8">
              {[
                { 
                  label: activeTab === 'roster' ? 'Total Enrolled' : 'Total Students', 
                  value: activeTab === 'roster' ? rosterSummary.totalEnrolled : summary.totalstudents, 
                  icon: Users, 
                  color: 'bg-indigo-500', 
                  light: 'bg-indigo-50' 
                },
                { 
                  label: 'Present Today', 
                  value: activeTab === 'roster' ? rosterSummary.presentCount : summary.presenttoday, 
                  icon: CheckCircle, 
                  color: 'bg-green-500', 
                  light: 'bg-green-50' 
                },
                { 
                  label: 'Absent Today', 
                  value: activeTab === 'roster' ? rosterSummary.absentCount : (summary.totalstudents - summary.presenttoday), 
                  icon: Clock, 
                  color: 'bg-amber-500', 
                  light: 'bg-amber-50' 
                },
                { 
                  label: 'Attendance %', 
                  value: activeTab === 'roster' 
                    ? `${rosterSummary.totalEnrolled ? Math.round((rosterSummary.presentCount/rosterSummary.totalEnrolled)*100) : 0}%` 
                    : `${summary.totalstudents ? Math.round((summary.presenttoday/summary.totalstudents)*100) : 0}%`, 
                  icon: Filter, 
                  color: 'bg-primary-500', 
                  light: 'bg-primary-50' 
                },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 ${stat.light} rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <stat.icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-black text-slate-800">{stat.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-8">
              <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="relative col-span-1 md:col-span-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={activeTab === 'attendance' ? "Search Name/Email..." : "Search Name/Roll..."}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium"
                    value={activeTab === 'attendance' ? filters.name : (filters.name || '')}
                    onChange={(e) => setFilters({...filters, name: e.target.value})}
                  />
                </div>
                
                <div className="col-span-1">
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium"
                    value={filters.date}
                    onChange={(e) => setFilters({...filters, date: e.target.value})}
                  />
                </div>

                <div className="col-span-1">
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium appearance-none cursor-pointer"
                    value={filters.branch}
                    onChange={(e) => setFilters({...filters, branch: e.target.value})}
                  >
                    <option value="">All Branches</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="col-span-1">
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium appearance-none cursor-pointer"
                    value={filters.section}
                    onChange={(e) => setFilters({...filters, section: e.target.value})}
                  >
                    <option value="">All Sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="bg-primary-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Apply Filters
                </button>
              </form>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Info</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Course Detail</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan="5" className="p-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                               <div className="w-12 h-12 border-4 border-slate-100 border-t-primary-500 rounded-full animate-spin"></div>
                               <div className="absolute inset-0 flex items-center justify-center">
                                  <Shield className="w-4 h-4 text-primary-500" />
                               </div>
                            </div>
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Database...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (activeTab === 'attendance' ? data : rosterData).length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-20 text-center">
                          <div className="flex flex-col items-center gap-2">
                             <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-2">
                                <Search className="w-8 h-8 text-slate-200" />
                             </div>
                             <p className="text-slate-800 font-bold">No records found</p>
                             <p className="text-slate-400 text-sm">Try adjusting your filters or date range</p>
                          </div>
                        </td>
                      </tr>
                    ) : (activeTab === 'attendance' ? data : rosterData).map((log, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 text-sm group-hover:bg-white group-hover:shadow-md transition-all">
                              {log.full_name ? log.full_name.charAt(0) : '?'}
                            </div>
                            <div>
                               <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{log.full_name || 'Anonymous'}</p>
                               <p className="text-xs text-slate-400 font-bold mt-0.5">{log.roll_number || 'No Roll Number'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                           <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-indigo-50 text-indigo-600 uppercase w-fit">{log.branch || 'GENERAL'}</span>
                              <span className="text-[10px] font-bold text-slate-400 ml-1">Section {log.section || '--'}</span>
                           </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-semibold text-slate-600">{log.college_email || log.email || 'No email'}</p>
                        </td>
                        <td className="px-6 py-5">
                          {log.timestamp ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                               <MapPin className="w-3.5 h-3.5" />
                               Pending...
                            </div>
                          )}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            log.status === 'Present' || log.status === 'M' || log.status === 'P'
                            ? 'bg-green-50 text-green-600' 
                            : 'bg-red-50 text-red-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${log.status === 'Present' || log.status === 'M' || log.status === 'P' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            {log.status === 'M' ? 'Morning' : (log.status === 'P' ? 'Afternoon' : log.status)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'matrix' ? (
          <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar bg-slate-50/30">
            {/* Matrix Filters */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm my-8">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Date Range</label>
                  <div className="flex items-center gap-2">
                    <input type="date" className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={matrixRange.start} onChange={(e) => setMatrixRange({...matrixRange, start: e.target.value})} />
                    <span className="text-slate-300 font-bold">to</span>
                    <input type="date" className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={matrixRange.end} onChange={(e) => setMatrixRange({...matrixRange, end: e.target.value})} />
                  </div>
                </div>
                <div className="w-48">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Branch</label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={filters.branch} onChange={(e) => setFilters({...filters, branch: e.target.value})}>
                    <option value="">All Branches</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Section</label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={filters.section} onChange={(e) => setFilters({...filters, section: e.target.value})}>
                    <option value="">All</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="w-48">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Roll Number</label>
                  <input type="text" placeholder="Search Roll..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={filters.rollNumber} onChange={(e) => setFilters({...filters, rollNumber: e.target.value})} />
                </div>
                <div className="flex gap-2">
                  <button onClick={fetchMatrix} className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                    <Search className="w-5 h-5" />
                  </button>
                  <button onClick={handleDownloadMatrix} className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center gap-2 px-5">
                    <Download className="w-5 h-5" />
                    <span className="font-bold text-sm">Matrix</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
               <div className="max-h-[600px] overflow-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse sticky-header">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest sticky left-0 z-20 bg-slate-900">S.No</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest sticky left-16 z-20 bg-slate-900 min-w-[200px]">Student Details</th>
                        {matrixData.dates.map(date => (
                          <th key={date} className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-center border-l border-slate-800 min-w-[100px]">
                            {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </th>
                        ))}
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center border-l border-slate-800 bg-slate-800">Total %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matrixLoading ? (
                        <tr><td colSpan={matrixData.dates.length + 3} className="p-20 text-center font-bold text-slate-400 uppercase tracking-widest animate-pulse">Calculating Master Records...</td></tr>
                      ) : matrixData.rows.length === 0 ? (
                        <tr><td colSpan={matrixData.dates.length + 3} className="p-20 text-center font-bold text-slate-400">No matrix data available</td></tr>
                      ) : matrixData.rows.map((row) => (
                        <tr key={row.roll} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 text-xs font-black text-slate-400 sticky left-0 z-10 bg-white group-hover:bg-slate-50">{row.sn}</td>
                          <td className="px-6 py-4 sticky left-16 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100">
                             <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{row.name}</p>
                             <p className="text-[10px] text-slate-400 font-bold mt-1">{row.roll}</p>
                          </td>
                          {matrixData.dates.map(date => {
                            const status = row.attendance[date] || '-';
                            const isPresent = status === 'M' || status === 'P' || status === 'Present';
                            return (
                              <td key={date} className={`px-4 py-4 text-center border-l border-slate-50 ${isPresent ? 'bg-green-50/30' : ''}`}>
                                 <span className={`text-[10px] font-black ${isPresent ? 'text-green-600' : 'text-slate-300'}`}>
                                   {isPresent ? 'P' : '-'}
                                 </span>
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 text-center bg-slate-50 font-black text-slate-800 text-xs shadow-inner">
                            {Math.round((Object.values(row.attendance).filter(v => ['M','P','Present'].includes(v)).length / matrixData.dates.length) * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <AttendanceHistory />
        ) : activeTab === 'students' ? (
            <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar bg-slate-50/30">
            {/* Student Roster Filters */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm my-8">
              <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative col-span-1 md:col-span-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Name/Roll/Email..."
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium"
                    value={studentFilters.name}
                    onChange={(e) => setStudentFilters({...studentFilters, name: e.target.value})}
                  />
                </div>
                
                <div className="col-span-1">
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium appearance-none cursor-pointer"
                    value={studentFilters.branch}
                    onChange={(e) => setStudentFilters({...studentFilters, branch: e.target.value})}
                  >
                    <option value="">All Branches</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="col-span-1">
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-medium appearance-none cursor-pointer"
                    value={studentFilters.section}
                    onChange={(e) => setStudentFilters({...studentFilters, section: e.target.value})}
                  >
                    <option value="">All Sections</option>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="bg-primary-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Apply Filters
                </button>
              </form>
            </div>

            {/* Student Roster Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Info</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Course Detail</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="p-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                               <div className="w-12 h-12 border-4 border-slate-100 border-t-primary-500 rounded-full animate-spin"></div>
                               <div className="absolute inset-0 flex items-center justify-center">
                                  <Users className="w-4 h-4 text-primary-500" />
                               </div>
                            </div>
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Students...</span>
                          </div>
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="p-20 text-center">
                          <div className="flex flex-col items-center gap-2">
                             <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-2">
                                <Search className="w-8 h-8 text-slate-200" />
                             </div>
                             <p className="text-slate-800 font-bold">No students found</p>
                             <p className="text-slate-400 text-sm">Try adjusting your filters or add new students</p>
                          </div>
                        </td>
                      </tr>
                    ) : students.map((student, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 text-sm group-hover:bg-white group-hover:shadow-md transition-all">
                              {student.full_name ? student.full_name.charAt(0) : '?'}
                            </div>
                            <div>
                               <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{student.full_name || 'Anonymous'}</p>
                               <p className="text-xs text-slate-400 font-bold mt-0.5">{student.roll_number || 'No Roll Number'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                           <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-indigo-50 text-indigo-600 uppercase w-fit">{student.branch || 'GENERAL'}</span>
                              <span className="text-[10px] font-bold text-slate-400 ml-1">Section {student.section || '--'}</span>
                           </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-semibold text-slate-600 truncate max-w-[150px]">{student.college_email || 'No email'}</p>
                        </td>
                        <td className="px-8 py-5 text-right">
                           <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleResetFace(student.id)}
                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                                title="Reset Face ID"
                              >
                                <Fingerprint className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteStudent(student.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Delete student"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 max-w-4xl mx-auto animate-in zoom-in-95 duration-500">
             <div className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-1 space-y-6">
                   <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-primary-100">
                      <Shield className="w-4 h-4" />
                      Security Gate Control
                   </div>
                   <h2 className="text-4xl font-black text-slate-900 leading-tight">
                      Manage Attendance <span className="text-primary-600">Access</span>
                   </h2>
                   <p className="text-slate-500 text-lg leading-relaxed">
                      Control exactly when students can mark their attendance. Opening the "Gate" allows AI verification to proceed.
                   </p>
                   
                   <div className="pt-6 space-y-4">
                      {session.is_open ? (
                        <div className="space-y-6">
                           <div className={`p-6 border-2 rounded-3xl flex items-center justify-between ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100 animate-pulse'}`}>
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'bg-amber-500 shadow-amber-200' : 'bg-green-500 shadow-green-200'}`}>
                                    <Clock className="w-6 h-6 text-white" />
                                 </div>
                                 <div>
                                    <p className={`font-black text-lg ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'text-amber-800' : 'text-green-800'}`}>
                                      {session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'GATE SCHEDULED' : 'GATE IS OPEN'}
                                    </p>
                                    <p className={`text-sm font-bold ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'text-amber-600' : 'text-green-600'}`}>
                                      {session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? `Opens at ${new Date(session.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Students can now mark attendance'}
                                    </p>
                                 </div>
                              </div>
                              {session.expires_at && (
                                <div className="text-right">
                                   <p className={`text-xs font-bold uppercase ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'text-amber-700' : 'text-green-700'}`}>Closes at</p>
                                   <p className={`text-xl font-black ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'text-amber-800' : 'text-green-800'}`}>{new Date(session.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              )}
                           </div>
                           <button 
                             onClick={() => handleToggleSession(null)}
                             disabled={sessionLoading}
                             className={`w-full py-5 text-white font-black rounded-3xl shadow-xl transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 ${session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-200' : 'bg-red-500 hover:bg-red-600 shadow-red-100'}`}
                           >
                             <LogOut className="w-6 h-6 rotate-180" />
                             {session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date()) ? 'CANCEL SCHEDULE' : 'FORCE CLOSE GATE NOW'}
                           </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                           <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl flex items-center gap-4">
                              <div className="w-12 h-12 bg-slate-200 rounded-2xl flex items-center justify-center">
                                 <Shield className="w-6 h-6 text-slate-500" />
                              </div>
                              <div>
                                 <p className="text-slate-800 font-black text-lg uppercase tracking-tight">Gate is Closed</p>
                                 <p className="text-slate-400 text-sm font-medium">Select a duration or schedule a time</p>
                              </div>
                           </div>
                           
                           <div className="grid grid-cols-3 gap-4">
                              {[10, 20, 30].map(mins => (
                                <button
                                  key={mins}
                                  onClick={() => handleToggleSession(mins)}
                                  disabled={sessionLoading}
                                  className="flex flex-col items-center gap-2 p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-primary-500 hover:bg-primary-50 transition-all group shadow-sm hover:shadow-xl hover:shadow-primary-100/50"
                                >
                                   <div className="w-12 h-12 bg-slate-50 group-hover:bg-primary-500 rounded-2xl flex items-center justify-center transition-colors">
                                      <Clock className="w-6 h-6 text-slate-400 group-hover:text-white" />
                                   </div>
                                   <span className="font-black text-slate-400 group-hover:text-primary-700">{mins} MINS</span>
                                </button>
                              ))}
                           </div>

                           <div className="p-5 bg-white border border-slate-200 rounded-[2rem] shadow-sm mt-2">
                             <p className="text-slate-800 font-bold mb-4 flex items-center gap-2 text-sm">
                               <Clock className="w-4 h-4 text-primary-500" />
                               Schedule Custom Window
                             </p>
                             <div className="flex flex-col md:flex-row gap-4 items-end">
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Start Time</label>
                                 <input type="datetime-local" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
                               </div>
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">End Time</label>
                                 <input type="datetime-local" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} />
                               </div>
                               <button onClick={() => handleToggleSession(null, scheduleStart, scheduleEnd)} disabled={sessionLoading || (!scheduleStart || !scheduleEnd)} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg shadow-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-all text-sm h-[46px] whitespace-nowrap">
                                 Schedule
                               </button>
                             </div>
                           </div>
                        </div>
                      )}
                   </div>
                </div>
                <div className="hidden lg:block w-72 h-72 relative">
                   <div className={`absolute inset-0 rounded-full border-8 transition-colors duration-1000 ${session.is_open ? 'border-green-500 animate-ping opacity-20' : 'border-slate-100'}`}></div>
                   <div className={`absolute inset-0 m-4 rounded-full border-4 border-dashed animate-spin-slow ${session.is_open ? 'border-green-400 opacity-40' : 'border-slate-200'}`}></div>
                   <div className={`absolute inset-0 m-12 rounded-full flex items-center justify-center shadow-inner ${session.is_open ? 'bg-green-50' : 'bg-slate-50'}`}>
                      <Fingerprint className={`w-20 h-20 ${session.is_open ? 'text-green-500' : 'text-slate-200'}`} />
                   </div>
                </div>
             </div>
          </div>
        ) : (
          <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center animate-fade-in">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <AlertCircle className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Module Under Construction</h3>
              <p className="text-slate-500 max-w-sm">
                  The {menuItems.find(i => i.id === activeTab).label} module is being updated. Full management features will be live soon.
              </p>
              <button 
                onClick={() => setActiveTab('attendance')}
                className="mt-8 px-8 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all"
              >
                Back to Attendance
              </button>
          </div>
        )}

  {/* Add Student Modal */}
  {isAddModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="text-primary-600 w-5 h-5" />
            Add New Student
          </h2>
          <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleAddStudent} className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              placeholder="e.g. John Doe"
              value={newStudent.full_name}
              onChange={(e) => setNewStudent({...newStudent, full_name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Roll Number</label>
              <input 
                required
                type="text" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all uppercase"
                placeholder="24981A05..."
                value={newStudent.roll_number}
                onChange={(e) => setNewStudent({...newStudent, roll_number: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">College Email</label>
              <input 
                required
                type="email" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="email@college.edu"
                value={newStudent.college_email}
                onChange={(e) => setNewStudent({...newStudent, college_email: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Branch</label>
              <select 
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all appearance-none cursor-pointer"
                value={newStudent.branch}
                onChange={(e) => setNewStudent({...newStudent, branch: e.target.value})}
              >
                <option value="" disabled>Select Branch</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Section</label>
              <select 
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all appearance-none cursor-pointer"
                value={newStudent.section}
                onChange={(e) => setNewStudent({...newStudent, section: e.target.value})}
              >
                <option value="" disabled>Sec</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {addError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {addError}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <button 
              type="submit"
              disabled={addLoading}
              className="w-full py-4 bg-primary-600 text-white font-bold rounded-2xl shadow-xl shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {addLoading ? <Loader className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              <span>{addLoading ? 'Adding Student...' : 'Register Student'}</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
              Default Password: password123
            </p>
          </div>
        </form>
      </div>
    </div>
  )}
      </div>
    </div>
  );
};

export default AdminDashboard;
