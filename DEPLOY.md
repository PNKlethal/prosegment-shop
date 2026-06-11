# Деплой на Timeweb Cloud VPS

## 1. Создайте VPS на Timeweb

- cloud.timeweb.com → Облачные серверы → Создать
- ОС: Ubuntu 22.04
- Тариф: Cloud 1 (1 CPU, 1GB RAM) — хватит с запасом
- Стоимость: ~200₽/мес

## 2. Подключитесь по SSH

```bash
ssh root@ВАШ_IP
```

## 3. Установите Node.js и PostgreSQL

```bash
# Обновляем систему
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PostgreSQL
apt install -y postgresql postgresql-contrib

# PM2 (менеджер процессов)
npm install -g pm2
```

## 4. Настройте PostgreSQL

```bash
sudo -u postgres psql

# Внутри psql:
CREATE USER prosegment_user WITH PASSWORD 'ВАШ_ПАРОЛЬ_БД';
CREATE DATABASE prosegment OWNER prosegment_user;
GRANT ALL PRIVILEGES ON DATABASE prosegment TO prosegment_user;
\q
```

## 5. Загрузите проект на сервер

```bash
# На вашем компьютере — загружаем проект
scp -r prosegment-shop/ root@ВАШ_IP:/var/www/

# На сервере
cd /var/www/prosegment-shop
npm install

# Создаём .env из шаблона
cp .env.example .env
nano .env   # заполняем все переменные
```

## 6. Создайте таблицы в БД

```bash
cd /var/www/prosegment-shop
psql -U prosegment_user -d prosegment -f db/schema.sql
```

## 7. Запустите через PM2

```bash
cd /var/www/prosegment-shop
pm2 start server.js --name prosegment
pm2 save
pm2 startup   # автозапуск после перезагрузки
```

## 8. Настройте Nginx как прокси

```bash
apt install -y nginx

nano /etc/nginx/sites-available/prosegment
```

Вставьте:
```nginx
server {
    listen 80;
    server_name ВАШ_ДОМЕН_ИЛИ_IP;

    # Ограничение размера загружаемых файлов
    client_max_body_size 110M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/prosegment /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

## 9. HTTPS (если есть домен)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ВАШ_ДОМЕН
```

## 10. Укажите webhook URL в Tilda

```
http://ВАШ_IP/webhook
# или с доменом:
https://admin.prosegment.ru/webhook
```

## Полезные команды

```bash
pm2 logs prosegment          # логи в реального времени
pm2 restart prosegment       # перезапуск после изменений
pm2 status                   # статус процессов
```

## Регистрация на SMTP.ru

1. Зайдите на smtp.ru
2. Зарегистрируйтесь
3. Создайте SMTP-аккаунт
4. Получите логин, пароль, хост
5. Вставьте в .env
6. Бесплатно: 500 писем/день
