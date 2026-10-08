const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const db = require('../db');
const { authenticate, optionalAuthenticate, signSession, setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();
const authLimiter = require('express-rate-limit').rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
});

function ipHash(ip) {
  return crypto.createHmac('sha256', process.env.IP_HASH_SECRET).update(ip).digest('hex');
}

function identifierHash(value) {
  return crypto.createHmac('sha256', process.env.IP_HASH_SECRET).update(`device:${value}`).digest('hex');
}

function validUsername(value) {
  return typeof value === 'string' && /^[\p{L}\p{N}_-]{3,24}$/u.test(value);
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && Buffer.byteLength(value, 'utf8') <= 72;
}

function deviceCookie(req, res) {
  const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('jvx_device='));
  if (token) {
    try {
      const value = decodeURIComponent(token.slice('jvx_device='.length));
      if (/^[a-f0-9]{64}$/.test(value)) return value;
    } catch {}
  }
  const value = crypto.randomBytes(32).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `jvx_device=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return value;
}

function makeUid() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}

async function findOrCreateUid(client, hashedIp, hashedDevice) {
  const existing = await client.query(
    `SELECT uid FROM ip_uid_links
     WHERE (ip_hash = $1 AND ip_hash IS NOT NULL) OR (device_hash = $2 AND device_hash IS NOT NULL)
     ORDER BY CASE WHEN device_hash = $2 THEN 0 ELSE 1 END LIMIT 1`,
    [hashedIp, hashedDevice],
  );
  if (existing.rowCount) {
    const uid = existing.rows[0].uid.trim();
    await client.query('INSERT INTO ip_uid_links (ip_hash, uid) VALUES ($1, $2) ON CONFLICT (ip_hash) WHERE ip_hash IS NOT NULL DO NOTHING', [hashedIp, uid]);
    await client.query('INSERT INTO ip_uid_links (device_hash, uid) VALUES ($1, $2) ON CONFLICT (device_hash) WHERE device_hash IS NOT NULL DO NOTHING', [hashedDevice, uid]);
    return uid;
  }

  await client.query("SELECT pg_advisory_xact_lock(hashtext('jvxvisual_uid_generation'))");
  let uid;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    uid = makeUid();
    const collision = await client.query(
      'SELECT 1 FROM users WHERE uid = $1 UNION ALL SELECT 1 FROM ip_uid_links WHERE uid = $1 LIMIT 1',
      [uid],
    );
    if (!collision.rowCount) break;
    uid = null;
  }
  if (!uid) throw new Error('Не удалось сгенерировать уникальный UID.');
  await client.query('INSERT INTO ip_uid_links (ip_hash, uid) VALUES ($1, $2)', [hashedIp, uid]);
  await client.query('INSERT INTO ip_uid_links (device_hash, uid) VALUES ($1, $2)', [hashedDevice, uid]);
  return uid;
}

router.post('/register', authLimiter, async (req, res, next) => {
  const { username, email, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: 'Ник: 3–24 символа, буквы, цифры, _ или -.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Укажите корректный email.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Пароль должен содержать от 10 до 72 символов.' });

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const duplicate = await client.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [username, email],
    );
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ник или email уже используются.' });
    }

    const hashedIp = ipHash(req.ip || req.socket.remoteAddress || 'unknown');
    const hashedDevice = identifierHash(deviceCookie(req, res));
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hashedIp]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hashedDevice]);
    const uid = await findOrCreateUid(client, hashedIp, hashedDevice);
    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      `INSERT INTO users (username, email, password_hash, uid, last_ip_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, uid, role, created_at, last_login`,
      [username.trim(), email.trim().toLowerCase(), passwordHash, uid, hashedIp],
    );
    const activeBan = await client.query(
      `SELECT id FROM bans WHERE uid = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1`,
      [uid],
    );
    if (activeBan.rowCount) {
      await client.query('UPDATE bans SET user_id = $1 WHERE id = $2', [inserted.rows[0].id, activeBan.rows[0].id]);
    }
    await client.query('COMMIT');
    setSessionCookie(res, signSession(inserted.rows[0].id));
    return res.status(201).json({ user: inserted.rows[0], banned: Boolean(activeBan.rowCount) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'Ник, email, IP или устройство уже привязаны. Войдите в существующий аккаунт.' });
    next(error);
  } finally {
    client?.release();
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || login.length > 254 || typeof password !== 'string' || password.length > 72) {
    return res.status(400).json({ error: 'Проверьте логин и пароль.' });
  }
  try {
    const result = await db.query(
      'SELECT id, username, email, password_hash, uid, role, created_at FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1',
      [login.trim()],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный логин или пароль.' });
    }
    const hashedIp = ipHash(req.ip || req.socket.remoteAddress || 'unknown');
    await db.query('UPDATE users SET last_login = NOW(), last_ip_hash = $1 WHERE id = $2', [hashedIp, user.id]);
    delete user.password_hash;
    user.last_login = new Date().toISOString();
    setSessionCookie(res, signSession(user.id));
    return res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', optionalAuthenticate, async (req, res, next) => {
  if (!req.user) return res.json({ user: null });
  try {
    const result = await db.query(
      `SELECT id, username, email, uid, role, created_at, last_login,
       (SELECT row_to_json(b) FROM (
         SELECT reason, created_at, expires_at FROM bans
         WHERE uid = users.uid AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC LIMIT 1
       ) b) AS ban FROM users WHERE id = $1`,
      [req.user.id],
    );
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;