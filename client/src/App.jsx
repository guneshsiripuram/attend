import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from './components/Navbar';
import { API_URL } from './constants';

// Configure axios defaults
axios.defaults.baseURL = API_URL;

// Lazy-load the heavy dashboards so face-api.js, TensorFlow.js and recharts
// are only downloaded when actually needed (not on the login page).
const Login = lazy(() => import('./components/Login'));
const Register = lazy(() => import('./components/Register'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

// Endpoints that must NOT trigger a forced logout when they return 401,
// because the user is (intentionally) not authenticated there yet.
const PUBLIC_AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/google-login', '/auth/complete-profile'];

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading...</p>
    </div>
  </div>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  useEffect(() => {
    // Add axios response interceptor to handle auth errors globally
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';

        // 403 = permission/validation problem (face match, location, duplicate, admin-only).
        // These are handled by the individual screens — do NOT log the user out.
        if (status === 403) {
          return Promise.reject(error);
        }

        // 401 = authentication problem. Only log out when it comes from a protected
        // endpoint, so the login/register screens can still show their own errors.
        if (status === 401 && !PUBLIC_AUTH_ENDPOINTS.some((ep) => url.includes(ep))) {
          console.warn('Authentication failed (401). Logging out...');
          logout();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );

    console.log('App mounting, checking auth status...');
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && typeof parsedUser === 'object') {
          console.log('Found valid session for:', parsedUser.email || 'User');
          setUser(parsedUser);
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        } else {
          throw new Error('Invalid user storage format');
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
      }
    } else {
      console.log('No stored session found');
    }
    setLoading(false);

    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  if (loading) return <PageLoader />;

  return (
    <Router>
      <div className="min-h-screen bg-slate-50">
        <Navbar user={user} onLogout={logout} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to={user.role === 'admin' ? '/admin' : '/student'} />} />
            <Route path="/register" element={!user || user.role === 'student' ? <Register /> : <Navigate to="/" />} />

            <Route
              path="/student"
              element={user?.role === 'student' ? <StudentDashboard user={user} /> : <Navigate to="/login" />}
            />

            <Route
              path="/admin"
              element={user?.role === 'admin' ? <AdminDashboard user={user} /> : <Navigate to="/login" />}
            />

            <Route path="/" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/student') : '/login'} />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
};

export default App;
