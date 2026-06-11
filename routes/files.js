const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

// ── GET /files/download/:productId/:filename ──────────────────────
// Защищённая раздача файлов — только по прямой ссылке из письма.
// Файл не открыт публично через /uploads напрямую.
router.get('/download/:productId/:filename', async (req, res) => {
  try {
    const { productId, filename } = req.params;

    // Проверяем что такой товар существует
    const result = await db.query(
      'SELECT * FROM products WHERE id=$1 AND active=true',
      [parseInt(productId)]
    );

    if (!result.rows.length) {
      return res.status(404).send('Файл не найден');
    }

    const product = result.rows[0];
    if (!product.file_path) {
      return res.status(404).send('Файл не загружен');
    }

    const filePath = path.resolve(product.file_path);
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

    // Защита от path traversal
    if (!filePath.startsWith(uploadDir)) {
      return res.status(403).send('Доступ запрещён');
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Файл не найден на сервере');
    }

    // Логируем скачивание
    await db.log('info', `File downloaded: product=${productId}`, { filename });

    // Отдаём файл
    res.download(filePath, decodeURIComponent(filename));

  } catch(err) {
    await db.log('error', 'File download error: ' + err.message);
    res.status(500).send('Ошибка сервера');
  }
});

module.exports = router;
