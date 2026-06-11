const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.smtp.ru',
  port:   parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const LOGO_URL    = 'https://drive.google.com/uc?export=view&id=1R_6vVGS353pg995sDScC16Pn_XQH5DTf';
const SENDER_NAME = 'ПРО-сегмент';
const OWNER_EMAIL = process.env.SMTP_USER;

// Конфигурация кнопок по типу файла
const FILE_CONFIGS = {
  pdf:   { btn: 'Скачать PDF →',       icon: '📄' },
  word:  { btn: 'Скачать документ →',  icon: '📝' },
  video: { btn: 'Смотреть видео →',    icon: '🎬' },
  text:  { btn: 'Открыть материал →',  icon: '📃' },
  file:  { btn: 'Скачать материал →',  icon: '📁' },
};

// Генерация HTML письма
function buildEmailHtml(buyerName, product, fileUrl) {
  // Если в БД есть кастомный HTML — используем его
  if (product.email_html) {
    return product.email_html
      .replace(/\{\{name\}\}/gi,    buyerName)
      .replace(/\{\{product\}\}/gi, product.name)
      .replace(/\{\{url\}\}/gi,     fileUrl);
  }

  const cfg = FILE_CONFIGS[product.file_type] || FILE_CONFIGS.file;

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0"
  style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">

  <!-- Шапка -->
  <tr><td align="center" style="padding:36px 40px 28px;border-bottom:3px solid #F95215;">
    <img src="${LOGO_URL}" width="90" height="90" alt="ПРО-сегмент"
      style="display:block;border-radius:50%;border:0;">
  </td></tr>

  <!-- Приветствие -->
  <tr><td style="padding:36px 40px 0;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#080808;">Добрый день, ${buyerName}!</p>
    <p style="margin:12px 0 0;font-size:16px;color:#555;line-height:1.6;">
      Спасибо за покупку. Ваш материал готов к использованию.</p>
  </td></tr>

  <!-- Блок товара -->
  <tr><td style="padding:28px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f9f9f9;border-radius:8px;border-left:4px solid #F95215;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#F95215;
        text-transform:uppercase;letter-spacing:.06em;">${cfg.icon} Ваш материал</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#080808;">${product.name}</p>
    </td></tr></table>
  </td></tr>

  <!-- Кнопка -->
  <tr><td align="center" style="padding:0 40px 36px;">
    <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;text-align:center;">
      Нажмите кнопку ниже чтобы получить доступ к материалу.<br>
      Ссылка постоянная — сохраните это письмо.</p>
    <a href="${fileUrl}"
      style="display:inline-block;background:#F95215;color:#fff;text-decoration:none;
        font-size:16px;font-weight:700;padding:16px 40px;border-radius:6px;">
      ${cfg.btn}
    </a>
  </td></tr>

  <!-- Разделитель -->
  <tr><td style="padding:0 40px;">
    <hr style="border:none;border-top:1px solid #eee;margin:0;">
  </td></tr>

  <!-- Контакты -->
  <tr><td style="padding:28px 40px;">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#080808;
      text-transform:uppercase;letter-spacing:.06em;">Остались вопросы?</p>
    <p style="margin:4px 0;font-size:14px;color:#555;">
      📧 <a href="mailto:galina@prosegment.ru" style="color:#F95215;text-decoration:none;">
        galina@prosegment.ru</a></p>
    <p style="margin:4px 0;font-size:14px;color:#555;">
      🌐 <a href="https://prosegment.ru" style="color:#F95215;text-decoration:none;">
        prosegment.ru</a></p>
  </td></tr>

  <!-- Подвал -->
  <tr><td align="center"
    style="padding:20px 40px;background:#080808;border-radius:0 0 12px 12px;">
    <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
      Письмо отправлено автоматически после оплаты на
      <a href="https://prosegment.ru" style="color:#F95215;text-decoration:none;">prosegment.ru</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// Отправить товар покупателю
async function sendProductEmail(buyerEmail, buyerName, product, fileUrl) {
  const html = buildEmailHtml(buyerName, product, fileUrl);
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || `"${SENDER_NAME}" <${SMTP_USER}>`,
    to:      buyerEmail,
    subject: `Ваш заказ — ${product.name}`,
    html,
  });
}

// Уведомление об ошибке владельцу
async function sendErrorNotification(subject, text) {
  if (!OWNER_EMAIL) return;
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      OWNER_EMAIL,
    subject: `⚠️ ${subject}`,
    text,
  });
}

module.exports = { sendProductEmail, sendErrorNotification, buildEmailHtml };
