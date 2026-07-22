# Frontend v0 Integration — Requirements

## Контекст и ключевое открытие

После анализа кода выяснилось: **ZIP-архив `telegram-mini-game (1).zip` и текущий `web-src/`
— это практически один и тот же проект.** Разница между ними — три файла:

| Файл | Где есть | Суть |
|------|----------|------|
| `web-src/lib/api.ts` | только в web-src | Готовый API-клиент с X-Telegram-Init-Data ✅ |
| `public/player-{1-4}.png` | только в ZIP | Аватары игроков (нужно скопировать) |

Это означает: **никакой «миграции» или объединения двух проектов не нужно**. web-src и есть
новый v0-дизайн, просто без подключения к бэкенду — вся логика сейчас в `lib/store.tsx` на
localStorage. Задача — заменить это на реальные API-запросы.

---

## R1 — Стратегия: переработать web-src на месте без создания web-v0/

**Требование:** Определить, нужно ли создавать отдельную папку `web-v0/` или работать
в существующем `web-src/`.

**Решение и обоснование:**

Работать в `web-src/` — не создавать `web-v0/`. Причины:
1. Кодовая база идентична: один и тот же `package.json`, компоненты, CSS.
2. `web-src/lib/api.ts` уже существует и реализует отправку `X-Telegram-Init-Data` на
   каждый запрос — именно то, что нужно.
3. `Dockerfile` и `render.yaml` уже настроены под `web-src/` → сборка в `out/` → копирование
   в `webapp/static/`. Новая папка сломала бы деплой без изменения этих файлов.
4. Создание `web-v0/` только добавило бы дублирование — тот же код в двух местах.

**Что нужно сделать:** переписать `lib/store.tsx` — заменить localStorage-логику на вызовы
`api.get/api.post` из `lib/api.ts`, инициализацию Telegram WebApp и загрузку данных с бэкенда.

**Критерий приёмки:**
- Нет папки `web-v0/` в репозитории (или она содержит только README с пояснением).
- Вся рабочая логика — в `web-src/`.
- Аватары из ZIP (`player-1..4.png`) добавлены в `web-src/public/`.

---

## R2 — Замена моков на реальные API-запросы

**Требование:** Все компоненты должны получать данные с бэкенда, а не из `lib/data.ts`
или `localStorage`.

**Детали (что сейчас, что должно быть):**

| Компонент | Сейчас (мок) | Должно быть (API) |
|-----------|-------------|-------------------|
| home-tab | `currentUser` из data.ts, `players` из data.ts | `GET /api/me`, `GET /api/search` |
| match-tab | `players[]`, `teams[]` из data.ts | `GET /api/search`, `GET /api/teams` |
| profile-tab | localStorage: coins, stars, nick, bio, deco | `GET /api/me`, `POST /api/profile/customize` |
| cases-tab | localStorage: inventory, cooldowns, openCase() | `GET /api/nexus/cases`, `POST /api/nexus/cases/open`, `GET /api/nexus/inventory`, `POST /api/nexus/inventory/sell` |
| battlepass-tab | localStorage: bpXp, claimedTiers, bpPremium | `GET /api/battlepass`, `POST /api/battlepass/buy`, `POST /api/battlepass/claim-next` |
| donate-tab | localStorage: stars, spendStars() | `GET /api/me` (баланс), `POST /api/nexus/exchange` (монеты за звёзды), `GET /api/leaderboard` |
| guides-tab | `guides[]` из data.ts | `GET /api/guides`, `GET /api/guides/{id}` |
| promo-tab | localStorage: promoCodes, redeemPromo() | `GET /api/promo/list`, `POST /api/promo/redeem`, `POST /api/promo/create` |
| top-bar | localStorage: stars, coins | из `GET /api/me` (баланс) |

**Критерий приёмки:**
- При открытии Mini App данные приходят с бэкенда (проверяется в Network DevTools).
- `lib/data.ts` остаётся как источник типов и статических констант (GAMES, GUIDES-структура),
  но не как источник данных о пользователе.
- `lib/store.tsx` перепроектирован: вместо localStorage — fetch + React state.

---

## R3 — Инициализация Telegram WebApp и передача initData

**Требование:** `window.Telegram.WebApp.ready()` вызывается при старте. `initData` передаётся
в каждый запрос через заголовок `X-Telegram-Init-Data`.

**Детали:**

`lib/api.ts` уже полностью реализован:
```typescript
export function getInitData(): string {
  if (typeof window === "undefined") return ""
  return window.Telegram?.WebApp?.initData || ""
}
// + каждый request() добавляет "X-Telegram-Init-Data": getInitData()
```

`app/layout.tsx` **не** вызывает `window.Telegram.WebApp.ready()` — нужно добавить.

**Что нужно:**
1. В `app/layout.tsx` добавить `<Script>` с `window.Telegram.WebApp.ready()` или вызвать
   `telegramReady()` из `api.ts` в корневом клиентском компоненте.
2. Все компоненты, вызывающие `api.*`, должны иметь директиву `"use client"`.
3. Нет SSR-фетчей к бэкенду — только клиентский рендеринг.

**Критерий приёмки:**
- В Telegram WebApp не видно белого экрана «загрузка» после открытия.
- Network: каждый запрос к `/api/*` содержит заголовок `X-Telegram-Init-Data`.
- При открытии в браузере (без Telegram) — graceful fallback, нет краша JS.

---

## R4 — Изображения из public/ корректно загружаются

**Требование:** Все изображения из ZIP (`public/`) присутствуют в `web-src/public/`
и корректно отдаются после сборки.

**Детали:**

Текущее состояние в `web-src/public/`:
```
ak47.png, apple-icon.png, case-blue.png, case-gold.png,
guide-br.png, guide-cs2.png, guide-moba.png, hero-arena.png,
icon*.png/svg, nexus-coin.png, placeholder*.png/jpg/svg,
premium-card.png, premium-reveal.png, premium-x4.png,
profile-cards.png
```

Отсутствуют (есть только в ZIP): `player-1.png, player-2.png, player-3.png, player-4.png`

Эти файлы используются в:
- `home-tab.tsx`: `p.avatar` (данные из `lib/data.ts`)
- После перехода на API: `user.avatar` из `GET /api/me` → `mini_app_profiles.avatar`

**Дополнительно:** компоненты ссылаются на `/nexus-coin.png` — файл присутствует ✅.
Компонент `donate-tab.tsx` использует `/nexus-coin.png` для монет — ✅.

Нужно проверить, есть ли пустые img-src в компонентах после перехода на реальные данные.
Если профиль пользователя не имеет аватара, показывать `/placeholder-user.jpg` (файл есть).

**Критерий приёмки:**
- `player-1..4.png` добавлены в `web-src/public/`.
- Ни одна картинка не возвращает 404 в production-сборке.
- `<img src="/nexus-coin.png" ...>` работает в `out/` (статический экспорт).

---

## R5 — Сборка и деплой: next build без ошибок, совместимость с Render

**Требование:** `npm run build` в `web-src/` завершается без ошибок. Dockerfile корректно
собирает статику и кладёт её в `webapp/static/`. Render поднимает сервис.

**Детали текущего Dockerfile:**
```dockerfile
# Build stage: Next.js static export
FROM node:20-alpine AS frontend
WORKDIR /app/web-src
RUN corepack enable
COPY web-src/package.json web-src/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web-src/ ./
RUN pnpm build  # → кладёт в web-src/out/

# Runtime stage
FROM python:3.11-slim
...
RUN rm -rf /app/webapp/static/* && cp -r /app/web-src/out/* /app/webapp/static/
CMD ["python", "main.py"]
```

`next.config.mjs` уже содержит `output: 'export'` — статический экспорт ✅.

**Потенциальные проблемы:**
1. `output: 'export'` несовместим с `next/image` без `images: { unoptimized: true }` —
   уже добавлено ✅.
2. `output: 'export'` несовместим с Server Components, которые читают серверные данные.
   Все компоненты должны быть клиентскими или рендерить только статику.
3. `NEXT_PUBLIC_API_BASE`: при статическом экспорте значение вшивается в бандл во время
   сборки. Если бэкенд отдаёт фронтенд сам с себя (Render), то `NEXT_PUBLIC_API_BASE=""`
   и все `/api/*` запросы уходят на тот же хост — верно ✅. Для локальной разработки
   нужен `NEXT_PUBLIC_API_BASE=http://localhost:8080`.
4. `@vercel/analytics` в `app/layout.tsx` — работает на Vercel, на Render просто не
   отправляет данные, ошибки нет ✅.

**Критерий приёмки:**
- `cd web-src && pnpm build` завершается с `Export successful`.
- `webapp/static/` содержит `index.html` и статические файлы.
- `GET /` отдаёт Mini App HTML через Python aiohttp.
- Render healthcheck `/health` возвращает `{"status": "ok"}`.

---

## R6 — Cases, Battlepass, Donate: реальная платёжная логика

**Требование:** Вкладки cases/battlepass/donate используют реальные API-эндпоинты и
реальную платёжную систему Telegram Stars (не заглушки).

**Детали:**

### Cases (кейсы)
Текущий `cases-tab.tsx`: кликает `openCase()` из store → `rollItem()` на клиенте → обновляет
localStorage.

Правильная схема:
1. `POST /api/nexus/cases/open` `{ case_id: "blue" | "gold" }` → бэкенд роллит предмет,
   списывает звёзды/ставит кулдаун, возвращает `{ item, last_open_at }`.
2. Анимация рулетки запускается на клиенте с заранее известным `winner` (вернул сервер).
3. Инвентарь: `GET /api/nexus/inventory`, продажа: `POST /api/nexus/inventory/sell`.

### Battlepass
Текущий `battlepass-tab.tsx`: кнопки меняют localStorage.

Правильная схема:
- Покупка: `POST /api/battlepass/buy` → проверяет баланс звёзд на сервере, атомарно списывает.
- Получение награды дня: `POST /api/battlepass/claim-next` → сервер проверяет кулдаун 24ч.
- Состояние: `GET /api/battlepass`.

⚠️ **Проблема согласования данных:** бэкенд хранит battelpass-прогресс в `user_battlepass`
с кулдауном по ISO-строкам. Фронтенд хранил это в localStorage с миллисекундными timestamps.
Нужно конвертировать.

### Donate
Текущий `donate-tab.tsx`:
- "Купить Stars" — кнопка `buy()` симулирует успех без реальной оплаты.
- "Купить монеты Nexus за Stars" — `spendStars()` только меняет localStorage.

Правильная схема:
- Telegram Stars — пользователь платит через `invoice_link` от Telegram Bot API.
  Бэкенд создаёт инвойс через `POST /api/pay/invoice`, возвращает `invoice_link`.
  Фронтенд открывает его через `window.Telegram.WebApp.openInvoice(link)`.
- Обмен Stars → монеты Nexus: `POST /api/nexus/exchange` `{ pack_id }` → атомарная
  операция на сервере.
- Leaderboard: `GET /api/leaderboard`.

**Критерий приёмки:**
- Открытие бесплатного кейса: `/api/nexus/cases/open` вызывается, предмет приходит с сервера.
- Кулдаун кейса: бэкенд возвращает `last_open_at`, фронтенд считает таймер от него.
- Покупка батл-пасса: списывает звёзды на сервере, не в localStorage.
- Кнопка "Поддержать/Купить Stars" открывает Telegram invoice или ведёт к боту.
- Обмен монет: `POST /api/nexus/exchange` вызывается при клике.
