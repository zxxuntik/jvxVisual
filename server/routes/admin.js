const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidate } = require('./mod');

const router = express.Router();
router.use(authenticate, requireRole('moderator', 'admin'));

router.get('/users', async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 20;
  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.uid, u.role, u.created_at,
       EXISTS (SELECT 1 FROM bans b WHERE b.uid = u.uid AND b.active = TRUE AND (b.expires_at IS NULL OR b.expires_at > NOW())) AS banned
       FROM users u
       WHERE $1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR u.uid ILIKE '%' || $1 || '%'
       ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [search, limit, (page - 1) * limit],
    );
    const count = await db.query(
      `SELECT COUNT(*)::int AS total FROM users u
       WHERE $1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR u.uid ILIKE '%' || $1 || '%'`,
      [search],
    );
    res.json({ users: result.rows, total: count.rows[0].total, page, pages: Math.max(1, Math.ceil(count.rows[0].total / limit)) });
  } catch (error) {
    next(error);
  }
});

router.get('/bans', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.id, b.uid, b.reason, b.created_at, b.expires_at,
       (b.active AND (b.expires_at IS NULL OR b.expires_at > NOW())) AS active,
       (b.active AND b.expires_at IS NOT NULL AND b.expires_at <= NOW()) AS expired,
       target.username AS target_username, actor.username AS moderator_username
       FROM bans b LEFT JOIN users target ON target.id = b.user_id
       LEFT JOIN users actor ON actor.id = b.banned_by
       ORDER BY b.created_at DESC LIMIT 100`,
    );
    res.json({ bans: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/links/:uid', async (req, res, next) => {
  const uid = req.params.uid.toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(uid)) return res.status(400).json({ error: 'Некорректный UID.' });
  try {
    const result = await db.query(
      `SELECT 'ip' AS type, ip_hash AS hash FROM ip_uid_links WHERE uid = $1 AND ip_hash IS NOT NULL
       UNION ALL
       SELECT 'device' AS type, device_hash AS hash FROM ip_uid_links WHERE uid = $1 AND device_hash IS NOT NULL`,
      [uid],
    );
    res.json({ links: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/bans', async (req, res, next) => {
  const { uid, reason, expiresAt } = req.body || {};
  if (typeof uid !== 'string' || !/^[A-Za-z0-9]{8}$/.test(uid)) return res.status(400).json({ error: 'UID должен состоять из 8 символов.' });
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 1000) return res.status(400).json({ error: 'Укажите причину от 3 до 1000 символов.' });
  let expiration = null;
  if (expiresAt) {
    expiration = new Date(expiresAt);
    if (Number.isNaN(expiration.getTime()) || expiration <= new Date()) return res.status(400).json({ error: 'Срок бана должен быть в будущем.' });
  }
  const normalizedUid = uid.toUpperCase();
  try {
    const target = await db.query('SELECT id FROM users WHERE uid = $1 ORDER BY created_at DESC LIMIT 1', [normalizedUid]);
    if (!target.rowCount) return res.status(404).json({ error: 'Пользователь с таким UID не найден.' });
    await db.query('UPDATE bans SET active = FALSE WHERE uid = $1 AND active = TRUE', [normalizedUid]);
    const inserted = await db.query(
      `INSERT INTO bans (uid, user_id, reason, banned_by, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, uid, reason, created_at, expires_at, active`,
      [normalizedUid, target.rows[0].id, reason.trim(), req.user.id, expiration],
    );
    await db.query('INSERT INTO mod_logs (moderator_id, action, target_uid, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'ban', normalizedUid, JSON.stringify({ reason: reason.trim(), expiresAt: expiration })]);
    invalidate(normalizedUid);
    res.status(201).json({ ban: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/bans/:uid', async (req, res, next) => {
  const uid = req.params.uid.toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(uid)) return res.status(400).json({ error: 'Некорректный UID.' });
  try {
    const result = await db.query('UPDATE bans SET active = FALSE WHERE uid = $1 AND active = TRUE RETURNING id', [uid]);
    if (!result.rowCount) return res.status(404).json({ error: 'Активный бан не найден.' });
    await db.query('INSERT INTO mod_logs (moderator_id, action, target_uid, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'unban', uid, JSON.stringify({ banId: result.rows[0].id })]);
    invalidate(uid);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/unlink', async (req, res, next) => {
  const { hash, type, uid } = req.body || {};
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || !['ip', 'device'].includes(type) || typeof uid !== 'string' || !/^[A-Z0-9]{8}$/i.test(uid)) {
    return res.status(400).json({ error: 'Укажите корректный тип и хеш привязки, а также UID.' });
  }
  try {
    const column = type === 'ip' ? 'ip_hash' : 'device_hash';
    const result = await db.query(`DELETE FROM ip_uid_links WHERE ${column} = $1 AND uid = $2 RETURNING id`, [hash, uid.toUpperCase()]);
    await db.query('INSERT INTO mod_logs (moderator_id, action, target_uid, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, `unlink_${type}`, uid.toUpperCase(), JSON.stringify({ hash, removed: result.rowCount })]);
    res.json({ removed: result.rowCount });
  } catch (error) {
    next(error);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT l.id, l.action, l.target_uid, l.details, l.created_at, u.username AS moderator_username
       FROM mod_logs l LEFT JOIN users u ON u.id = l.moderator_id
       ORDER BY l.created_at DESC LIMIT 100`,
    );
    res.json({ logs: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;