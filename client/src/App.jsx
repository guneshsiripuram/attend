import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import Navbar from './components/Navbar';
import axios from 'axios';
import { API_URL } from './constants';


// Configure axios defaults
axios.defaults.baseURL = API_URL;

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');
    
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      // Set default header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    
    // Set axios header immediately
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-slate-50">
        <Navbar user={user} onLogout={logout} />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to={user.role === 'admin' ? '/admin' : '/student'} />} />
            <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
            
            <Route 
              path="/student" 
              element={user?.role === 'student' ? <StudentDashboard user={user} /> : <Navigate to="/login" />} 
            />
            
            <Route 
              path="/admin" 
              element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} 
            />
            
            <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/student') : '/login'} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
