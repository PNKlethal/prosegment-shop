const express = require('express');
const router  = express.Router();
const db      = require('../db');
const mailer  = require('../mailer');
const path    = require('path');

// ── POST /webhook ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const params = req.body;

  await db.log('info', 'Webhook received', params);

  try {
    const buyerEmail = params.Email || params.email || '';
    const buyerName  = params.Name  || params.name  || 'Покупатель';
    const buyerPhone = params.Phone || params.phone || '';

    if (!buyerEmail) {
      await db.log('warn', 'No buyer email', params);
      return res.json({ result: 'error: no email' });
    }

    // ── Парсим платёж ЮКассы ──
    let systranId = '';
    let amount    = 0;
    let products  = [];

    const paymentRaw = params.payment || '';
    if (paymentRaw) {
      try {
        const payment = JSON.parse(paymentRaw);

        // Только подтверждённые платежи
        if (!payment.systranid) {
          await db.log('info', 'Payment not confirmed, skipping');
          return res.json({ result: 'skipped: not paid' });
        }

        systranId = payment.systranid;
        amount    = parseFloat(payment.amount) || 0;

        // Товары из payment.products: ["Название=1", ...]
        if (Array.isArray(payment.products)) {
          payment.products.forEach(p => {
            const eq    = p.lastIndexOf('=');
            const title = eq > -1 ? p.substring(0, eq).trim() : p.trim();
            const qty   = eq > -1 ? (parseInt(p.substring(eq + 1)) || 1) : 1;
            if (title) products.push({ title, qty });
          });
        }
      } catch(e) {
        await db.log('error', 'Payment parse error: ' + e.message, { raw: paymentRaw });
        return res.json({ result: 'error: payment parse failed' });
      }
    } else {
      await db.log('warn', 'No payment field', params);
      return res.json({ result: 'skipped: no payment data' });
    }

    if (!products.length) {
      await db.log('warn', 'No products found', params);
      return res.json({ result: 'error: no products' });
    }

    // ── Защита от дублей ──
    const dup = await db.query(
      'SELECT id FROM orders WHERE systran_id = $1',
      [systranId]
    );
    if (dup.rows.length > 0) {
      await db.log('info', 'Duplicate order skipped: ' + systranId);
      return res.json({ result: 'skipped: duplicate' });
    }

    // ── Сохраняем заказ ──
    const orderRes = await db.query(
      `INSERT INTO orders
         (systran_id, buyer_email, buyer_name, buyer_phone, amount, products, email_sent)
       VALUES ($1,$2,$3,$4,$5,$6,false)
       RETURNING id`,
      [systranId, buyerEmail, buyerName, buyerPhone, amount, JSON.stringify(products)]
    );
    const orderId = orderRes.rows[0].id;

    // ── Отправляем по товару ──
    const results = [];

    for (const item of products) {
      const product = await findProduct(item.title);

      if (!product) {
        await db.log('warn', 'Product not found: ' + item.title);
        await mailer.sendErrorNotification(
          'Товар не найден: ' + item.title,
          `Покупатель: ${buyerName} <${buyerEmail}>\nТовар: ${item.title}\nOrderID: ${orderId}`
        );
        results.push('not_found: ' + item.title);
        continue;
      }

      // Определяем URL файла
      const fileUrl = getFileUrl(product);
      await mailer.sendProductEmail(buyerEmail, buyerName, product, fileUrl);
      results.push('sent: ' + item.title);
    }

    // Помечаем заказ как отправленный
    await db.query(
      'UPDATE orders SET email_sent=true WHERE id=$1',
      [orderId]
    );

    await db.log('info', `Order #${orderId} processed`, { results });
    return res.json({ result: 'ok', results });

  } catch(err) {
    await db.log('error', 'Webhook error: ' + err.message, { stack: err.stack });
    return res.status(500).json({ result: 'error', message: err.message });
  }
});

// ── Найти товар в БД (нечёткий поиск) ────────────────────────────
async function findProduct(searchKey) {
  const key = searchKey.toLowerCase().trim();

  // Сначала точное совпадение по slug или name
  let res = await db.query(
    `SELECT * FROM products
     WHERE active=true
       AND (LOWER(slug)=$1 OR LOWER(name)=$1)
     LIMIT 1`,
    [key]
  );
  if (res.rows.length) return res.rows[0];

  // Затем частичное — name содержит ключ или ключ содержит name
  res = await db.query(
    `SELECT * FROM products
     WHERE active=true
       AND (LOWER(name) LIKE $1 OR $2 LIKE '%' || LOWER(name) || '%')
     LIMIT 1`,
    [`%${key}%`, key]
  );
  return res.rows[0] || null;
}

// ── Определить URL для скачивания ─────────────────────────────────
function getFileUrl(product) {
  // Если файл загружен на сервер — отдаём через защищённый роут /files
  if (product.file_path) {
    const siteUrl = process.env.SITE_URL || 'https://prosegment.ru';
    const fname   = path.basename(product.file_path);
    return `${siteUrl}/files/download/${product.id}/${encodeURIComponent(fname)}`;
  }
  // Иначе — внешняя ссылка (Drive и т.д.)
  return product.file_url || '';
}

module.exports = router;
