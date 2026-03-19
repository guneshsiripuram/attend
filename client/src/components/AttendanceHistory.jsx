import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, Download, Calendar, Users, Clock } from 'lucide-react';

const AttendanceHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/attendance/history`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setHistory(response.data.data);
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

  const downloadCSV = (date, records) => {
    const headers = ['Name', 'Roll Number', 'Email', 'Section', 'Branch', 'Time', 'Status'];
    const rows = records.map(r => [
      r.full_name,
      r.roll_number,
      r.email,
      r.section,
      r.branch,
      new Date(r.timestamp).toLocaleTimeString(),
      r.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Attendance History</h2>
        <div className="text-sm text-gray-500">
          Showing {history.length} days of records
        </div>
      </div>

      {history.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No records found</h3>
          <p className="text-gray-500">Historical data will appear here once attendance is marked.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((day) => (
            <div key={day.date} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleDate(day.date)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                id={`date-btn-${day.date}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800">
                      {new Date(day.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </h3>
                    <div className="flex items-center space-x-3 text-sm text-gray-500 mt-0.5">
                      <span className="flex items-center">
                        <Users className="w-3.5 h-3.5 mr-1" />
                        {day.count} Present
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadCSV(day.date, day.records);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Export CSV"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  {expandedDates[day.date] ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {expandedDates[day.date] && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll No</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch-Sec</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {day.records.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs mr-3">
                                {record.full_name.charAt(0)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{record.full_name}</div>
                                <div className="text-xs text-gray-500">{record.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {record.roll_number || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {record.branch}-{record.section}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            <div className="flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" />
                              {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttendanceHistory;
