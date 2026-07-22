# Production Readiness Audit — Design / Architecture Plan

Этот документ описывает **как** будут решены требования из `requirements.md` — какие файлы
изменятся, какая архитектура будет применена, какие риски нужно учесть.

---

## D1 — Подключение к Neon (asyncpg + SSL)

### Текущая реализация

`database.py`, метод `connect()`:
```python
self._pool = await asyncpg.create_pool(
    self.database_url,
    ssl="require" if "render.com" in self.database_url else None,
)
```

Логика: включать SSL только если хост содержит `"render.com"`. Это работает для Render,
но **не работает для Neon** (hosts вида `ep-XXX-XXX.us-east-2.aws.neon.tech`).

### Предлагаемое решение

**Вариант A** (консервативный): детектировать `neon.tech` явно:
```python
requires_ssl = "render.com" in self.database_url or "neon.tech" in self.database_url
self._pool = await asyncpg.create_pool(
    self.database_url,
    ssl="require" if requires_ssl else None,
)
```

**Вариант B** (универсальный): включать SSL для всех удалённых хостов:
```python
from urllib.parse import urlparse
parsed = urlparse(self.database_url)
localhost_hosts = {"localhost", "127.0.0.1", "::1"}
requires_ssl = parsed.hostname not in localhost_hosts
self._pool = await asyncpg.create_pool(
    self.database_url,
    ssl="require" if requires_ssl else None,
)
```

**Рекомендация:** Вариант B. Он работает для Render, Neon, Supabase, Railway и любого
облачного Postgres. Риск: если кто-то деплоит на VPS без SSL, нужно будет явно передать
`DATABASE_URL` с параметром `?sslmode=disable` (что можно поддержать через явный парсинг).

**Альтернатива (максимальная гибкость):** парсить `?sslmode=` из query string, если есть.
Это сложнее, но позволит явно управлять SSL через `.env`. Для первого этапа — overkill.

### Изменяемые файлы

- `database.py`: метод `__init__` или `connect()`.
- Документация `.env.example`: добавить комментарий про SSL.

### Риски

- Если у кого-то локальный Postgres работает на нестандартном хосте (например, Docker-контейнер
  с именем `db`), то попытка SSL вызовет ошибку. Решение: явный `?sslmode=disable` в
  `DATABASE_URL` локального `.env`.

---

## D2 — Исправление HMAC initData

### Текущая реализация

`webapp/auth.py`:
```python
secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
```

Первый вызов `hmac.new(key, msg, algo)` означает:
- `key = b"WebAppData"`
- `msg = bot_token.encode()`

Это **неверно**. Telegram-документация (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
```
secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
```
То есть key=bot_token, msg="WebAppData".

### Предлагаемое решение

Поменять местами аргументы:
```python
secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
```

### Изменяемые файлы

- `webapp/auth.py`: функция `validate_init_data()`.

### Риски

- **Критический риск:** если бот уже опубликован и пользователи открывали Mini App, то
  после фикса старые сохранённые `initData` (в localStorage фронтенда или кэше браузера)
  перестанут проходить валидацию до обновления страницы.
- Минимизация: добавить fallback-логику на первые 24 часа после деплоя — пробовать
  оба варианта HMAC. Если старый совпал → warning в логи, но пропустить пользователя.
- Альтернатива: задеплоить фикс одновременно с очисткой localStorage на фронтенде
  (команда `window.localStorage.clear()` в dev-консоли тестерам).

### План перехода

1. Изменить `validate_init_data()` на корректный алгоритм.
2. Тест: создать тестовый Mini App с реальным Telegram WebApp SDK, захватить `initData`,
   проверить, что новый код его принимает.
3. Если у бота уже есть пользователи, добавить временную ветку-fallback (см. выше).

---

## D3 — Фронтенд и SSR

### Текущая реализация

`web-src/lib/api.ts`: функция `getInitData()` проверяет `typeof window === "undefined"` и
возвращает `""`, если SSR. Все компоненты используют `api.get/post`, которые добавляют
заголовок из `getInitData()`.

### Риски

- Если где-то есть `getServerSideProps` или `"use server"` компонент, который делает
  `fetch("/api/me")`, заголовок будет пустой → 401.
- Next.js 16 (App Router) по умолчанию рендерит компоненты на сервере, если нет `"use client"`.

### Предлагаемое решение

- Аудит всех `.tsx` файлов в `web-src/app/` и `web-src/components/`: убедиться, что компоненты,
  которые вызывают `api.*`, имеют директиву `"use client"`.
- Документировать в README: "Все компоненты, вызывающие API, должны быть клиентскими".
- Альтернатива: если есть реальная SSR-необходимость, создать отдельный серверный fetch-хелпер
  с авторизацией через shared secret (опасно — не рекомендуется).

### Изменяемые файлы

- `web-src/app/**/*.tsx`: добавить `"use client"` где нужно.
- Документация: `web-src/README.md` или `docs/frontend-guide.md`.

---

## D4 — SQL-инъекции — документирование миграций

### Текущая реализация

`database.py`, метод `_migrate()`: динамически строит SQL для `ALTER TABLE ... ADD COLUMN`.
Источник данных — константный список `column_migrations` внутри кода. Пользовательский
ввод не участвует.

### Предлагаемое решение

Добавить комментарий перед циклом миграций:
```python
# Миграционная логика: динамически строит SQL для добавления колонок.
# Источник данных (table, column, col_type) — константный массив column_migrations,
# определённый в коде, а не из пользовательского ввода. SQL-инъекция невозможна.
for table, column, col_type in column_migrations:
    try:
        await conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
    ...
```

Аналогично для `f"SELECT COUNT(*) FROM {table} ..."`.

### Изменяемые файлы

- `database.py`: метод `_migrate()`.

---

## D5 — Rate limiting после аутентификации

### Текущая реализация

`webapp/server.py`:
```python
app = web.Application(middlewares=[error_middleware, auth_middleware, web_rate_limit_middleware])
```

В aiohttp middleware исполняются слева направо. Порядок верный: сначала error-обработка,
потом auth, потом rate limit.

### Проблема

`web_rate_limit_middleware` использует `request.get("init_data")`, который устанавливается
`auth_middleware`. Если кто-то случайно поменяет порядок middleware в будущем, rate limit
сломается без явной ошибки (просто не будет лимитов).

### Предлагаемое решение

Добавить явную проверку в `web_rate_limit_middleware`:
```python
@web.middleware
async def web_rate_limit_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        init_data = request.get("init_data")
        if init_data is None:
            # Middleware-порядок нарушен: auth_middleware должен быть раньше
            logging.error("web_rate_limit_middleware: init_data is None — check middleware order")
            return web.json_response({"error": "internal server error"}, status=500)
        user = init_data.get("user")
        if user and "id" in user:
            user_id = user["id"]
            ...
```

И комментарий в `create_app()`:
```python
# Порядок middleware критичен:
# 1. error_middleware — перехватывает все исключения
# 2. auth_middleware — проверяет X-Telegram-Init-Data, устанавливает request["init_data"]
# 3. web_rate_limit_middleware — читает user_id из request["init_data"]
app = web.Application(middlewares=[error_middleware, auth_middleware, web_rate_limit_middleware])
```

### Изменяемые файлы

- `webapp/server.py`: `web_rate_limit_middleware`, `create_app()`.

---

## D6 — Секреты в git-истории

### Текущая реализация

`.gitignore` содержит `.env`. ✅

### Проверка

```powershell
git log --all --full-history -- .env
```

Если выдаёт какие-то коммиты, нужно их удалить из истории (`git filter-branch` или `git filter-repo`).

### Предлагаемое решение

- Если `.env` когда-либо был в git: использовать `git filter-repo --path .env --invert-paths`
  для удаления всех следов.
- Ротация секретов: сгенерировать новый `BOT_TOKEN` через @BotFather, обновить в Render env vars.
- Нового `DATABASE_URL` генерировать не нужно (Neon не хранит пароль в git).

### Изменяемые файлы

- Нет (только git-операция). Если нужна ротация токена → только env vars в Render.

---

## D7 — Логирование ошибок в error_middleware

### Текущая реализация

`webapp/server.py`, `error_middleware`:
```python
except Exception as e:
    return web.json_response({"error": "internal server error"}, status=500)
```

Исключение `e` нигде не логируется.

### Предлагаемое решение

```python
import logging
...
except Exception as e:
    logging.exception("Unhandled exception in API handler: %s", request.path)
    return web.json_response({"error": "internal server error"}, status=500)
```

`logging.exception(...)` автоматически включает стектрейс в лог (уровень ERROR).

### Изменяемые файлы

- `webapp/server.py`: `error_middleware()`.

---

## D8 — Объединение старого и нового фронтенда

### Текущая ситуация

`web-src/package.json`: Next.js 16, React 19, Tailwind CSS 4, shadcn 4.8.

**Проблемы:**
1. **Tailwind 4**: принципиально другая архитектура — нет `tailwind.config.js`, конфигурация
   через CSS `@theme`. Если есть старый `tailwind.config.js` — будет конфликт.
2. **shadcn 4.8.0 как dependency**: shadcn — это CLI-инструмент для генерации компонентов,
   не должен быть в `dependencies`. Возможно, это ошибка или транзитивный пакет. Нужно проверить.
3. **lucide-react ^1.16.0**: мажорная версия, несовместимая с `^0.x`. Если где-то импортируются
   иконки из старой версии — будут ошибки типов.
4. **pnpm.overrides: hono 4.12.25**: откуда Hono в frontend-проекте? Возможно, транзитивная
   зависимость от какого-то MCP-сервера или тестового пакета. Нужно выяснить.

### Предлагаемое решение

**Шаг 1:** Проверить сборку:
```powershell
cd web-src
npm run build  # или pnpm build
```

**Шаг 2:** Если есть ошибки:
- Tailwind 3 → 4: миграция через https://tailwindcss.com/docs/v4-beta или откат на Tailwind 3.
- shadcn: переместить из `dependencies` в `devDependencies` или удалить, если не используется.
- lucide-react: проверить все импорты, убедиться, что используется единая версия.
- Hono: найти источник (`pnpm why hono`), удалить или обновить зависимость.

**Шаг 3:** Проверить дублирование компонентов:
- Если есть `web-src/components/ui/button.tsx` и `web-src/components/Button.tsx` с разным кодом —
  оставить один, удалить другой.
- Поиск: `grep -r "export.*Button" web-src/components` и сравнить реализации.

**Шаг 4:** TypeScript-проверка:
```powershell
npx tsc --noEmit
```

### Изменяемые файлы

- `web-src/package.json`: возможно, изменение версий зависимостей.
- `web-src/tailwind.config.js` или `web-src/app/globals.css`: миграция Tailwind.
- `web-src/components/**/*.tsx`: удаление дублирующихся компонентов.

### Риски

- Tailwind 3 → 4 — breaking changes могут сломать вёрстку. Если проект близок к релизу,
  безопаснее откатиться на Tailwind 3.
- Next.js 16 + React 19 — stable, но если есть старые пакеты, несовместимые с React 19
  (например, `react-beautiful-dnd`), нужен апдейт или замена.

---

## Итоговый порядок выполнения

1. **D6 (секреты в git):** проверить историю, ротировать токены если нужно.
2. **D2 (HMAC initData):** исправить валидацию (критично для безопасности).
3. **D1 (Neon SSL):** исправить подключение к БД (блокирует деплой).
4. **D7 (логирование ошибок):** добавить `logging.exception` (лёгкий фикс).
5. **D5 (rate limit middleware):** добавить проверку и комментарии.
6. **D4 (SQL-комментарии):** документировать миграции.
7. **D3 (SSR-аудит фронтенда):** проверить `"use client"` директивы.
8. **D8 (сборка фронтенда):** исправить зависимости, собрать проект.

Задачи можно выполнять параллельно (бэкенд D1-D7 не зависят от фронтенда D3/D8).
