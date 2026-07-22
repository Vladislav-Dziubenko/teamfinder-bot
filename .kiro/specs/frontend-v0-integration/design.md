# Frontend v0 Integration — Design

## Итоговая структура проекта

Никаких новых папок. Работаем только в `web-src/`. После интеграции:

```
teamfinder-bot/
├── web-src/                         ← единственный фронтенд
│   ├── app/
│   │   ├── globals.css              ← без изменений (Tailwind 4 + CSS vars)
│   │   ├── layout.tsx               ← + вызов telegramReady() через клиентский хук
│   │   └── page.tsx                 ← без изменений (рендерит <AppShell />)
│   ├── components/
│   │   └── miniapp/
│   │       ├── app-shell.tsx        ← + инициализация: useEffect → loadMe() при старте
│   │       ├── top-bar.tsx          ← читает баланс из NexusContext (данные с API)
│   │       ├── bottom-nav.tsx       ← без изменений (только UI)
│   │       ├── home-tab.tsx         ← заменить players из data.ts → данные из /api/search
│   │       ├── match-tab.tsx        ← players/teams из data.ts → /api/search, /api/teams
│   │       ├── profile-tab.tsx      ← кастомизация → /api/profile/customize + /api/me
│   │       ├── cases-tab.tsx        ← openCase/inventory → /api/nexus/cases/*
│   │       ├── battlepass-tab.tsx   ← состояние BP → /api/battlepass
│   │       ├── donate-tab.tsx       ← exchange/leaderboard → /api/nexus/exchange, /api/leaderboard
│   │       ├── guides-tab.tsx       ← guides из data.ts → /api/guides
│   │       ├── promo-tab.tsx        ← промокоды → /api/promo/*
│   │       ├── player-card.tsx      ← без изменений (только UI)
│   │       ├── team-card.tsx        ← без изменений (только UI)
│   │       └── contact-sheet.tsx    ← без изменений (только UI)
│   ├── lib/
│   │   ├── api.ts                   ← уже готов: X-Telegram-Init-Data на каждый запрос ✅
│   │   ├── store.tsx                ← ПЕРЕПИСЫВАЕТСЯ: localStorage → API + React state
│   │   ├── data.ts                  ← УРЕЗАЕТСЯ: убираем данные пользователя, оставляем
│   │   │                              типы, GAMES-константы, battlePassTiers (для UI),
│   │   │                              lootCases (для анимации рулетки)
│   │   ├── sfx.ts                   ← без изменений (Web Audio API, не зависит от данных)
│   │   └── utils.ts                 ← без изменений (cn() helper)
│   ├── public/
│   │   ├── player-1..4.png          ← ДОБАВИТЬ из ZIP
│   │   └── ... (остальное уже есть) ←
│   ├── next.config.mjs              ← без изменений (output:'export' уже настроен)
│   ├── package.json                 ← без изменений
│   └── tsconfig.json                ← без изменений
├── webapp/
│   ├── auth.py                      ← без изменений (валидация initData)
│   └── server.py                    ← без изменений (API уже реализован полностью)
├── Dockerfile                       ← без изменений (multi-stage: pnpm build → python)
└── render.yaml                      ← без изменений
```

**Удаляется:**
- `lib/store.tsx`: весь блок персистентного состояния в localStorage (STORAGE_KEY, loadState,
  PersistedState, NexusProvider с setS/hydration).
- `lib/data.ts`: экспорты `currentUser`, `players[]`, `teams[]`, `leaderboard[]`,
  `defaultPromoCodes[]` — они приходят с API.

**Остаётся неизменным в `lib/data.ts`:**
- Типы: `Game`, `Player`, `Team`, `Guide`, `StarPack`, `CaseItem`, `LootCase`, `BattlePassTier`, etc.
- `lootCases[]` — нужен для анимации рулетки (клиент крутит с известным `winner`)
- `battlePassTiers[]` — нужен для рендеринга UI трека батл-пасса
- `rarityMeta`, `games[]` — нужны для фильтров и отображения

---

## D1 — Новая архитектура lib/store.tsx

### Текущая архитектура (localStorage-based)

```
NexusProvider
  └── PersistedState (сохраняется в localStorage)
        ├── stars, coins, points
        ├── inventory[]
        ├── caseCooldown{}
        ├── bpXp, claimedTiers, bpPremium
        ├── promoCodes[]
        └── ... (всё состояние в одном объекте)
```

Проблема: при каждом открытии Mini App пользователь видит "свои" данные из localStorage
предыдущей сессии — не с бэкенда. Данные рассинхронизированы с сервером.

### Новая архитектура (API-based)

```
NexusProvider
  ├── ServerState (загружается с API один раз при старте)
  │     ├── user: { id, username, first_name }
  │     ├── currency: { coins, stars, points }
  │     ├── mini_profile: { avatar, nick, bio, deco, unlocked_decos }
  │     ├── inventory: InventoryItem[]
  │     ├── battlepass: { bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at }
  │     ├── streak: { streak_day, last_streak_at }
  │     ├── referral: { referral_code, invited_count, referral_earned_coins }
  │     ├── achievements: Achievement[]
  │     ├── case_cooldowns: Record<string, string|null>  ← ISO datetime
  │     └── premium_active: boolean
  │
  └── LocalUIState (только UI, не персистируется)
        ├── loading: boolean
        ├── error: string | null
        └── now: number (тикер для кулдаунов)
```

### Схема загрузки

```typescript
// app-shell.tsx (или NexusProvider) при монтировании:
useEffect(() => {
  api.get("/api/me").then(data => {
    setUser(data.user)
    setCurrency(data.currency)
    setMiniProfile(data.mini_profile)
    setInventory(data.inventory)
    setBattlepass(data.battlepass)
    setStreak(data.streak)
    setReferral(data.referral)
    setAchievements(data.achievements)
    setCaseCooldowns(data.case_cooldowns)
    setPremiumActive(data.premium_active)
    setLoading(false)
  }).catch(() => setError("Не удалось загрузить данные"))
}, [])
```

### Мутации (actions)

Каждый action = API-запрос + оптимистичное обновление UI:

```typescript
const openCase = async (caseId: string) => {
  // 1. Оптимистично не обновляем — ждём результат с сервера (рулетка должна показать реальный предмет)
  const res = await api.post("/api/nexus/cases/open", { case_id: caseId })
  // res = { item, last_open_at }
  // 2. Обновляем локальный state
  setCaseCooldowns(prev => ({ ...prev, [caseId]: res.last_open_at }))
  // 3. Обновить инвентарь и баланс (перезапросить или обновить локально)
  return res.item
}

const claimNextBpTier = async () => {
  const res = await api.post("/api/battlepass/claim-next")
  // res = { ok, tierLevel, state }
  setBattlepass(res.state)
  return res
}
```

### Кулдауны кейсов (ISO datetime → ms)

Бэкенд возвращает `case_cooldowns: { blue: "2026-01-01T12:00:00", gold: null }`.
Конвертация:

```typescript
function cooldownMs(isoStr: string | null): number {
  if (!isoStr) return 0
  const until = new Date(isoStr).getTime() + 24 * 3600 * 1000
  return Math.max(0, until - Date.now())
}
```

---

## D2 — Инициализация Telegram WebApp

### Текущее состояние

`app/layout.tsx` загружает скрипт Telegram через `next/script`:
```tsx
// ⚠️ Текущий layout.tsx НЕ содержит Script с telegram-web-app.js и не вызывает ready()
```

`lib/api.ts` содержит `telegramReady()` — вызывает `window.Telegram.WebApp.ready()`.

### Что добавить

**Вариант A — TelegramInit компонент (рекомендуется):**

```tsx
// components/telegram-init.tsx
"use client"
import { useEffect } from "react"
import { telegramReady } from "@/lib/api"

export function TelegramInit() {
  useEffect(() => {
    telegramReady()
  }, [])
  return null
}
```

Добавить в `app/layout.tsx`:
```tsx
import Script from "next/script"
import { TelegramInit } from "@/components/telegram-init"

// В <body>:
<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
<TelegramInit />
```

**Вариант B** — вызвать `telegramReady()` прямо в `app-shell.tsx` в первом `useEffect`.
Проще, но менее явно.

Рекомендуется Вариант A — явная точка инициализации, легко находить при дебаге.

### Graceful fallback без Telegram

При открытии в обычном браузере `window.Telegram?.WebApp?.initData === ""`.
API-запросы с пустым `X-Telegram-Init-Data` получат `401`.
Нужно отображать заглушку:

```tsx
// В app-shell.tsx, после попытки загрузки:
if (error === "unauthorized") {
  return <div>Открой в Telegram: @NexusTeammatesBot</div>
}
```

---

## D3 — Маппинг API → компоненты (детальный)

### home-tab.tsx

**Текущий код (мок):**
```tsx
const onlineNow = players.filter((p) => p.online)  // из lib/data.ts
<MiniStat value={currentUser.wins} />  // из lib/data.ts
```

**После интеграции:**
```tsx
const { searchResults, user, currency } = useNexus()
// searchResults приходят из GET /api/search (первые 3 без премиума)
// user.wins → не существует в API (бэкенд не хранит wins) → показывать инвентарь-count или убрать
```

⚠️ **Несоответствие данных:** бэкенд не хранит `wins`, `friends`, `level` в том же виде что
`lib/data.ts`. Маппинг:
- `currentUser.wins` → нет аналога в API. Заменить на количество предметов в инвентаре или убрать.
- `currentUser.friends` → нет. Заменить на `referral.invited_count` (приглашённых).
- `currentUser.level` → нет. Заменить на `battlepass.bp_xp / 100` (XP-уровень).
- `p.vibe` (% совместимости) → поле `score` из `/api/search` результатов.
- `p.online` → нет в API. Убрать фильтр `onlineNow`, показывать всех.

### match-tab.tsx

**Маппинг:**
- `players[]` → результаты `GET /api/search`. Тип `Player` из `lib/data.ts` и тип из API разные.
  Нужно создать API-тип `ApiProfile` и адаптер.
- `p.nick` → `profile.nickname`
- `p.rank` → `profile.rank`
- `p.vibe` → `result.score`
- `p.locked` → `result.contact === null` (бэкенд скрывает контакт без премиума)
- `p.tgUsername` → `result.contact` (возвращается только при премиуме или после разблокировки)
- `teams[]` → `GET /api/teams` результат
- `onJoinTeam()` → `POST /api/teams/{team_id}/apply`

**Поиск:** кнопка "Найти" → `GET /api/search` (бэкенд фильтрует по игре из профиля текущего
пользователя). Клиентская фильтрация по нику/роли остаётся поверх API-данных.

### cases-tab.tsx

Анимация рулетки (`CaseSpinner`) полностью клиентская — это OK. Но `winner` должен прийти
с сервера, а не быть результатом `rollItem()` на клиенте.

**Схема:**
1. Клик "Открыть" → `POST /api/nexus/cases/open { case_id }` → получаем `winner` (item key).
2. Находим полный объект предмета в `lootCases` по `item.key` → передаём в `CaseSpinner`.
3. Показываем анимацию → показываем `RevealModal`.
4. Обновляем инвентарь: перезапрашиваем `GET /api/nexus/inventory` или добавляем оптимистично.

**Продажа:** `POST /api/nexus/inventory/sell { item_id }` → бэкенд принимает `id` (integer
из БД), не `uid`. При загрузке инвентаря с API каждый item имеет `id` из таблицы
`user_inventory`. Сохраняем его в state.

### donate-tab.tsx

**"Пакеты Stars" (starPacks):** кнопка "Купить" должна создавать Telegram invoice.
Но `POST /api/pay/invoice` создаёт инвойсы только для конкретных product types
(`best_team`, `highlight`, `guide`, `pro_subscription`, `single_contact`, `premium_application`).

⚠️ **Проблема:** бэкенд не имеет эндпоинта для прямой покупки Stars. Stars — это
нативная валюта Telegram, которую пользователь покупает через Telegram (не через наш API).
Кнопки "Купить 75 Stars" в donate-tab фактически не имеют смысла как API-операция.

**Решение:** Секция "Пакеты Stars" в donate-tab меняется на:
- "Купить PRO-подписку за Stars" → `POST /api/pay/invoice { type: "pro_subscription" }` → открыть invoice.
- "Поднять анкету" → `POST /api/pay/invoice { type: "highlight" }` → открыть invoice.
- Раздел "Монеты Nexus за Stars" → `POST /api/nexus/exchange { pack_id }` ✅ (уже есть на бэке).

Инструкция для фронтенда по открытию инвойса:
```typescript
const { invoice_link } = await api.post("/api/pay/invoice", { type: "pro_subscription" })
window.Telegram.WebApp.openLink(invoice_link)
// или: window.open(invoice_link)
```

**Leaderboard:** `GET /api/leaderboard` → `{ leaderboard: [{ user_id, username, coins, stars, is_premium }] }`.
Маппинг: `e.nick → row.username || "Игрок"`, `e.avatar → /placeholder-user.jpg` (API не возвращает аватар).

---

## D4 — Обработка ошибок и состояния загрузки

### Loading state

При первом открытии Mini App нужно показать скелетон или лоадер, пока `GET /api/me`
не вернул данные:

```tsx
// В app-shell.tsx:
if (loading) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
```

### 401 Unauthorized

Происходит если:
- Открыт в браузере без Telegram (нет initData).
- `auth_date` старше 24 часов (пользователь не перезагружал Mini App сутки).

Показывать: "Открой в Telegram" с кнопкой-ссылкой на бота.

### Оптимистичные обновления vs. re-fetch

| Операция | Подход |
|----------|--------|
| openCase | Ждать ответ сервера (winner = сервер), потом анимировать |
| sellItem | Оптимистично удалить из UI, при ошибке — восстановить |
| claimNextBpTier | Ждать ответ, обновить `battlepass` state из `res.state` |
| redeemPromo | Оптимистично + показать toast, при ошибке — откатить |
| customize profile | Дебаунс 500ms → `POST`, оптимистично обновить nick/bio |
| claimDailyStreak | Ждать ответ (бэкенд проверяет 24ч) |

### Глобальный error handler

В `lib/api.ts` уже есть `throw new Error(data.error || ...)`.
В NexusProvider добавить `try/catch` вокруг всех мутаций с `onToast(err.message)`:

```typescript
const openCase = async (caseId: string) => {
  try {
    const res = await api.post("/api/nexus/cases/open", { case_id: caseId })
    return { ok: true, item: res.item }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сервера" }
  }
}
```

---

## D5 — Деплой: Dockerfile и render.yaml

### Dockerfile — анализ и оценка

Текущий Dockerfile корректен для данной задачи:

```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /app/web-src
RUN corepack enable
COPY web-src/package.json web-src/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web-src/ ./
RUN pnpm build  # output: 'export' → /app/web-src/out/

FROM python:3.11-slim
...
RUN rm -rf /app/webapp/static/* && cp -r /app/web-src/out/* /app/webapp/static/
CMD ["python", "main.py"]
```

**Нет необходимости менять.** Python aiohttp отдаёт статику через:
```python
app.router.add_static("/", STATIC_DIR, show_index=False)  # STATIC_DIR = webapp/static/
```

### Потенциальная проблема: pnpm-lock.yaml

Если `package.json` изменится (при обновлении зависимостей), нужно обновить и
`pnpm-lock.yaml`. Иначе `pnpm install --frozen-lockfile` упадёт.
При выполнении тасков: запускать `pnpm install` локально перед пушем.

### NEXT_PUBLIC_API_BASE в production

При сборке на Render `NEXT_PUBLIC_API_BASE` не задан → `""` → все запросы к `/api/*`
уходят на тот же хост (сам Python-сервер на Render). Это правильно ✅.

При локальной разработке нужно создать `web-src/.env.local`:
```
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

Добавить `web-src/.env.local` в `.gitignore` (уже есть там `web-src/.next/` и другие,
`.env` в корне — нужно проверить покрывает ли это `web-src/.env.local`).

---

## D6 — Риски и план митигации

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| `output: 'export'` + Server Components конфликт | Средняя | Блокирует сборку | Все компоненты с `"use client"` — уже так ✅ |
| API возвращает `null` полей (новый пользователь без профиля) | Высокая | NPE в компонентах | Добавить fallback-значения при деструктуризации |
| Рассинхронизация типов data.ts и API-ответа | Высокая | TypeScript ошибки | Создать отдельные API-типы в `lib/api-types.ts` |
| `pnpm-lock.yaml` устарел после изменений | Средняя | Dockerfile падает | Обновлять lock после каждого `pnpm install` |
| Анимация рулетки требует синхронного `winner` | Высокая | UX: нет анимации | API-вызов до запуска анимации, winner известен заранее |
| Бэкенд `/api/me` возвращает 401 при первом открытии | Средняя | Белый экран | Loading + error state в app-shell |
| `window.Telegram` не определён в Next.js dev | Средняя | Ошибки SSR | `typeof window !== "undefined"` проверки уже есть в api.ts ✅ |
| Loot case config на клиенте vs. сервере | Низкая | Несоответствие UI | `lootCases[]` в data.ts = CASES_CONFIG на сервере — синхронизированы вручную |

---

## Порядок реализации тасков

```
Task 1: Добавить player-1..4.png → проверить build
Task 2: Добавить TelegramInit + Script в layout.tsx
Task 3: Создать lib/api-types.ts — типы для API-ответов
Task 4: Переписать lib/store.tsx — API-based NexusProvider
Task 5: home-tab.tsx — подключить к API
Task 6: match-tab.tsx — подключить к API
Task 7: profile-tab.tsx — подключить к API
Task 8: cases-tab.tsx — подключить к API
Task 9: battlepass-tab.tsx — подключить к API
Task 10: donate-tab.tsx — подключить к API (invoice + exchange + leaderboard)
Task 11: guides-tab.tsx — подключить к API
Task 12: promo-tab.tsx — подключить к API
Task 13: Финальный npm run build + локальный тест
Task 14: Подготовка коммитов по группам
```
