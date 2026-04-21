import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, Download, Calendar, Users, Clock, Search, Filter } from 'lucide-react';

const AttendanceHistory = () => {
  const [history, setHistory] = useState([]);
  const [totalStudentsRegistry, setTotalStudentsRegistry] = useState(0);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilterType, setDateFilterType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const resp = await axios.get('/admin/attendance/history');
      setHistory(resp.data.data || []);
      setTotalStudentsRegistry(resp.data.totalStudents || 0);
      setAllStudents(resp.data.allStudents || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching history:', error);
      setLoading(false);
    }
  };

  const handleDownloadDayCSV = (day) => {
    const records = getDayRecords(day);
    if (!records || records.length === 0) return alert('No records to export');

    const headers = ['Name', 'Roll Number', 'Branch', 'Section', 'Email', 'Check-In Time', 'Status'];
    const rows = records.map(r => [
      r.full_name, r.roll_number, r.branch || 'Unknown', r.section || 'Unknown',
      r.college_email || r.email || '--',
      r.timestamp ? new Date(r.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--',
      r.status
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_Report_${day.date}.csv`;
    link.click();
  };

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const getFilteredHistory = () => {
    let filtered = [...history];
    const now = new Date();

    if (dateFilterType === '7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      filtered = filtered.filter(day => new Date(day.date) >= sevenDaysAgo);
    } else if (dateFilterType === '30days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      filtered = filtered.filter(day => new Date(day.date) >= thirtyDaysAgo);
    } else if (dateFilterType === 'month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter(day => new Date(day.date) >= firstDayOfMonth);
    } else if (dateFilterType === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(day => {
        const d = new Date(day.date);
        return d >= start && d <= end;
      });
    }
    return filtered;
  };

  const getDayRecords = (day) => {
    const presentIds = new Set(day.present_records.map(r => r.user_id));
    const absentees = allStudents
      .filter(s => !presentIds.has(s.id))
      .map(s => ({ ...s, timestamp: null, status: 'Absent' }));
    const combined = [...day.present_records, ...absentees];
    if (searchQuery) {
      return combined.filter(r => 
        r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.roll_number?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return combined;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">History Vault</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Audit past attendance sessions</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search Names/Rolls..." className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none text-xs font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none cursor-pointer" value={dateFilterType} onChange={(e) => setDateFilterType(e.target.value)}>
            <option value="all">All Time</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {getFilteredHistory().map((day) => {
          const present = day.present_count;
          const percentage = Math.round((present / (totalStudentsRegistry || 1)) * 100);
          const isExpanded = expandedDates[day.date];

          return (
            <div key={day.date} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden transition-all duration-500">
              <button onClick={() => toggleDate(day.date)} className="w-full flex flex-col md:flex-row items-center justify-between p-8 hover:bg-slate-50/50 transition-colors gap-6">
                <div className="flex items-center gap-6">
                  <div className="bg-primary-50 p-4 rounded-[1.5rem] shadow-sm">
                    <Calendar className="w-6 h-6 text-primary-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-black text-slate-900 text-xl tracking-tight uppercase">
                      {new Date(day.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'long' })}</p>
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-around md:justify-center gap-12">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">AGGREGATE</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter">{percentage}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PRESENTIES</p>
                    <p className="text-2xl font-black text-green-600 tracking-tighter">{present}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); handleDownloadDayCSV(day); }} className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-100"><Download className="w-3.5 h-3.5" /> CSV</button>
                  <div className={`p-2.5 rounded-xl border border-slate-200 transition-all ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400'}`}><ChevronDown className={`w-4 h-4 transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`} /></div>
                </div>
              </button>

              {isExpanded && (
                <div className="p-8 pt-0 border-t border-slate-50 animate-in slide-in-from-top-4 duration-700">
                  <div className="overflow-x-auto rounded-[2rem] border border-slate-100 mt-6 shadow-2xl shadow-slate-200/20">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50 border-b border-slate-100 font-mono italic">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Identity</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sync Timestamp</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 bg-white">
                        {getDayRecords(day).map((record, index) => (
                          <tr key={index} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-8 py-5">
                              <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{record.full_name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">{record.roll_number}</p>
                            </td>
                            <td className="px-8 py-5 text-center">
                              <span className="text-xs font-black text-slate-600 font-mono tracking-tighter">
                                {record.timestamp ? new Date(record.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-- : --'}
                              </span>
                            </td>
                            <td className="px-8 py-5 text-right">
                              <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${record.status === 'Absent' ? 'bg-red-50 border-red-100 text-red-700 shadow-sm shadow-red-100' : 'bg-green-50 border-green-100 text-green-700 shadow-sm shadow-green-100'}`}>{record.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttendanceHistory;
