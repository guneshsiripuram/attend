import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

const Login = ({ onLogin }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const resp = await axios.post('/auth/google-login', {
        credential: credentialResponse.credential
      });
      
      const { user, token } = resp.data;
      onLogin(user, token);

      if (user.role === 'admin') {
        navigate('/admin');
      } else if (!user.hasFace) {
        // Redirect to register page to complete face enrollment
        navigate('/register', { state: { googleUser: user } });
      } else {
        navigate('/student');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await axios.post('/auth/login', { email, password });
      onLogin(resp.data.user, resp.data.token);
      navigate(resp.data.user.role === 'admin' ? '/admin' : '/student');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 animate-fade-in px-4">
      <div className="glass p-10 rounded-3xl shadow-2xl flex flex-col gap-8 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl"></div>
        
        <div className="text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">College Portal</h1>
          <p className="text-slate-500 mt-2 font-medium">Internal Attendance OS</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs font-bold">{error}</span>
          </div>
        )}

        {!showAdminLogin ? (
          <div className="flex flex-col gap-6">
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google Login Failed')}
                theme="filled_blue"
                shape="pill"
                size="large"
                text="signin_with"
                width="100%"
              />
            </div>
            
            <div className="flex flex-col gap-4 text-center">
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Use your official college email<br/>(e.g. name@raghuenggcollege.in)
              </p>
              
              <div className="h-px bg-slate-100 w-full my-2"></div>
              
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hover:text-primary-600 transition-all"
              >
                Faculty / Admin Access
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAdminSubmit} className="flex flex-col gap-4 animate-slide-up">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Admin Email"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Password"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Authenticating...' : 'Secure Login'}
            </button>
            
            <button 
              type="button"
              onClick={() => setShowAdminLogin(false)}
              className="text-xs text-slate-500 font-bold hover:text-primary-600"
            >
              Back to Student Login
            </button>
          </form>
        )}

        <div className="text-center text-[11px] text-slate-400">
           Protected by Raghu Engineering College Security Protocol
        </div>
      </div>
    </div>
  );
};

export default Login;
