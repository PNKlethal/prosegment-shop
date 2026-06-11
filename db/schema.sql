-- ╔══════════════════════════════════════╗
-- ║  Схема БД — ПРО-сегмент              ║
-- ║  psql -U postgres -f schema.sql      ║
-- ╚══════════════════════════════════════╝

CREATE DATABASE prosegment;
\c prosegment;

-- Товары
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(200) UNIQUE NOT NULL,  -- ключ для поиска (из Tilda)
  name        TEXT        NOT NULL,           -- название для письма
  file_path   TEXT,                           -- путь к файлу на сервере
  file_url    TEXT,                           -- или внешняя ссылка (Drive и т.д.)
  file_type   VARCHAR(20) DEFAULT 'file',     -- pdf / word / video / text / file
  email_html  TEXT,                           -- кастомный HTML письма (NULL = дефолт)
  active      BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Заказы
CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  systran_id   VARCHAR(100) UNIQUE,           -- ID транзакции ЮКассы (защита от дублей)
  buyer_email  TEXT        NOT NULL,
  buyer_name   TEXT,
  buyer_phone  TEXT,
  amount       NUMERIC(10,2),
  products     JSONB,                         -- [{title, qty}]
  status       VARCHAR(20) DEFAULT 'paid',    -- paid / refunded / error
  email_sent   BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Логи
CREATE TABLE logs (
  id         SERIAL PRIMARY KEY,
  level      VARCHAR(10) DEFAULT 'info',      -- info / warn / error
  message    TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_orders_email     ON orders(buyer_email);
CREATE INDEX idx_orders_created   ON orders(created_at DESC);
CREATE INDEX idx_logs_level       ON logs(level);
CREATE INDEX idx_logs_created     ON logs(created_at DESC);
CREATE INDEX idx_products_slug    ON products(slug);
