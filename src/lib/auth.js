const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { token } = require('./util');

const SESSION_DAYS = 14;
const COOKIE = 'admin_session';

function cookieOpts(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  };
}

function login(req, res, email, password) {
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) return null;
  const t = token();
  db.prepare('INSERT INTO sessions(token, admin_id, expires_at) VALUES (?, ?, ?)').run(t, admin.id, Date.now() + SESSION_DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  res.cookie(COOKIE, t, cookieOpts(req));
  return admin;
}

function logout(req, res) {
  const t = req.cookies[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.clearCookie(COOKIE, { path: '/' });
}

function loadAdmin(req, res, next) {
  const t = req.cookies[COOKIE];
  if (t) {
    const row = db.prepare(`SELECT a.id, a.email, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id
                            WHERE s.token = ? AND s.expires_at > ?`).get(t, Date.now());
    if (row) req.admin = row;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.admin) return next();
  res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

function hashPassword(pw) { return bcrypt.hashSync(pw, 11); }

// Freno básico contra fuerza bruta en el login (por IP, en memoria).
const attempts = new Map();
function loginThrottle(req) {
  const key = req.ip;
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(key, a);
  return a.length >= 10;
}
function recordFailedLogin(req) {
  const a = attempts.get(req.ip) || [];
  a.push(Date.now());
  attempts.set(req.ip, a);
}

module.exports = { login, logout, loadAdmin, requireAdmin, hashPassword, loginThrottle, recordFailedLogin };
