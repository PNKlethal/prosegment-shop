const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const db       = require('../db');

// ── Хранилище для загружаемых файлов ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || './uploads';
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Безопасное имя файла: timestamp + оригинальное имя
    const safe = Date.now() + '-' + file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 100) * 1024 * 1024 }
});

// ── Middleware: проверка авторизации ──
function auth(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.path === '/login' || req.path === '/login-post') return next();
  res.redirect('/admin/login');
}
router.use(auth);

// ── Статика + SPA ──
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/login.html'));
});

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// ── POST /admin/login-post ─────────────────────────────────────────
router.post('/login-post', (req, res) => {
  const { login, pass } = req.body;
  if (login === process.env.ADMIN_LOGIN && pass === process.env.ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Неверный логин или пароль' });
});

// ── GET /admin/logout ──────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ═══════════════════════════════════════════════════════════════════
// API ТОВАРОВ
// ═══════════════════════════════════════════════════════════════════

// Список всех товаров
router.get('/api/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch(err) {
    res.json([]);
  }
});

// Один товар
router.get('/api/products/:id', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM products WHERE id=$1',
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Не найден' });
  res.json(result.rows[0]);
});

// Создать товар (с файлом или ссылкой)
router.post('/api/products', upload.single('file'), async (req, res) => {
  try {
    const { slug, name, file_url, file_type, email_html, active } = req.body;
    const file_path = req.file ? req.file.path : null;

    if (!slug || !name) {
      return res.status(400).json({ error: 'slug и name обязательны' });
    }

    const result = await db.query(
      `INSERT INTO products (slug, name, file_path, file_url, file_type, email_html, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [slug, name, file_path, file_url || null, file_type || 'file',
       email_html || null, active !== 'false']
    );
    res.json(result.rows[0]);
  } catch(err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Slug уже существует' });
    res.status(500).json({ error: err.message });
  }
});

// Обновить товар
router.put('/api/products/:id', upload.single('file'), async (req, res) => {
  try {
    const { slug, name, file_url, file_type, email_html, active } = req.body;
    const id = req.params.id;

    // Если загружен новый файл — удаляем старый
    if (req.file) {
      const old = await db.query('SELECT file_path FROM products WHERE id=$1', [id]);
      if (old.rows[0]?.file_path && fs.existsSync(old.rows[0].file_path)) {
        fs.unlinkSync(old.rows[0].file_path);
      }
    }

    const file_path = req.file ? req.file.path : undefined;
    const fields = [];
    const vals   = [];
    let   idx    = 1;

    const set = (col, val) => { fields.push(`${col}=$${idx++}`); vals.push(val); };

    if (slug)      set('slug',      slug);
    if (name)      set('name',      name);
    if (file_url !== undefined) set('file_url', file_url || null);
    if (file_path) set('file_path', file_path);
    if (file_type) set('file_type', file_type);
    if (email_html !== undefined) set('email_html', email_html || null);
    if (active !== undefined) set('active', active !== 'false');
    set('updated_at', new Date());

    vals.push(id);
    const result = await db.query(
      `UPDATE products SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить товар
router.delete('/api/products/:id', async (req, res) => {
  const old = await db.query('SELECT file_path FROM products WHERE id=$1', [req.params.id]);
  if (old.rows[0]?.file_path && fs.existsSync(old.rows[0].file_path)) {
    fs.unlinkSync(old.rows[0].file_path);
  }
  await db.query('DELETE FROM products WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// API ЗАКАЗОВ
// ═══════════════════════════════════════════════════════════════════

router.get('/api/orders', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let sql    = 'SELECT * FROM orders';
    let params = [];

    if (search) {
      sql += ' WHERE buyer_email ILIKE $1 OR buyer_name ILIKE $1';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) +
           ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const [rows, total] = await Promise.all([
      db.query(sql, params),
      db.query('SELECT COUNT(*) FROM orders' +
        (search ? ' WHERE buyer_email ILIKE $1 OR buyer_name ILIKE $1' : ''),
        search ? [`%${search}%`] : [])
    ]);

    res.json({ orders: rows.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch(err) {
    res.json({ orders: [], total: 0, page: 1, limit: 50 });
  }
});

// Повторно отправить письмо
router.post('/api/orders/:id/resend', async (req, res) => {
  try {
    const mailer  = require('../mailer');
    const orderRes = await db.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Заказ не найден' });

    const order    = orderRes.rows[0];
    const products = order.products;

    for (const item of products) {
      const prodRes = await db.query(
        `SELECT * FROM products WHERE active=true
         AND (LOWER(name) LIKE $1 OR $1 LIKE '%' || LOWER(name) || '%')
         LIMIT 1`,
        [item.title?.toLowerCase() || '']
      );
      if (prodRes.rows.length) {
        const product = prodRes.rows[0];
        const fileUrl = product.file_path
          ? `${process.env.SITE_URL}/files/download/${product.id}/${encodeURIComponent(path.basename(product.file_path))}`
          : product.file_url;
        await mailer.sendProductEmail(order.buyer_email, order.buyer_name, product, fileUrl);
      }
    }

    await db.query('UPDATE orders SET email_sent=true WHERE id=$1', [order.id]);
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ЛОГОВ
// ═══════════════════════════════════════════════════════════════════

router.get('/api/logs', async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    let sql    = 'SELECT * FROM logs';
    let params = [];
    if (level && level !== 'all') {
      sql += ' WHERE level=$1';
      params.push(level);
    }
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch(err) {
    res.json([]);
  }
});

// Статистика для дашборда
router.get('/api/stats', async (req, res) => {
  try {
    const [orders, revenue, products, errors] = await Promise.all([
      db.query('SELECT COUNT(*) FROM orders'),
      db.query('SELECT COALESCE(SUM(amount),0) as total FROM orders'),
      db.query('SELECT COUNT(*) FROM products WHERE active=true'),
      db.query("SELECT COUNT(*) FROM logs WHERE level='error' AND created_at > NOW()-INTERVAL '24h'"),
    ]);
    res.json({
      orders:   parseInt(orders.rows[0].count),
      revenue:  parseFloat(revenue.rows[0].total),
      products: parseInt(products.rows[0].count),
      errors:   parseInt(errors.rows[0].count),
    });
  } catch(err) {
    res.json({ orders: 0, revenue: 0, products: 0, errors: 0 });
  }
});

module.exports = router;
