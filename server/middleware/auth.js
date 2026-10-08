const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'jvx_session';

function readSessionToken(req) {
  const cookie = req.headers.cookie || '';
  const pair = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

function signSession(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function authenticate(req, res, next) {
  try {
    const token = readSessionToken(req);
    if (!token) return res.status(401).json({ error: 'Требуется войти в аккаунт.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT id, username, email, uid, role, created_at, last_login FROM users WHERE id = $1',
      [payload.sub],
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Аккаунт не найден.' });
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' });
    }
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав.' });
    }
    next();
  };
}

function optionalAuthenticate(req, res, next) {
  if (!readSessionToken(req)) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = { authenticate, optionalAuthenticate, requireRole, signSession, setSessionCookie, clearSessionCookie };