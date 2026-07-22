# Production Readiness Audit — Requirements

## Контекст

Telegram-бот teamfinder-bot (Python / aiogram 3) с мини-аппом (Next.js 16 / aiohttp).
База данных — Neon (Postgres). Деплой бэкенда — Render.
Проект работает, но ряд аспектов безопасности и стабильности требует явной проверки
и фиксов перед тем, как давать ссылку на него широкой аудитории.

---

## R1 — Подключение к Neon (asyncpg + SSL)

**Требование:** Подключение к базе данных должно корректно работать с Neon (Postgres),
без несовместимых query-параметров в connection string.

**Детали:**
- Neon требует SSL, но не принимает `sslmode=require` как query-параметр в строке DSN
  при использовании asyncpg — это вызывает `InvalidCatalogNameError` или падение при старте.
- Корректный способ: передавать `ssl="require"` как keyword-аргумент в `asyncpg.create_pool()`,
  а из DATABASE_URL убирать параметр `sslmode`, если он там есть.
- Текущий код (`database.py`) проверяет `"render.com" in self.database_url` и включает SSL
  только для Render-хостов. Neon не является Render-хостом, поэтому SSL не включится.
- Нужно: добавить детекцию Neon-хостов (`neon.tech`) и/или перейти на универсальную логику
  (например, включать SSL если `DATABASE_URL` не указывает на localhost/127.0.0.1).

**Критерий приёмки:**
- Бот стартует и подключается к Neon без ошибок SSL.
- DATABASE_URL с `?sslmode=require` не вызывает ошибок asyncpg.
- Локальная разработка (localhost без SSL) по-прежнему работает.

---

## R2 — Криптографически верная валидация Telegram initData

**Требование:** `webapp/auth.py` должен реализовывать валидацию initData строго по
официальному алгоритму Telegram.

**Детали:**
- Официальный алгоритм: `secret_key = HMAC-SHA256("WebAppData", bot_token)`,
  `computed_hash = HMAC-SHA256(secret_key, data_check_string)`.
- Текущий код использует `hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256)` —
  это **верно**: первый аргумент `hmac.new` — это key, второй — msg. Значит
  `secret_key = HMAC(key="WebAppData", msg=bot_token)`.
- ⚠️ **Проблема:** официальный алгоритм требует обратного:
  `secret_key = HMAC(key=bot_token, msg="WebAppData")`.
  В текущем коде ключ и сообщение перепутаны.
- `hmac.compare_digest` используется верно (timing-safe).
- Проверка `auth_date` (не старше 86400 сек) реализована верно.

**Критерий приёмки:**
- `secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()`
- Тест: initData, сгенерированный реальным Telegram WebApp, проходит валидацию.
- Фейковый/подделанный initData отклоняется с 401.

---

## R3 — Фронтенд отправляет initData в каждый запрос

**Требование:** Все обращения фронтенда к бэкенду должны содержать заголовок
`X-Telegram-Init-Data` с актуальным `window.Telegram.WebApp.initData`.

**Детали:**
- `web-src/lib/api.ts` уже реализует это через функцию `request()` — заголовок
  `X-Telegram-Init-Data` добавляется в каждый вызов. ✅
- Риск: SSR-рендеринг Next.js. Если компонент делает fetch на сервере (`"use server"` или
  `getServerSideProps`), `window` не доступен и `getInitData()` вернёт пустую строку.
  Нужно убедиться, что все API-вызовы к бэкенду происходят только на клиенте (`"use client"`).
- `NEXT_PUBLIC_API_BASE` должен быть задан в деплое (или правильно проксироваться Next.js).

**Критерий приёмки:**
- Все API-вызовы к `/api/*` идут через клиентский `api.get/api.post` из `lib/api.ts`.
- Нет SSR-фетчей к бэкенду без initData.
- Документация: в `.env.example` есть `NEXT_PUBLIC_API_BASE`.

---

## R4 — Только параметризованные SQL-запросы

**Требование:** Все SQL-запросы в `database.py` должны использовать параметризацию
(`$1, $2, ...`), без конкатенации пользовательского ввода в строку запроса.

**Детали:**
- Текущий код `database.py` — все основные запросы параметризованы через `$N`. ✅
- Исключение: в методе `_migrate()` есть динамическое построение SQL-строк для
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS {column} {col_type}` — где `table`, `column`,
  `col_type` берутся из константного списка `column_migrations` внутри кода, а не из
  пользовательского ввода. Технически это не SQL-инъекция, но стоит явно задокументировать.
- Аналогично: `f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL"` — `table` из
  константы `user_scoped_tables`. Риска нет, но нужен комментарий.

**Критерий приёмки:**
- Ни один запрос не конкатенирует пользовательский ввод (данные из запроса, initData, тело запроса).
- Динамические SQL в миграциях имеют комментарий, подтверждающий, что источник данных — константа.

---

## R5 — Rate limiting в правильном порядке

**Требование:** Rate limiting должен применяться после аутентификации, не до неё.
Порядок middleware в aiohttp: сначала error → auth → rate_limit, не наоборот.

**Детали:**
- Текущий `webapp/server.py`, функция `create_app()`:
  ```python
  app = web.Application(middlewares=[error_middleware, auth_middleware, web_rate_limit_middleware])
  ```
  Порядок выполнения в aiohttp: middleware исполняются слева направо в порядке списка.
  То есть: `error_middleware` → `auth_middleware` → `web_rate_limit_middleware`. ✅ Верно.
- ⚠️ Однако `web_rate_limit_middleware` читает `request.get("init_data")` (установленный
  `auth_middleware`) для получения `user_id`. Если порядок когда-либо поменяется,
  rate limit перестанет работать. Нужен тест или явный комментарий.
- Telegram-хендлеры (`middleware.py`): `RateLimitMiddleware` регистрируется раньше
  `InjectMiddleware` в `main.py` — `dp.update.middleware(RateLimitMiddleware())` →
  `dp.update.middleware(InjectMiddleware(...))`. В aiogram 3 порядок `.middleware()` =
  порядок wrap-а снаружи внутрь. Rate limit оборачивает снаружи → выполняется первым. ✅

**Критерий приёмки:**
- Неавторизованный запрос к `/api/*` получает `401`, а не `429`.
- Документирующий комментарий в `create_app()` объясняет порядок и причину.

---

## R6 — Секреты только через переменные окружения

**Требование:** `BOT_TOKEN`, `DATABASE_URL` и прочие секреты — только через `.env`/env vars.
Нигде не захардкожены в коде. `.env` в `.gitignore`.

**Детали:**
- `config.py` загружает все секреты через `os.getenv()` и падает с `RuntimeError` если
  `BOT_TOKEN` или `DATABASE_URL` не заданы. ✅
- `.gitignore` содержит строку `.env`. ✅
- `.env.example` содержит только placeholder-значения. ✅
- Риск: убедиться, что в истории git нет случайно закоммиченного `.env`.

**Критерий приёмки:**
- `git log --all --full-history -- .env` ничего не показывает.
- `grep -r "BOT_TOKEN\s*=" --include="*.py"` не выдаёт захардкоженных значений.
- В Render/деплое секреты задаются через Environment Variables.

---

## R7 — Отсутствие стектрейсов в ответах API

**Требование:** Ошибки на бэкенде не должны возвращать пользователю стектрейсы —
только generic-сообщения.

**Детали:**
- `webapp/server.py` содержит `error_middleware`:
  ```python
  async def error_middleware(request, handler):
      try:
          return await handler(request)
      except web.HTTPException:
          raise
      except Exception as e:
          return web.json_response({"error": "internal server error"}, status=500)
  ```
  Это скрывает стектрейс от пользователя. ✅
- ⚠️ Исключение `e` нигде не логируется — при prod-ошибках нет трейса в логах Render.
  Нужно добавить `logging.exception(...)` перед возвратом 500.
- Telegram-хендлеры: aiogram 3 по умолчанию логирует необработанные исключения,
  но не отправляет стектрейсы пользователю. ✅

**Критерий приёмки:**
- 500-ответы содержат только `{"error": "internal server error"}`.
- В логах Render при этом появляется полный трейс для отладки.
- Проверяется намеренным `raise Exception("test")` в тестовом эндпоинте (затем удалить).

---

## R8 — Объединение старого и нового фронтенда без конфликтов

**Требование:** Код из `web-src/` (старый фронтенд + v0-компоненты) должен собираться
`npm run build` без ошибок. Нет дублирующихся компонентов, нет конфликтующих зависимостей.

**Детали:**
- `web-src/package.json`: Next.js 16.2.6, React 19, Tailwind CSS 4, shadcn 4.8, lucide-react 1.16.
- Tailwind 4 использует принципиально другой API (нет `tailwind.config.js`, конфигурация через
  CSS `@theme`). Если v0-компоненты написаны под Tailwind 3 с `tailwind.config.js` — будет конфликт.
- `shadcn 4.8.0` как dependency (не как devDependency/CLI) может конфликтовать с `@base-ui/react`.
- `lucide-react ^1.16.0` — мажорная версия без обратной совместимости с `^0.x`.
- `pnpm.overrides: hono: 4.12.25` — транзитивный конфликт в каком-то пакете; нужно понять, откуда.

**Критерий приёмки:**
- `cd web-src && npm run build` (или `pnpm build`) завершается без ошибок.
- Нет дублированных UI-компонентов (один и тот же компонент в двух местах с разным кодом).
- Все импорты в `.tsx` файлах резолвятся без ошибок TypeScript.
