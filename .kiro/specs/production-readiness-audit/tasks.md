# Production Readiness Audit — Tasks

Каждый таск выполняется отдельно. После каждого показывается diff и краткое объяснение.
Существующий рабочий функционал не удаляется без явного обоснования.

---

## Task 1 — Проверка git-истории на предмет секретов

**Приоритет:** Высокий (выполнить первым)
**Файлы:** нет изменений кода, только git-проверка

### Чек-лист

- [ ] Выполнить `git log --all --full-history -- .env` — убедиться, что `.env` не коммитился
- [ ] Выполнить поиск токенов в истории: `git log -p | grep -i "bot_token\|database_url" | head -20`
- [ ] Проверить `.gitignore` — `.env` должен быть там
- [ ] Убедиться, что `.env.example` содержит только placeholder-значения, не реальные
- [ ] Зафиксировать результат: если история чистая — написать "OK" в комментарий этого таска

**Выход:** Отчёт о состоянии git-истории. Если секреты найдены — сначала ротировать токены,
потом чистить историю через `git filter-repo`.

**Коммит (если нужно):** `security: remove .env from git history` *(только если нашлось)*

---

## Task 2 — Исправление HMAC-SHA256 в webapp/auth.py

**Приоритет:** Критический (безопасность)
**Файлы:** `webapp/auth.py`

### Чек-лист

- [ ] Открыть `webapp/auth.py`
- [ ] Найти строку: `secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()`
- [ ] Исправить на: `secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()`
  (поменять местами key и msg согласно официальному алгоритму Telegram)
- [ ] Убедиться, что `hmac.compare_digest` используется для сравнения (уже есть — не трогать)
- [ ] Убедиться, что проверка `auth_date` (86400 сек) осталась без изменений
- [ ] Проверить: запустить быстрый unit-тест с известными тестовыми данными Telegram

**Diff (ожидаемый):**
```diff
-    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
+    secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
```

**Объяснение:** Telegram требует `HMAC(key=bot_token, msg="WebAppData")`. В старом коде
аргументы были перепутаны местами, что делало валидацию криптографически неверной.
Все реальные initData из Telegram WebApp отклонялись бы (или принимались неправильные).

**Коммит:** `security(auth): fix HMAC key/msg order in validate_init_data`

---

## Task 3 — Исправление SSL-подключения к Neon в database.py

**Приоритет:** Высокий (блокирует деплой на Neon)
**Файлы:** `database.py`, `.env.example`

### Чек-лист

- [ ] Открыть `database.py`, найти метод `connect()`
- [ ] Заменить детекцию по `"render.com"` на универсальную логику по hostname
- [ ] Импортировать `from urllib.parse import urlparse` в начале файла
- [ ] Реализовать: SSL включается если hostname не `localhost`, `127.0.0.1`, `::1`
- [ ] Добавить обработку `?sslmode=` параметра из URL: если он присутствует — удалить из
  DSN и использовать как явный аргумент `ssl=`
- [ ] Обновить `.env.example`: добавить комментарий про SSL для Neon
- [ ] Проверить: `python -c "from database import Database; ..."` без реального подключения

**Diff (ожидаемый):**
```diff
+from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
...
-    async def connect(self) -> None:
-        self._pool = await asyncpg.create_pool(
-            self.database_url,
-            ssl="require" if "render.com" in self.database_url else None,
-        )
+    async def connect(self) -> None:
+        parsed = urlparse(self.database_url)
+        localhost_hosts = {"localhost", "127.0.0.1", "::1", ""}
+        ssl_arg = "require" if parsed.hostname not in localhost_hosts else None
+        self._pool = await asyncpg.create_pool(
+            self.database_url,
+            ssl=ssl_arg,
+        )
```

**Объяснение:** Старый код включал SSL только для `render.com`-хостов. Neon использует
`*.neon.tech`-домены, которые также требуют SSL. Новая логика: SSL для всех удалённых
хостов, кроме localhost-вариантов (для локальной разработки).

**Коммит:** `fix(db): enable SSL for all remote Postgres hosts (Neon compatibility)`

---

## Task 4 — Добавление logging.exception в error_middleware

**Приоритет:** Средний (observability)
**Файлы:** `webapp/server.py`

### Чек-лист

- [ ] Открыть `webapp/server.py`
- [ ] Найти `error_middleware`
- [ ] Добавить `import logging` если его нет в файле (проверить — нет)
- [ ] Добавить `logging.exception(...)` перед `return web.json_response(...)`
- [ ] Убедиться, что `{"error": "internal server error"}` остался без изменений
- [ ] Убедиться, что `web.HTTPException` по-прежнему пробрасывается через `raise`

**Diff (ожидаемый):**
```diff
+import logging
 ...
 @web.middleware
 async def error_middleware(request: web.Request, handler):
     try:
         return await handler(request)
     except web.HTTPException:
         raise
     except Exception as e:
+        logging.exception("Unhandled exception in %s %s", request.method, request.path)
         return web.json_response({"error": "internal server error"}, status=500)
```

**Объяснение:** Без логирования при prod-ошибке в логах Render нет ничего — невозможно
отладить проблему. `logging.exception()` автоматически добавляет стектрейс в лог, при
этом пользователь по-прежнему видит только `{"error": "internal server error"}`.

**Коммит:** `fix(server): log full exception in error_middleware`

---

## Task 5 — Комментарий middleware-порядка и защита rate-limit

**Приоритет:** Средний (maintainability)
**Файлы:** `webapp/server.py`

### Чек-лист

- [ ] Открыть `webapp/server.py`, найти `create_app()`
- [ ] Добавить комментарий, объясняющий порядок middleware
- [ ] В `web_rate_limit_middleware`: добавить defensive-проверку на случай, если
  `auth_middleware` не выполнился (init_data is None → лог ошибки + 500)
- [ ] Убедиться, что логика rate-limit не изменилась функционально

**Diff (ожидаемый):**
```diff
 @web.middleware
 async def web_rate_limit_middleware(request: web.Request, handler):
     if request.path.startswith("/api/"):
-        user = request.get("init_data", {}).get("user")
+        init_data = request.get("init_data")
+        if init_data is None:
+            # auth_middleware must run before web_rate_limit_middleware
+            logging.error("web_rate_limit_middleware: init_data is None — middleware order broken")
+            return web.json_response({"error": "internal server error"}, status=500)
+        user = init_data.get("user")
         if user and "id" in user:
             ...

 def create_app(...) -> web.Application:
+    # Middleware execution order (left to right):
+    # 1. error_middleware      — catches all unhandled exceptions, hides stacktraces
+    # 2. auth_middleware       — validates X-Telegram-Init-Data, sets request["init_data"]
+    # 3. web_rate_limit_middleware — reads user_id from request["init_data"] set by auth
+    # IMPORTANT: do not reorder without updating web_rate_limit_middleware logic
     app = web.Application(middlewares=[error_middleware, auth_middleware, web_rate_limit_middleware])
```

**Объяснение:** Rate limit читает `user_id` из `request["init_data"]`, которое устанавливается
`auth_middleware`. Комментарий и defensive-проверка предотвращают тихое отключение лимитов
при случайном изменении порядка middleware в будущем.

**Коммит:** `refactor(server): document middleware order, add defensive check in rate limiter`

---

## Task 6 — Документирование динамического SQL в миграциях

**Приоритет:** Низкий (code quality / security clarity)
**Файлы:** `database.py`

### Чек-лист

- [ ] Открыть `database.py`, найти метод `_migrate()`
- [ ] Перед циклом `for table, column, col_type in column_migrations:` добавить комментарий
- [ ] Перед `f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL"` добавить комментарий
- [ ] Убедиться, что логика миграций не изменилась

**Diff (ожидаемый):**
```diff
+        # Security note: `table`, `column`, `col_type` come from the constant list
+        # `column_migrations` defined in this file — not from user input.
+        # Dynamic SQL here is safe; there is no user-controlled data in these identifiers.
         for table, column, col_type in column_migrations:
             try:
                 await conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
             ...

         for table in user_scoped_tables:
             if await self._column_exists(conn, table, "user_id"):
                 try:
+                    # `table` is from constant `user_scoped_tables` — not user input.
                     count = await conn.fetchval(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL")
```

**Объяснение:** Явный комментарий подтверждает, что динамический SQL строится из константных
значений кода, а не из пользовательского ввода. Это важно для code reviews и аудита безопасности.

**Коммит:** `docs(db): document dynamic SQL in migrations as safe (constant sources only)`

---

## Task 7 — Аудит SSR-компонентов фронтенда

**Приоритет:** Средний (корректность)
**Файлы:** `web-src/app/**/*.tsx`, `web-src/components/**/*.tsx`

### Чек-лист

- [ ] Найти все файлы в `web-src/app/` и `web-src/components/`, которые вызывают `api.get` или `api.post`
- [ ] Для каждого такого файла убедиться, что первая строка — `"use client"`
- [ ] Проверить, что `web-src/app/layout.tsx` не содержит прямых API-вызовов к бэкенду
- [ ] Проверить `web-src/lib/store.tsx` (если есть) — если он вызывает API, он должен быть клиентским
- [ ] Запустить `npx tsc --noEmit` в `web-src/` и убедиться в отсутствии TypeScript-ошибок,
  связанных с `window` или Telegram SDK

**Ожидаемые изменения:** Добавление `"use client"` в файлы, которые его не имеют.

**Объяснение:** Next.js App Router рендерит компоненты на сервере по умолчанию.
`window.Telegram.WebApp.initData` недоступен на сервере, поэтому компоненты, использующие
initData или вызывающие API бэкенда, должны явно быть клиентскими.

**Коммит:** `fix(frontend): add "use client" to all components using API or Telegram SDK`

---

## Task 8 — Проверка и исправление сборки фронтенда

**Приоритет:** Высокий (работоспособность)
**Файлы:** `web-src/package.json`, `web-src/app/globals.css`, возможно `web-src/components/`

### Чек-лист

- [ ] Выполнить `cd web-src && npm install` (или `pnpm install`)
- [ ] Выполнить `npm run build` и записать все ошибки
- [ ] Если ошибки связаны с Tailwind 4 (неизвестные утилиты, ошибки `@theme`):
  - [ ] Проверить наличие `tailwind.config.js` vs `postcss.config.mjs`
  - [ ] Применить миграцию согласно https://tailwindcss.com/docs/upgrade-guide
- [ ] Если ошибки связаны с `shadcn` как dependency:
  - [ ] Переместить из `dependencies` в `devDependencies`
  - [ ] Или удалить, если не используется напрямую в коде
- [ ] Если ошибки с `lucide-react`:
  - [ ] Проверить все импорты, убедиться что используется один источник
- [ ] Выполнить `pnpm why hono` для понимания откуда транзитивная зависимость
- [ ] После фиксов: `npm run build` без ошибок
- [ ] Проверить итоговый бандл: `ls web-src/.next/static/` — должны быть файлы

**Объяснение:** Сборка без ошибок — минимальное требование для деплоя. Tailwind 4 ввёл
breaking changes в API конфигурации. Дублирующиеся компоненты создают неконсистентный UI.

**Коммит:** `fix(frontend): resolve build errors, clean up dependencies`

---

## Task 9 — Финальная проверка и подготовка коммитов

**Приоритет:** Завершающий
**Файлы:** нет новых изменений

### Чек-лист

- [ ] Запустить бот локально: `python main.py` — убедиться, что стартует без ошибок
- [ ] Открыть Mini App через Telegram — убедиться, что initData проходит валидацию
- [ ] Сделать тестовый запрос к API с фейковым initData — должен вернуть 401
- [ ] Проверить подключение к Neon: `python -c "import asyncio; from database import Database; from config import load_settings; ..."` 
- [ ] Финальный `npm run build` в `web-src/` — без ошибок
- [ ] Просмотреть все изменённые файлы: `git diff`
- [ ] Сформировать логические группы коммитов:
  - **Group A — Security:** Task 1 + Task 2 (секреты + HMAC)
  - **Group B — Infrastructure:** Task 3 (Neon SSL)
  - **Group C — Observability:** Task 4 (logging)
  - **Group D — Code quality:** Task 5 + Task 6 (middleware + SQL-комментарии)
  - **Group E — Frontend:** Task 7 + Task 8 (SSR + сборка)
- [ ] Создать ветку: `git checkout -b prod-readiness-audit`
- [ ] Закоммитить по группам (без `git push` до подтверждения)
- [ ] Показать пользователю финальный `git log --oneline` и ждать подтверждения на пуш

---

## Итоговый отчёт (после выполнения всех тасков)

После выполнения всех тасков будет подготовлен отчёт:

| # | Проблема | Статус | Файл |
|---|----------|--------|------|
| R1 | Neon SSL | ✅ Исправлено | `database.py` |
| R2 | HMAC initData | ✅ Исправлено | `webapp/auth.py` |
| R3 | Frontend SSR | ✅ Проверено | `web-src/app/**` |
| R4 | SQL-инъекции | ✅ Задокументировано | `database.py` |
| R5 | Rate limit порядок | ✅ Задокументировано | `webapp/server.py` |
| R6 | Секреты в git | ✅ Проверено | `.gitignore` |
| R7 | Стектрейсы в ответах | ✅ Исправлено | `webapp/server.py` |
| R8 | Сборка фронтенда | ✅ Собирается | `web-src/` |
