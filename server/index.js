// Загружаем .env только на локальном компьютере.
// На хостинге Railway переменные подставляются автоматически, dotenv там не нужен.
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // Если библиотеки нет в dev, сервер всё равно запустится
  }
}

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit').rateLimit;
const db = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { router: modRoutes } = require('./routes/mod');
const { authenticate } = require('./middleware/auth');

for (const key of ['DATABASE_URL', 'JWT_SECRET', 'IP_HASH_SECRET']) {
  if (!process.env[key]) throw new Error(`Не задана обязательная переменная окружения ${key}.`);
}
if (process.env.JWT_SECRET.length < 32 || process.env.IP_HASH_SECRET.length < 32) {
  throw new Error('JWT_SECRET и IP_HASH_SECRET должны содержать не менее 32 символов каждый.');
}

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const publicDir = path.join(__dirname, '..', 'public');
const jarPath = path.join(publicDir, 'downloads', 'jvxVisual.jar');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://googleapis.com'],
      fontSrc: ["'self'", 'https://gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'Запрос с этого источника запрещён.' });
    }
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/mod', rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { valid: false, error: 'Слишком много запросов. Повторите позже.' },
}), modRoutes);
app.use('/api/admin', adminRoutes);

app.get('/download', authenticate, async (req, res, next) => {
  try {
    const ban = await db.query(
      `SELECT 1 FROM bans WHERE uid = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [req.user.uid],
    );
    if (ban.rowCount) return res.redirect(303, '/profile');
    if (!fs.existsSync(jarPath)) {
      return res.status(503).json({ error: 'Файл мода ещё не добавлен. Поместите jvxVisual.jar в public/downloads/.' });
    }
    await db.query('INSERT INTO downloads DEFAULT VALUES');
    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="jvxVisual.jar"');
    res.download(jarPath, 'jvxVisual.jar', (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, username, email, uid, role, created_at, last_login,
       (SELECT json_build_object('reason', reason, 'created_at', created_at, 'expires_at', expires_at)
        FROM bans WHERE uid = users.uid AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC LIMIT 1) AS ban
       FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (result.rows[0].ban) return res.json({ banned: true, ban: result.rows[0].ban });
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.use('/downloads', (req, res) => res.status(404).json({ error: 'Файл доступен только через /download.' }));
app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html', maxAge: 0 }));
app.get(['/profile', '/admin', '/support', '/faq'], (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут API не найден.' }));
app.use((error, req, res, next) => {
  const errorCode = error.code || error.cause?.code;
  console.error('Ошибка запроса:', error.message || errorCode || error.name);
  if (res.headersSent) return next(error);
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '28P01', '3D000'].includes(errorCode)) {
    return res.status(503).json({ error: 'База PostgreSQL недоступна. Запустите PostgreSQL, создайте базу и проверьте DATABASE_URL в .env.' });
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
});

const server = app.listen(port, () => console.log(`jvxVisual доступен: http://localhost:${port}`));

async function shutdown() {
  server.close(async () => {
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
    } else if (db && typeof db.end === 'function') {
      await db.end();
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
