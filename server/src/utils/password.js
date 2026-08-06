// Weak/common passwords rejected on registration and account creation.
const WEAK_PASSWORDS = new Set([
  'password', 'password123', 'password1234', 'password1', 'pass123',
  '12345678', '123456789', '1234567890', 'qwerty123', 'admin123',
  'admin1234', 'admin', 'student123', '1234abcd', 'abcd1234',
  'iloveyou', '11111111', '88888888', '00000000'
]);

const isStrongPassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) return false;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return false;
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return false;
  return true;
};

module.exports = { isStrongPassword };
