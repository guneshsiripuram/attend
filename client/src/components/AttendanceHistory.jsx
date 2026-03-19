import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, Download, Calendar, Users, Clock, Search, Filter, MoreHorizontal } from 'lucide-react';

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
      const response = await axios.get('/admin/attendance/history');
      setHistory(response.data.data);
      setTotalStudentsRegistry(response.data.totalStudents);
      setAllStudents(response.data.allStudents);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching history:', error);
      setLoading(false);
    }
  };

  const toggleDate = (date) => {
    setExpandedDates(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
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
      .map(s => ({
        ...s,
        timestamp: null,
        status: 'Absent'
      }));
    
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Daily History</h2>
          <p className="text-slate-500 text-sm mt-1">Review and manage past attendance records</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:scale-105 transition-all text-sm group">
          <Download className="w-4 h-4 group-hover:bounce" />
          Download Report
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Records" 
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all placeholder:text-slate-300 font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="relative md:w-64">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select 
              className="w-full pl-12 pr-10 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all appearance-none cursor-pointer font-medium text-slate-600"
              value={dateFilterType}
              onChange={(e) => setDateFilterType(e.target.value)}
            >
              <option value="all">Select Date Range</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {dateFilterType === 'custom' && (
          <div className="flex flex-col md:flex-row items-center gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3 flex-1 w-full">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest whitespace-nowrap">From</span>
              <input 
                type="date" 
                className="flex-1 px-4 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold text-slate-700"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 flex-1 w-full">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest whitespace-nowrap">To</span>
              <input 
                type="date" 
                className="flex-1 px-4 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold text-slate-700"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* History Cards */}
      {history.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 text-center border border-slate-100 shadow-sm">
          <Calendar className="w-20 h-20 text-slate-200 mx-auto mb-6" />
          <h3 className="text-xl font-bold text-slate-800">No records found</h3>
          <p className="text-slate-400 max-w-xs mx-auto mt-2">Historical data will appear here once attendance sessions are completed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {getFilteredHistory().map((day) => {
            const currentTotal = totalStudentsRegistry; // Use real registry size
            const present = day.present_count;
            const absent = Math.max(0, currentTotal - present);
            const percentage = Math.round((present / currentTotal) * 100);
            const isExpanded = expandedDates[day.date];

            return (
              <div key={day.date} className={`bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-primary-500/20' : ''}`}>
                <button
                  onClick={() => toggleDate(day.date)}
                  className="w-full flex flex-col md:flex-row items-center justify-between p-6 md:px-8 hover:bg-slate-50/50 transition-colors gap-4"
                >
                  <div className="flex items-center gap-6 w-full md:w-auto">
                    <div className="bg-primary-50 p-3 rounded-2xl">
                      <Calendar className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        {new Date(day.date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </h3>
                      {isExpanded && (
                        <p className="text-sm text-slate-400 font-medium">
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-1 items-center justify-around md:justify-center gap-8 md:gap-16 w-full md:w-auto">
                    <div className="text-center md:text-left">
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Attendance</p>
                       <p className="text-lg font-black text-slate-900">{percentage}%</p>
                    </div>
                    <div className="text-center md:text-left">
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                       <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-500"></span>
                         <span className="text-sm font-bold text-slate-700">Complete</span>
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-slate-600 font-bold text-sm">
                      <Calendar className="w-4 h-4" />
                      Actions
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-8 pt-4 border-t border-slate-50 animate-in slide-in-from-top-2 duration-500">
                    {/* Stats Row */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10 bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100">
                      <div className="grid grid-cols-3 gap-8 md:gap-12">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Students</p>
                          <p className="text-3xl font-black text-slate-900">{currentTotal}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Present</p>
                          <p className="text-3xl font-black text-green-600">{present}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Absent</p>
                          <p className="text-3xl font-black text-red-500">{absent}</p>
                        </div>
                      </div>

                      {/* Progress Circle Mockup */}
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="48" cy="48" r="40" className="fill-none stroke-slate-200 stroke-[8]" />
                          <circle 
                            cx="48" cy="48" r="40" 
                            className="fill-none stroke-green-500 stroke-[8]" 
                            strokeDasharray={251.2}
                            strokeDashoffset={251.2 - (251.2 * percentage) / 100}
                            strokeLinecap="round" 
                          />
                        </svg>
                        <span className="absolute text-sm font-black text-slate-900">{percentage}%</span>
                      </div>
                    </div>

                    {/* Records Table */}
                    <div className="overflow-x-auto rounded-3xl border border-slate-100">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50/50">
                          <tr>
                            <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                            <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll Number</th>
                            <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-In Time</th>
                            <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                          {getDayRecords(day).map((record, index) => (
                            <tr key={`${day.date}-${record.id || index}`} className="hover:bg-slate-50/30 transition-colors group">
                              <td className="px-8 py-5 whitespace-nowrap">
                                <span className="text-sm font-bold text-slate-800">{record.full_name}</span>
                              </td>
                              <td className="px-8 py-5 whitespace-nowrap">
                                <span className="text-sm font-semibold text-slate-500">{record.roll_number}</span>
                              </td>
                              <td className="px-8 py-5 whitespace-nowrap">
                                <span className="text-sm text-slate-700 font-medium">
                                  {record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                                </span>
                              </td>
                              <td className="px-8 py-5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${record.status === 'Absent' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                  <span className={`text-sm font-bold ${record.status === 'Absent' ? 'text-red-500' : 'text-slate-700'}`}>
                                    {record.status}
                                  </span>
                                </div>
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
      )}
    </div>
  );
};

export default AttendanceHistory;
