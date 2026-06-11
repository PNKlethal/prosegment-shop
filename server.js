require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');

const app = express();

// ── Убедиться что папка uploads существует ──
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


// ── Middleware ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 8 * 3600 * 1000 } // 8 часов
}));

// Статика для админки
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
// Загруженные файлы НЕ отдаём публично — только через защищённый роут
// app.use('/uploads', ...) — намеренно закомментировано

// ── Роуты ──
app.use('/webhook', require('./routes/webhook'));
app.use('/admin',   require('./routes/admin'));
app.use('/files',   require('./routes/files'));

// ── Health check ──
app.get('/', (req, res) => res.json({ status: 'ok', service: 'prosegment-shop' }));

// ── Глобальный обработчик ошибок ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
