const express = require('express');
const db = require('../db');

const router = express.Router();
const cache = new Map();
const CACHE_MS = 30_000;
const MAX_CACHE_ENTRIES = 5_000;

router.get('/verify/:uid', async (req, res, next) => {
  const uid = req.params.uid.toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(uid)) return res.json({ valid: false });
  const cached = cache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(uid);
    cache.set(uid, cached);
    return res.json(cached.value);
  }
  if (cached) cache.delete(uid);
  try {
    const userResult = await db.query('SELECT uid FROM users WHERE uid = $1 LIMIT 1', [uid]);
    if (!userResult.rowCount) return res.json({ valid: false });
    const banResult = await db.query(
      `SELECT reason, expires_at FROM bans WHERE uid = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1`,
      [uid],
    );
    const value = banResult.rowCount
      ? { valid: true, uid, status: 'banned', reason: banResult.rows[0].reason }
      : { valid: true, uid, status: 'active' };
    if (cache.size >= MAX_CACHE_ENTRIES) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= Date.now()) cache.delete(key);
        if (cache.size < MAX_CACHE_ENTRIES) break;
      }
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    }
    cache.set(uid, { value, expiresAt: Date.now() + CACHE_MS });
    res.json(value);
  } catch (error) {
    next(error);
  }
});

function invalidate(uid) {
  cache.delete(uid);
}

module.exports = { router, invalidate };