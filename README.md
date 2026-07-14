# TeamFinder Bot

Telegram-бот для поиска игровых команд с монетизацией через **Telegram Stars**.

## Возможности

- **Анкеты игроков** — CS2, Roblox, WoT, War Thunder, Dota 2, Valorant и др.
- **Умный поиск** — подбор по рангу, роли, времени онлайн, языку
- **PRO-подписка** — безлимитный поиск, мульти-анкеты, приоритет (15⭐)
- **Команды и заявки** — создание команд, заявки с премиум-поднятием (3⭐)
- **Точечная покупка контакта** — открыть конкретный контакт (2⭐)
- **Премиум за Stars** — лучший подбор команд (5⭐), поднятие анкеты (7⭐)
- **Гайды** — бесплатные + премиум/видео за Stars
- **Связь с игроками** — контакты после покупки премиум-подбора

## Быстрый старт

### 1. Создай бота

1. Напиши [@BotFather](https://t.me/BotFather)
2. `/newbot` → получи токен
3. `/setcommands` — опционально

### 2. Установка

```bash
cd teamfinder-bot
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

### 3. Настрой `.env`

```env
BOT_TOKEN=твой_токен
ADMIN_IDS=твой_telegram_id
DATABASE_URL=postgresql://user:password@host:5432/database
WEBAPP_URL=https://твой-app.onrender.com
```

### 4. Запуск

```bash
python main.py
```

## Монетизация (Telegram Stars)

| Продукт | Цена | Что даёт |
|---------|------|----------|
| Лучший подбор | 5⭐ | Топ-10, % совместимости, контакты, 3 поиска |
| Поднять анкету | 7⭐ | Анкета выше в поиске 24ч |
| PRO-подписка | 15⭐ | Безлимитный поиск, мульти-анкеты, приоритет на 30 дней |
| Открыть контакт | 2⭐ | Доступ к контакту конкретного игрока |
| Премиум-заявка | 3⭐ | Заявка в команде в топе списка |
| Премиум-гайды | 6-10⭐ | Полные гайды по играм |
| Видео-гайды | 5-6⭐ | Ссылка на видео после оплаты |

Stars — валюта Telegram (`XTR`). Пользователи покупают Stars в приложении, бот получает их как оплату за цифровые услуги.

## Структура проекта

```
teamfinder-bot/
├── main.py              # Точка входа
├── config.py            # Настройки из .env
├── database.py          # PostgreSQL (asyncpg)
├── handlers/            # Обработчики команд
├── keyboards/           # Клавиатуры
├── data/                # Игры и гайды
└── services/            # Подбор команд
```

## Деплой на Render.com (GitHub)

### Вариант A — Blueprint (рекомендуется)

1. Залей проект на GitHub (корень репозитория — эта папка `teamfinder-bot`).
2. На [Render.com](https://render.com) → **New** → **Blueprint**.
3. Подключи GitHub-репозиторий — Render прочитает `render.yaml` и создаст PostgreSQL + Web Service.
4. В настройках Web Service задай секреты:
   - `BOT_TOKEN` — токен от @BotFather
   - `ADMIN_IDS` — твой Telegram ID (через запятую, если несколько)
5. `DATABASE_URL` подставится из базы автоматически.
6. `WEBAPP_URL` можно не задавать — бот возьмёт `RENDER_EXTERNAL_URL` после деплоя.
7. После успешного деплоя открой `https://твой-сервис.onrender.com/health` — должно быть `{"status":"ok"}`.
8. В @BotFather → `/newapp` → укажи URL Mini App: `https://твой-сервис.onrender.com/`

### Вариант B — вручную

#### 1. Создай PostgreSQL на Render

1. Зайди на [Render.com](https://render.com)
2. Создай "PostgreSQL Database"
3. Скопируй **Internal Database URL** (для сервиса на Render) или External (снаружи)

#### 2. Создай Web Service

1. Создай "Web Service"
2. Подключи GitHub репозиторий с этим проектом
3. Настрой Build & Deploy:

**Build Command:**
```bash
pip install -r requirements.txt
```

**Start Command:**
```bash
python main.py
```

**Health Check Path:** `/health`

**Python Version:** `3.11.9` (обязательно! Render по умолчанию ставит 3.14, с ним сборка падает)

### 3. Настрой Environment Variables

В настройках Web Service добавь:

```env
PYTHON_VERSION=3.11.9
BOT_TOKEN=твой_токен_от_BotFather
ADMIN_IDS=твой_telegram_id
DATABASE_URL=твоя_postgresql_url_из_шага_1
PRICE_BEST_TEAM=5
PRICE_HIGHLIGHT=7
PRICE_CONTACT_PACK=3
PRICE_PRO_SUBSCRIPTION=15
PRICE_SINGLE_CONTACT=2
PRICE_PREMIUM_APPLICATION=3
WEBAPP_HOST=0.0.0.0
```

`WEBAPP_URL` и `PORT` на Render задавать не обязательно — Render сам выставит `PORT`, а URL Mini App подставится из `RENDER_EXTERNAL_URL`.

### 4. Настрой Telegram Mini App

1. После деплоя скопируй URL своего Render-приложения (`https://....onrender.com`)
2. Напиши [@BotFather](https://t.me/BotFather)
3. `/newapp` → создай Mini App
4. Укажи URL: `https://твой-app.onrender.com/`
5. Нажми `/start` в боте — кнопка «🚀 Открыть TeamFinder» откроет Mini App

### GitHub — быстрый старт

```bash
git init
git add .
git commit -m "TeamFinder bot ready for Render"
git branch -M main
git remote add origin https://github.com/ТВОЙ_ЮЗЕР/teamfinder-bot.git
git push -u origin main
```

> На бесплатном плане Render сервис «засыпает» после 15 мин без трафика. Эндпоинт `/health` можно пинговать через UptimeRobot, чтобы бот не засыпал.

## 🚀 Mini App (открывается по /start)

Теперь `/start` показывает кнопку, которая открывает Telegram Mini App —
единое окно с анкетой, поиском, гайдами и премиумом, вместо переписки
сообщениями.

Как это устроено:

- `webapp/server.py` — встроенный веб-сервер (aiohttp), поднимается
  автоматически вместе с ботом (см. `main.py`). Отдаёт `webapp/static/*`
  и REST API (`/api/games`, `/api/me`, `/api/profile`, `/api/search`,
  `/api/guides`, `/api/pay/invoice`).
- `webapp/auth.py` — проверяет подпись `initData`, которую Telegram
  передаёт фронтенду, чтобы никто не мог дёргать API от чужого имени.
- `webapp/static/` — сама Mini App: `index.html` + `style.css` + `app.js`.
  Это **базовая оболочка**, которую можно полностью заменить своим
  дизайном.

### Как подключить дизайн, сделанный в другом ИИ

Два варианта:

1. **Заменить файлы в `webapp/static/`.** Проще всего: возьми
   сгенерированные `index.html`/CSS и подставь свою вёрстку, но оставь
   в JS вызовы `fetch('/api/...')` из `app.js` (или перенеси эту логику
   в свой скрипт один в один — набор эндпоинтов не меняется).
2. **Захостить дизайн отдельно** (Vercel/Netlify/свой сервер) и просто
   указать его адрес в `WEBAPP_URL`. Тогда с бэкендом (`webapp/server.py`)
   он должен общаться сам — либо через те же `/api/...` эндпоинты (нужно
   разрешить CORS в `webapp/server.py`), либо через `tg.sendData()` —
   зависит от того, что удобнее твоему ИИ-инструменту.

Главное правило Telegram: **Mini App обязано открываться по HTTPS.**
`http://localhost` не подойдёт, даже для тестов.

### Запуск и тест локально

1. Установи [ngrok](https://ngrok.com/) (или localtunnel) и прокинь порт:
   ```bash
   ngrok http 8080
   ```
2. Скопируй выданный `https://xxxx.ngrok-free.app` в `.env` → `WEBAPP_URL`.
3. Запусти бота (`python main.py`), нажми `/start` — увидишь кнопку
   «🚀 Открыть TeamFinder».

### Прод

На VPS/Railway/Render просто укажи в `WEBAPP_URL` свой домен с HTTPS
(Let's Encrypt/Caddy настраиваются автоматически на большинстве
платформ). Порт из `WEBAPP_PORT` должен слушать тот же процесс, что
запускает бота — `main.py` поднимает и бота, и веб-сервер вместе.

## Расширение

- Добавь игры в `data/games.py`
- Добавь гайды в `data/guides.py`
- Замени `video_url` на свои YouTube-ссылки
- Настрой цены в `.env`

## Команды бота

- `/start` — главное меню
- Кнопки: Найти команду, Моя анкета, Гайды, Премиум

---

Бизнес-модель: бесплатный поиск привлекает пользователей, Stars монетизируют лучший подбор и контент.
