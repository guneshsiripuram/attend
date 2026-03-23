import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Filter, Download, Users, CheckCircle, Clock, AlertCircle, Shield, LogOut, ChevronRight, UserPlus, Settings, Database, RotateCcw, Trash2, Fingerprint, X, History, Loader2, MapPin, UserCheck, LayoutDashboard, Calendar } from 'lucide-react';
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
        server_time: new Date() 
      });
      if (startTime) {
        setScheduleStart('');
        setScheduleEnd('');
      }
    } catch (err) {
      alert('Failed to update session');
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
        params: { branch: filters.branch, section: filters.section, startDate: matrixRange.start, endDate: matrixRange.end } 
      });
      setMatrixData(resp.data);
    } catch (err) {
      console.error('Matrix fetch failed', err);
    } finally {
      setMatrixLoading(false);
    }
  }, [filters.branch, filters.section, matrixRange]);

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
        {/* Fixed Top Dashboard Header & Controls */}
        <div className="flex-shrink-0 border-b border-slate-200/50 bg-white/50 backdrop-blur-sm z-20">
          <div className="p-8 pb-4 max-w-6xl mx-auto flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 leading-tight">
                  {activeTab === 'attendance' ? 'Attendance Control Center' : 
                   activeTab === 'roster' ? 'Live Class Roster' :
                   menuItems.find(i => i.id === activeTab).label}
                </h1>
                <p className="text-slate-500 text-sm">System management console & real-time analytics</p>
              </div>

              <div className="flex flex-1 items-center justify-end gap-8 px-8">
                  {((activeTab === 'attendance' || activeTab === 'roster') && session.is_open) && (
                    <>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Gate Status</p>
                         {(() => {
                            const isTrulyOpen = session.is_open && (!session.starts_at || new Date(session.starts_at) <= (session.server_time ? new Date(session.server_time) : new Date()));
                            const isSch = !isTrulyOpen && session.is_open && session.starts_at && new Date(session.starts_at) > (session.server_time ? new Date(session.server_time) : new Date());
                            return (
                              <div className="flex items-center gap-2 justify-end">
                                <div className={`w-2 h-2 rounded-full ${isTrulyOpen ? 'bg-green-500 animate-pulse' : (isSch ? 'bg-amber-500' : 'bg-red-500')}`}></div>
                                <span className={`text-sm font-black uppercase tracking-widest ${isTrulyOpen ? 'text-green-600' : (isSch ? 'text-amber-500' : 'text-red-600')}`}>
                                  {isTrulyOpen ? 'Live' : (isSch ? 'Scheduled' : 'Closed')}
                                </span>
                              </div>
                            );
                         })()}
                      </div>
                      <div className="w-px h-8 bg-slate-100"></div>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Remaining</p>
                         <p className="text-lg font-black text-slate-900 font-mono tracking-tighter">
                            {session.expires_at 
                              ? (() => {
                                  const diff = new Date(session.expires_at) - (session.server_time ? new Date(session.server_time) : new Date());
                                  if (diff <= 0) return '00:00';
                                  const mins = Math.floor(diff / 60000);
                                  const secs = Math.floor((diff % 60000) / 1000);
                                  return `${mins}:${secs.toString().padStart(2, '0')}`;
                                })()
                              : '--:--'}
                         </p>
                      </div>
                    </>
                  )}
              </div>

              <div className="flex gap-3">
                  <button 
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 transition-all font-semibold shadow-sm text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Report
                  </button>
                  <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-primary-600 px-5 py-2.5 rounded-xl text-white hover:bg-primary-700 transition-all font-semibold shadow-lg shadow-primary-100 text-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Student
                  </button>
                </div>
            </div>

            {activeTab === 'attendance' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <CheckCircle className="text-blue-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Live Presence</p>
                    <p className="text-2xl font-bold text-slate-900">{summary.presenttoday || 0}</p>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-green-50 rounded-xl">
                    <Users className="text-green-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Registry Size</p>
                    <p className="text-2xl font-bold text-slate-900">{summary.totalstudents || 0}</p>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <Clock className="text-amber-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Fulfillment</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {summary.totalstudents > 0 ? Math.round((summary.presenttoday / summary.totalstudents) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roster' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <Users className="text-blue-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Total Enrolled</p>
                    <p className="text-2xl font-bold text-slate-900">{rosterSummary.totalEnrolled || 0}</p>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-green-500">
                  <div className="p-3 bg-green-50 rounded-xl">
                    <CheckCircle className="text-green-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-tight">Present</p>
                    <p className="text-2xl font-bold text-slate-900">{rosterSummary.presentCount || 0}</p>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-red-500">
                  <div className="p-3 bg-red-50 rounded-xl">
                    <AlertCircle className="text-red-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-tight">Absent / Pending</p>
                    <p className="text-2xl font-bold text-slate-900">{rosterSummary.absentCount || 0}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ATTENDANCE CONTROLS - FIXED HEADER */}
          {(activeTab === 'attendance' || activeTab === 'roster' || activeTab === 'matrix') && (
             <div className="bg-white px-8 pb-4">
                <div className="max-w-6xl mx-auto bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <Clock className="w-4 h-4 text-primary-500" />
                           <h3 className="font-bold text-slate-800 text-sm">
                             {activeTab === 'roster' ? 'Select Criteria for Live Roster' : 
                              activeTab === 'matrix' ? 'Select Criteria for Matrix' :
                              'Recent Attendance Logs'}
                           </h3>
                        </div>
                        {activeTab !== 'matrix' && (
                          <input 
                            type="date" 
                            className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs"
                            value={filters.date}
                            onChange={(e) => setFilters({...filters, date: e.target.value})}
                          />
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select 
                          className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full appearance-none cursor-pointer"
                          value={filters.branch}
                          onChange={(e) => setFilters({...filters, branch: e.target.value})}
                        >
                          <option value="">All Branches</option>
                          <option value="CSE">CSE (Computer Science)</option>
                          <option value="ECE">ECE (Electronics)</option>
                          <option value="EEE">EEE (Electrical)</option>
                          <option value="MECH">MECH (Mechanical)</option>
                          <option value="CIVIL">CIVIL (Civil)</option>
                          <option value="AI&ML">AI & ML</option>
                          <option value="IT">IT (Information Tech)</option>
                        </select>
                      </div>
                      <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select 
                          className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full appearance-none cursor-pointer"
                          value={filters.section}
                          onChange={(e) => setFilters({...filters, section: e.target.value})}
                        >
                          <option value="">All Sections</option>
                          <option value="A">Section A</option>
                          <option value="B">Section B</option>
                          <option value="C">Section C</option>
                          <option value="D">Section D</option>
                        </select>
                      </div>
                      {activeTab !== 'matrix' && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Search Roll Number" 
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full"
                            value={filters.rollNumber}
                            onChange={(e) => setFilters({...filters, rollNumber: e.target.value})}
                          />
                        </div>
                      )}
                   </div>
                </div>
             </div>
             
             {/* TABLE HEADERS - FIXED POSITION BELOW SEARCH */}
             {(activeTab === 'attendance' || activeTab === 'roster') && (
               <div className="max-w-6xl mx-auto mt-4 px-2">
                  <table className="w-full text-left table-fixed">
                     <thead>
                       <tr>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[5%]">S.No</th>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[30%]">Student Details</th>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%]">Roll/Sec</th>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[20%]">{activeTab === 'roster' ? 'Last Attempt' : 'Timestamp'}</th>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%] text-center">Live Status</th>
                         <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%] text-right">Actions</th>
                       </tr>
                     </thead>
                  </table>
               </div>
             )}
          </div>
       )}

        {/* STUDENT REGISTRY CONTROLS */}
        {activeTab === 'students' && (
           <div className="bg-white px-8 pb-4">
              <div className="max-w-6xl mx-auto bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
                 <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <Users className="w-4 h-4 text-primary-500" />
                         <h3 className="font-bold text-slate-800 text-sm">Student Management Registry</h3>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium bg-white px-3 py-1 rounded-full border border-slate-100">
                        {students.length} Students Registered
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search Name" 
                          className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full"
                          value={studentFilters.name}
                          onChange={(e) => setStudentFilters({...studentFilters, name: e.target.value})}
                        />
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search Roll Number" 
                          className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full"
                          value={studentFilters.rollNumber}
                          onChange={(e) => setStudentFilters({...studentFilters, rollNumber: e.target.value})}
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <select 
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs w-full appearance-none cursor-pointer"
                            value={studentFilters.branch}
                            onChange={(e) => setStudentFilters({...studentFilters, branch: e.target.value})}
                          >
                            <option value="">All Branches</option>
                            <option value="CSE">CSE</option>
                            <option value="ECE">ECE</option>
                            <option value="EEE">EEE</option>
                            <option value="MECH">MECH</option>
                            <option value="CIVIL">CIVIL</option>
                            <option value="AI&ML">AI & ML</option>
                            <option value="IT">IT</option>
                          </select>
                        </div>
                      </div>
                   </div>
                </div>
             </div>
             
             {/* TABLE HEADERS - FIXED */}
             <div className="max-w-6xl mx-auto mt-4 px-2">
                <table className="w-full text-left table-fixed">
                   <thead>
                     <tr>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[5%]">S.No</th>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[30%]">Student</th>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%]">Roll/Sec</th>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%]">Face Data</th>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[20%]">Email</th>
                       <th className="py-2 px-4 font-bold text-slate-400 text-[10px] uppercase tracking-wider w-[15%] text-right">Actions</th>
                     </tr>
                   </thead>
                </table>
             </div>
          </div>
       )}
    </div>

    {/* Scrollable Logs Section - ONLY ROWS SCROLL NOW */}
    <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar bg-slate-50/30">
      <div className="max-w-6xl mx-auto py-4">
        {activeTab === 'roster' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed border-separate border-spacing-0">
                <tbody className="divide-y divide-slate-100">
                  {loading && rosterData.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                            <Clock className="w-8 h-8 animate-spin text-primary-500" />
                            <span>Loading Roster...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rosterData.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-slate-400 italic font-medium">No students found matching this criteria.</td>
                    </tr>
                  ) : (
                    rosterData.map((row, index) => {
                      let statusStyle = 'bg-slate-100 text-slate-500 border-slate-200';
                      let statusText = 'Absent / Pending';
                      
                      if (row.status === 'Present') {
                        statusStyle = 'bg-green-50 text-green-600 border-green-100';
                        statusText = 'Present';
                      } else if (row.status) {
                        statusStyle = 'bg-red-50 text-red-600 border-red-100';
                        statusText = row.status.replace('_', ' ');
                      }

                      return (
                      <tr key={row.id} className={`hover:bg-slate-50/50 transition-colors group ${row.status === 'Present' ? '' : 'bg-red-50/10'}`}>
                        <td className="py-4 px-4 w-[5%] text-xs font-bold text-slate-400 text-center">{index + 1}</td>
                        <td className="py-4 px-6 w-[30%] overflow-hidden">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center font-black text-xs ${row.status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                              {row.full_name.charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                                <span className={`font-bold block text-xs truncate ${row.status === 'Present' ? 'text-slate-800' : 'text-slate-600'}`}>{row.full_name}</span>
                                <span className="text-[9px] text-slate-400 truncate block">{row.college_email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[15%]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[9px] font-bold bg-blue-50 px-1.5 py-0.5 rounded text-blue-600">
                              {row.roll_number}
                            </span>
                            <span className="font-mono text-[9px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              {row.section}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[20%]">
                          <div className="text-[10px]">
                            {row.timestamp ? (
                              <>
                                <p className="font-bold text-slate-700">{new Date(row.timestamp).toLocaleDateString('en-IN')}</p>
                                <p className="text-slate-400">{new Date(row.timestamp).toLocaleTimeString('en-IN')}</p>
                              </>
                            ) : (
                              <p className="text-slate-400 italic">No attempts yet</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[15%] text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border inline-block ${statusStyle}`}>
                            {statusText}
                          </span>
                        </td>
                        <td className="py-4 px-6 w-[15%] text-right">
                          <button className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                              <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'attendance' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed border-separate border-spacing-0">
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                            <Clock className="w-8 h-8 animate-spin text-primary-500" />
                            <span>Syncing records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-slate-400 italic font-medium">No records found for this criteria.</td>
                    </tr>
                  ) : (
                    data.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-4 px-4 w-[5%] text-xs font-bold text-slate-400 text-center">{index + 1}</td>
                        <td className="py-4 px-6 w-[30%] overflow-hidden">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-black text-xs">
                              {row.full_name.charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                                <span className="font-bold text-slate-800 block text-xs truncate">{row.full_name}</span>
                                <span className="text-[9px] text-slate-400 truncate block">{row.college_email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[15%]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[9px] font-bold bg-blue-50 px-1.5 py-0.5 rounded text-blue-600">
                              {row.roll_number}
                            </span>
                            <span className="font-mono text-[9px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              {row.section}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[20%]">
                          <div className="text-[10px]">
                            <p className="font-bold text-slate-700">{new Date(row.timestamp).toLocaleDateString('en-IN')}</p>
                            <p className="text-slate-400">{new Date(row.timestamp).toLocaleTimeString('en-IN')}</p>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[15%] text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border inline-block ${
                            row.status === 'Present' 
                            ? 'bg-green-50 text-green-600 border-green-100' 
                            : 'bg-red-50 text-red-600 border-red-100'
                          }`}>
                            {row.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 px-6 w-[15%] text-right">
                            <button className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <AttendanceHistory />
        ) : activeTab === 'matrix' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-6">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Attendance Matrix (Year View)</h3>
                <div className="flex items-center gap-2">
                  <input type="date" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono" value={matrixRange.start} onChange={e => setMatrixRange({...matrixRange, start: e.target.value})} />
                  <span className="text-slate-400 font-bold text-xs">to</span>
                  <input type="date" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono" value={matrixRange.end} onChange={e => setMatrixRange({...matrixRange, end: e.target.value})} />
                  <button onClick={fetchMatrix} disabled={matrixLoading} className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                    {matrixLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={handleDownloadMatrix} disabled={!matrixData.rows.length} className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-xl text-white hover:bg-green-700 transition-all font-bold shadow-lg shadow-green-100 text-xs disabled:opacity-50">
                <Download className="w-4 h-4" /> Export Excel
              </button>
            </div>
            
            <div className="flex-1 overflow-auto relative custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200">
                      <tr className="bg-slate-50/50">
                          <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">SN</th>
                          <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll Number</th>
                          <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Student Name</th>
                          {matrixData.dates.map(date => (
                            <th key={date} className="px-4 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap italic">
                              {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </th>
                          ))}
                          <th className="px-6 py-4 text-center text-[10px] font-black text-primary-600 uppercase tracking-widest whitespace-nowrap sticky right-[72px] bg-slate-50 shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.1)] z-10">Total</th>
                          <th className="px-6 py-4 text-center text-[10px] font-black text-green-600 uppercase tracking-widest whitespace-nowrap sticky right-0 bg-slate-50 z-10">Present</th>
                        </tr>
                </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {matrixData.rows.map((row, idx) => {
                        const presentCount = matrixData.dates.filter(d => row.attendance[d] === 'P' || row.attendance[d] === 'M').length;
                        return (
                          <tr key={row.roll} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-400">{idx + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-slate-900">{row.roll}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-700">{row.name}</td>
                            {matrixData.dates.map(date => {
                              const status = row.attendance[date];
                              const displayStatus = status === 'M' ? 'P' : (status || '-');
                              return (
                                <td key={date} className="px-4 py-4 whitespace-nowrap text-center">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${
                                    displayStatus === 'P' ? 'bg-green-50 text-green-600' :
                                    displayStatus === 'A' ? 'bg-red-50 text-red-500' :
                                    'bg-slate-50 text-slate-300'
                                  }`}>
                                    {displayStatus}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-bold text-primary-600 sticky right-[72px] bg-white/95 backdrop-blur-sm shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.1)]">
                              {matrixData.dates.length}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-black text-green-600 sticky right-0 bg-white/95 backdrop-blur-sm">
                              {presentCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'students' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed border-separate border-spacing-0">
                <tbody className="divide-y divide-slate-100">
                  {loading && students.length === 0 ? (
                    <tr><td colSpan="6" className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td></tr>
                  ) : students.length === 0 ? (
                    <tr><td colSpan="6" className="py-20 text-center text-slate-400 italic">No students found.</td></tr>
                  ) : (
                    students.map((student, index) => (
                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-4 px-4 w-[5%] text-xs font-bold text-slate-400 text-center">{index + 1}</td>
                        <td className="py-4 px-6 w-[30%] overflow-hidden">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center font-black text-xs">
                              {student.full_name.charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                                <span className="font-bold text-slate-800 block text-xs truncate">{student.full_name}</span>
                                <span className="text-[9px] text-slate-400 truncate block">{student.branch}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 w-[15%]">
                          <span className="font-mono text-[9px] font-bold text-slate-700">{student.roll_number} ({student.section})</span>
                        </td>
                        <td className="py-4 px-6 w-[15%]">
                          {student.has_face_data ? (
                            <span className="text-[9px] font-bold text-green-600 flex items-center gap-1"><Fingerprint className="w-3 h-3" />Enrolled</span>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Pending</span>
                          )}
                        </td>
                        <td className="py-4 px-6 w-[20%] truncate text-[10px] text-slate-500">{student.college_email}</td>
                        <td className="py-4 px-6 w-[15%] text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => handleResetFace(student.id)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><RotateCcw className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteStudent(student.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
      </div>
    </div>
  </div>

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
              {addLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
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
  );
};

export default AdminDashboard;
