# Состояние проекта teamfinder-bot

*Обновлено: июль 2026*

---

## Что это такое

**TeamFinder** — Telegram-бот для поиска тиммейтов в онлайн-играх (CS2, Dota 2 и др.).
Пользователь создаёт анкету, бот находит подходящих игроков по игре, рангу и роли.
Дополнительно есть мини-приложение прямо внутри Telegram (кнопка в /start) с кейсами,
батл-пассом, лидербордом и промокодами.

---

## Структура проекта

```
teamfinder-bot/
│
├── main.py                  Точка входа. Запускает бота и веб-сервер одновременно.
├── config.py                Загрузка настроек из переменных окружения (.env).
├── database.py              Все запросы к базе данных (PostgreSQL через asyncpg).
├── middleware.py            Защита от спама (rate limit) и инъекция зависимостей.
├── states.py                Состояния для многошагового создания анкеты.
│
├── handlers/                Обработчики команд Telegram-бота
│   ├── start.py             /start, главное меню
│   ├── profile.py           Создание и редактирование анкеты
│   ├── search.py            Поиск тиммейтов
│   ├── guides.py            Гайды по играм
│   ├── payments.py          Платежи через Telegram Stars (покупки, инвойсы)
│   └── admin.py             Команды только для администраторов
│
├── webapp/                  Веб-сервер для мини-приложения Telegram
│   ├── server.py            ~40 API-эндпоинтов (/api/me, /api/search, /api/nexus/...)
│   ├── auth.py              Проверка подписи initData от Telegram WebApp (HMAC-SHA256)
│   └── static/              Готовый фронтенд после сборки (HTML, JS, CSS, картинки)
│
├── web-src/                 Исходный код фронтенда (Next.js 16 + React 19 + TypeScript)
│   ├── app/                 Страницы приложения
│   ├── components/miniapp/  Вкладки: Home, Match, Cases, Battlepass, Donate, Guides, Promo, Profile
│   ├── lib/
│   │   ├── api.ts           HTTP-клиент: добавляет X-Telegram-Init-Data в каждый запрос
│   │   └── store.tsx        Состояние приложения: загружает данные с /api/me при старте
│   └── public/              Картинки (кейсы, иконки, аватары)
│
├── data/                    Статические данные
│   ├── games.py             Список игр, ранги, роли, батл-пасс тиры, пакеты монет
│   └── guides.py            Контент гайдов (текст, видео)
│
├── services/
│   └── matching.py          Алгоритм подбора тиммейтов (скоринг по совместимости)
│
├── Dockerfile               Двухэтапная сборка: сначала Next.js, потом Python
├── render.yaml              Конфиг автодеплоя на Render.com
├── requirements.txt         Python-зависимости (4 пакета, все с фиксированными версиями)
└── .env.example             Шаблон переменных окружения (без реальных секретов)
```

---

## Технологии

| Слой | Что используется |
|------|-----------------|
| Telegram-бот | Python 3.12, aiogram 3.17 |
| Веб-сервер API | aiohttp 3.11 |
| База данных | PostgreSQL (Neon) через asyncpg 0.30 |
| Фронтенд | Next.js 16.2, React 19, TypeScript, Tailwind CSS 4 |
| Деплой | Render.com (Docker, free tier) |
| Платежи | Telegram Stars (нативная валюта Telegram) |

---

## База данных (Neon)

**Хостинг:** [neon.tech](https://neon.tech) — serverless PostgreSQL.
Подключение через SSL (обязательно для Neon).
`DATABASE_URL` задаётся в Render → Environment Variables, никогда не хранится в коде.

**Основные таблицы:**

| Таблица | Что хранит |
|---------|-----------|
| `users` | Все пользователи бота (Telegram ID, username) |
| `profiles` | Игровые анкеты (игра, ранг, роль, контакт) |
| `user_currency` | Баланс монет Nexus, Telegram Stars, очков |
| `user_inventory` | Предметы из кейсов |
| `user_battlepass` | Прогресс батл-пасса |
| `case_opens` | История открытий кейсов (для кулдауна) |
| `teams` | Команды (создаются через мини-апп) |
| `team_applications` | Заявки на вступление в команды |
| `promo_codes` | Промокоды и их использование |
| `referrals` | Реферальные коды и приглашённые |
| `daily_streaks` | Ежедневные серии входов |
| `purchases` | История покупок через Telegram Stars |

---

## Деплой (Render.com)

**Один сервис** делает всё сразу: бот + API + фронтенд.

Процесс деплоя (`Dockerfile`):
1. **Этап 1 (Node.js):** собирает Next.js фронтенд из `web-src/` → кладёт в `web-src/out/`
2. **Этап 2 (Python):** копирует собранный фронтенд в `webapp/static/`, запускает `python main.py`

При запуске бот:
- Подключается к Neon (SSL)
- Автоматически создаёт/обновляет схему БД (миграции встроены в `database.py`)
- Поднимает HTTP-сервер на порту из переменной `PORT` (Render задаёт автоматически)
- Запускает polling Telegram Bot API

**Healthcheck:** `GET /health` → `{"status": "ok"}` (используется Render для мониторинга)

---

## API-эндпоинты мини-приложения

Все `/api/*` эндпоинты требуют заголовок `X-Telegram-Init-Data` (кроме публичных).

**Публичные (без авторизации):**
- `GET /api/games` — список игр и ролей
- `GET /api/leaderboard` — топ-10 по монетам (кэш 30 сек)
- `GET /api/teams` — список команд (кэш 30 сек)
- `GET /api/teams/{id}/applications` — заявки к команде
- `GET /api/nexus/shop` — список товаров в магазине

**Защищённые (требуют initData):**
- `GET /api/me` — профиль, баланс, инвентарь, батл-пасс текущего пользователя
- `POST /api/profile` — создать/обновить игровую анкету
- `GET /api/search` — поиск тиммейтов
- `GET /api/guides`, `GET /api/guides/{id}` — гайды
- `POST /api/pay/invoice` — создать Telegram Stars инвойс
- `POST /api/nexus/cases/open` — открыть кейс
- `POST /api/nexus/inventory/sell` — продать предмет
- `POST /api/nexus/exchange` — обменять Stars на монеты Nexus
- `POST /api/battlepass/buy`, `POST /api/battlepass/claim-next` — батл-пасс
- `POST /api/promo/redeem`, `POST /api/promo/create` — промокоды
- `POST /api/streak/claim` — ежедневная награда
- `POST /api/achievements/claim` — достижения
- ... и другие (всего ~40 эндпоинтов)

---

## Переменные окружения (Render → Environment Variables)

| Переменная | Описание |
|-----------|----------|
| `BOT_TOKEN` | Токен бота от @BotFather |
| `DATABASE_URL` | Строка подключения к Neon PostgreSQL |
| `ADMIN_IDS` | Telegram ID администраторов через запятую |
| `WEBAPP_URL` | Публичный HTTPS-адрес сервиса на Render |
| `PRICE_*` | Цены в Telegram Stars (5 разных продуктов) |

**Важно:** реальные значения хранятся только в Render dashboard и локальном `.env` файле.
`.env` добавлен в `.gitignore` и никогда не попадает в git.

---

## Временные/диагностические файлы

Эти файлы в корне проекта — одноразовые скрипты для проверки БД, не используются в продакшене:
- `check_legacy_tables.py` — проверка старых таблиц
- `check_user_currency.py` — проверка таблицы балансов
- `test_db.py` — тест подключения

Можно удалить при желании, бот без них работает нормально.

---

## Безопасность (выполнено в июле 2026)

- HMAC-SHA256 проверка Telegram initData исправлена (правильный порядок key/msg)
- SSL для Neon работает для всех внешних хостов (не только render.com)
- Все ошибки логируются на сервере, пользователю уходит только `{"error": "internal server error"}`
- Rate limiting: 30 запросов/мин для авторизованных, 60/мин по IP для публичных эндпоинтов
- Все секреты — только через переменные окружения, нигде не захардкожены
- git-история очищена от утёкших credentials (BFG Repo Cleaner)
