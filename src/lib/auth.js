const bcrypt = require('bcryptjs');
const { col, findOne, nextId, now } = require('../db');
const { token } = require('./util');

const SESSION_DAYS = 14;
const COOKIE = 'admin_session';

function cookieOpts(req) {
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/' };
}

async function login(req, res, email, password) {
  const admin = await findOne('admins', { email: String(email || '').trim().toLowerCase() });
  if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) return null;
  const t = token();
  await (await col('sessions')).insertOne({ token: t, admin_id: admin.id, expires: new Date(Date.now() + SESSION_DAYS * 864e5) });
  res.cookie(COOKIE, t, cookieOpts(req));
  return admin;
}

async function logout(req, res) {
  const t = req.cookies[COOKIE];
  if (t) await (await col('sessions')).deleteOne({ token: t });
  res.clearCookie(COOKIE, { path: '/' });
}

async function loadAdmin(req, res, next) {
  try {
    const t = req.cookies[COOKIE];
    if (t) {
      const s = await findOne('sessions', { token: String(t), expires: { $gt: new Date() } });
      if (s) {
        const a = await findOne('admins', { id: s.admin_id }, { projection: { password_hash: 0 } });
        if (a) req.admin = a;
      }
    }
    next();
  } catch (err) { next(err); }
}

function requireAdmin(req, res, next) {
  if (req.admin) return next();
  res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

const hashPassword = (pw) => bcrypt.hashSync(pw, 11);

async function createAdmin(email, password, name = '') {
  const id = await nextId('admins');
  await (await col('admins')).insertOne({ id, email: email.trim().toLowerCase(), name, password_hash: hashPassword(password), created_at: now() });
  return id;
}

// Freno básico contra fuerza bruta en el login (por IP, en memoria de cada instancia).
const attempts = new Map();
function loginThrottle(req) {
  const nowMs = Date.now();
  const a = (attempts.get(req.ip) || []).filter((t) => nowMs - t < 15 * 60e3);
  attempts.set(req.ip, a);
  return a.length >= 10;
}
function recordFailedLogin(req) {
  const a = attempts.get(req.ip) || [];
  a.push(Date.now());
  attempts.set(req.ip, a);
}

module.exports = { login, logout, loadAdmin, requireAdmin, hashPassword, createAdmin, loginThrottle, recordFailedLogin };
