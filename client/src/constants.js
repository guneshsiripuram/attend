const configured = import.meta.env.VITE_API_URL || 'https://attend-api-xfcb.onrender.com';
export const API_URL = configured.replace(/\/+$/, '').endsWith('/api')
  ? configured.replace(/\/+$/, '')
  : `${configured.replace(/\/+$/, '')}/api`;
export const BRANCHES = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'AI&ML', 'IT'];
export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const COLLEGE_DOMAIN = '@raghuenggcollege.in';
