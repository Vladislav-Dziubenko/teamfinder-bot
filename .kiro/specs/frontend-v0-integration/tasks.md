# Frontend v0 Integration — Tasks

Каждый таск выполняется по одному. После каждого — diff и объяснение.
Не трогать рабочий функционал без явного обоснования.
Финальный пуш — только после подтверждения, что `npm run build` проходит и Mini App
открывается в Telegram с данными с бэкенда.

---

## Task 1 — Добавить player-1..4.png + проверить сборку

**Приоритет:** Первый (блокирует визуальный дебаг)
**Файлы:** `web-src/public/`
**Коммит:** `assets: add player avatar images from v0 design`

### Чек-лист
- [ ] Скопировать `player-1.png`, `player-2.png`, `player-3.png`, `player-4.png`
      из ZIP (`C:\Users\Admin\Downloads\telegram-mini-game-extracted\public\`)
      в `web-src/public/`
- [ ] Убедиться, что все остальные `public/`-ассеты уже есть в web-src (проверено: да ✅)
- [ ] Запустить `pnpm build` в `web-src/` — убедиться, что сборка проходит без ошибок
- [ ] Проверить, что `out/` содержит `index.html` и папку `_next/`

**Ожидаемый diff:**
```
web-src/public/player-1.png  (новый файл)
web-src/public/player-2.png  (новый файл)
web-src/public/player-3.png  (новый файл)
web-src/public/player-4.png  (новый файл)
```

**Объяснение:** Аватары игроков присутствуют в ZIP но отсутствуют в web-src.
`home-tab.tsx` и `match-tab.tsx` ссылаются на `/player-1.png` и т.д. через
данные из `lib/data.ts`. После перехода на API аватары будут приходить из `mini_app_profiles.avatar`,
но дефолтный fallback `/placeholder-user.jpg` тоже есть.

---

## Task 2 — Добавить TelegramInit + Script в layout.tsx

**Приоритет:** Инфраструктурный (нужен до любых API-запросов)
**Файлы:** `web-src/app/layout.tsx`, `web-src/components/telegram-init.tsx` (новый)
**Коммит:** `feat(frontend): initialize Telegram WebApp SDK on mount`

### Чек-лист
- [ ] Создать `web-src/components/telegram-init.tsx`:
  ```tsx
  "use client"
  import { useEffect } from "react"
  import { telegramReady } from "@/lib/api"
  export function TelegramInit() {
    useEffect(() => { telegramReady() }, [])
    return null
  }
  ```
- [ ] В `web-src/app/layout.tsx` добавить `<Script>` для Telegram SDK:
  ```tsx
  import Script from "next/script"
  import { TelegramInit } from "@/components/telegram-init"
  // В <body> перед {children}:
  <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
  <TelegramInit />
  ```
- [ ] Убедиться, что `strategy="beforeInteractive"` — SDK доступен до рендера компонентов
- [ ] Проверить: `pnpm build` без ошибок

**Ожидаемый diff:**
```diff
+ web-src/components/telegram-init.tsx  (новый)

  // app/layout.tsx
+ import Script from "next/script"
+ import { TelegramInit } from "@/components/telegram-init"
  ...
  <body ...>
+   <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
+   <TelegramInit />
    {children}
  </body>
```

**Объяснение:** Без `window.Telegram.WebApp.ready()` Telegram продолжает показывать
загрузочный экран поверх Mini App. `strategy="beforeInteractive"` гарантирует, что
SDK загружен до первого рендера React.

---

## Task 3 — Создать lib/api-types.ts

**Приоритет:** Инфраструктурный (нужен до переписывания store и компонентов)
**Файлы:** `web-src/lib/api-types.ts` (новый)
**Коммит:** `feat(frontend): add TypeScript types for backend API responses`

### Чек-лист
- [ ] Создать `web-src/lib/api-types.ts` со следующими типами (по форме API-ответов):

```typescript
// Ответ GET /api/me
export type ApiUser = { id: number; username: string; first_name: string }
export type ApiCurrency = { coins: number; stars: number; points: number }
export type ApiMiniProfile = {
  avatar: string | null; nick: string | null; bio: string | null
  deco: string; unlocked_decos: string[]
}
export type ApiInventoryItem = {
  id: number; item_key: string; item_name: string
  item_rarity: "common"|"rare"|"epic"|"premium"
  sell_price: number; grants_premium: boolean; acquired_at: string
}
export type ApiBattlepass = {
  bp_premium: boolean; bp_xp: number; claimed_tiers: string[]
  claimed_count: number; last_claim_at: string | null
}
export type ApiStreak = { streak_day: number; last_streak_at: string | null }
export type ApiReferral = {
  referral_code: string; invited_count: number
  referral_earned_coins: number
}
export type ApiAchievement = {
  achievement_id: string; claimed: boolean; claimed_at: string | null
}
export type ApiMeResponse = {
  user: ApiUser; currency: ApiCurrency; mini_profile: ApiMiniProfile
  inventory: ApiInventoryItem[]; battlepass: ApiBattlepass
  streak: ApiStreak; referral: ApiReferral; achievements: ApiAchievement[]
  case_cooldowns: Record<string, string | null>; premium_active: boolean
}

// Ответ GET /api/search
export type ApiSearchResult = {
  id: number; user_id: number; nickname: string; rank: string; role: string
  playtime: string; region: string; score: number; contact: string | null
}

// Ответ GET /api/teams
export type ApiTeam = {
  id: number; captain_id: number; game: string; name: string
  description: string; max_players: number; created_at: string
}

// Ответ GET /api/guides
export type ApiGuide = {
  id: string; game: string; title: string
  type: "free"|"paid"; stars: number; unlocked: boolean
  text?: string; preview?: string; video_url?: string | null
}

// Ответ GET /api/leaderboard
export type ApiLeaderEntry = {
  user_id: number; username: string; first_name: string
  coins: number; stars: number; is_premium: boolean
}

// Ответ POST /api/nexus/cases/open
export type ApiCaseOpenResult = {
  item: { key: string; name: string; rarity: string
          image?: string; icon?: string; sell: number; grantsPremium?: boolean }
  last_open_at: string
}

// Ответ GET /api/nexus/cases
export type ApiCaseCooldowns = { cases: Record<string, unknown>; cooldowns: Record<string, string|null> }

// Ответ GET /api/promo/list
export type ApiPromoCode = {
  code: string; reward: { coins: number; stars: number; xp?: number }
  maxUses: number; uses: number; createdByUser: boolean
}
```

- [ ] Убедиться, что `pnpm build` проходит с новым файлом

**Объяснение:** Явные типы для API-ответов предотвращают TypeScript-ошибки при работе с
данными от сервера. Это отдельный файл — не смешивать с UI-типами из `lib/data.ts`.

---

## Task 4 — Переписать lib/store.tsx: localStorage → API

**Приоритет:** Критический (все компоненты зависят от store)
**Файлы:** `web-src/lib/store.tsx`
**Коммит:** `feat(frontend): replace localStorage store with API-backed NexusProvider`

### Чек-лист
- [ ] Удалить весь блок `PersistedState`, `loadState()`, `defaultState()`, `STORAGE_KEY`
- [ ] Удалить импорты `currentUser`, `defaultPromoCodes` из `lib/data.ts`
- [ ] Добавить импорт типов из `lib/api-types.ts`
- [ ] Новый state NexusProvider:
  ```typescript
  const [meData, setMeData] = useState<ApiMeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())  // тикер кулдаунов
  ```
- [ ] `useEffect` при монтировании: `api.get("/api/me").then(setMeData).finally(() => setLoading(false))`
- [ ] Вычисляемые поля из `meData`:
  - `bpLevel` из `meData.battlepass.claimed_count`
  - `caseCooldownMs(caseId)` — конвертация ISO → ms (см. design.md D1)
  - `bpNextClaimIn` из `meData.battlepass.last_claim_at`
- [ ] Заменить все мутации на API-вызовы + обновление `meData`:
  - `openCase(caseId)` → `api.post("/api/nexus/cases/open", { case_id })`
  - `sellItem(itemId)` → `api.post("/api/nexus/inventory/sell", { item_id: itemId })`
  - `buyBattlePass()` → `api.post("/api/battlepass/buy")`
  - `claimNextBpTier()` → `api.post("/api/battlepass/claim-next")`
  - `redeemPromo(code)` → `api.post("/api/promo/redeem", { code })`
  - `createPromo(...)` → `api.post("/api/promo/create", { code, reward, max_uses })`
  - `claimDailyStreak()` → `api.post("/api/streak/claim")`
  - `claimAchievement(id, pts, coins)` → `api.post("/api/achievements/claim", { achievement_id: id, points: pts, coins })`
  - `saveProfile(data)` → `api.post("/api/profile/customize", data)`
  - `adjustCurrency(stars)` → `api.post("/api/nexus/spend-stars", { amount: stars })`
- [ ] Экспортировать `loading` и `error` из контекста
- [ ] Убедиться, что интерфейс `Nexus` типа контекста обновлён — нет старых полей из `PersistedState`
- [ ] `pnpm build` без ошибок (TypeScript может ругаться на компоненты, использующие старые поля — это нормально, исправляется в следующих тасках)

**Объяснение:** Это центральный таск. После него компоненты начнут обращаться к API.
До завершения Tasks 5–12 некоторые компоненты будут ломаться на TypeScript — это ожидаемо.
Сборка включает `ignoreBuildErrors: true` в `next.config.mjs`, поэтому `pnpm build` пройдёт.

---

## Task 5 — home-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/home-tab.tsx`
**Коммит:** `feat(frontend): connect home-tab to live backend data`

### Чек-лист
- [ ] Заменить `players` из `lib/data.ts` на `searchResults` из `useNexus()` (тип `ApiSearchResult[]`)
- [ ] Заменить `currentUser.wins/friends/level` на реальные данные:
  - `wins` → `meData.inventory.length` (количество предметов, или убрать блок)
  - `friends` → `meData.referral.invited_count`
  - `level` → `Math.floor(meData.battlepass.bp_xp / 100)`
- [ ] `onlineNow` — убрать фильтр по `p.online` (API не возвращает online-статус);
      показывать первые 4 результата поиска как "Недавно искали тиммейта"
- [ ] Счётчик "X игроков в поиске" — заменить на статическое число или убрать
      (API не отдаёт глобальную онлайн-статистику)
- [ ] Аватары игроков: `result.user_id` → аватар недоступен из `/api/search`.
      Использовать `/placeholder-user.jpg` как дефолт для всех карточек поиска
- [ ] Добавить `useEffect` для загрузки результатов поиска при монтировании:
      `api.get("/api/search").then(d => setSearchResults(d.results))`
- [ ] Показывать скелетон если `loading === true`

**Diff (ключевые изменения):**
```diff
- import { players, currentUser } from "@/lib/data"
+ import { useNexus } from "@/lib/store"
  ...
- const onlineNow = players.filter((p) => p.online)
+ const { meData, searchResults, loading } = useNexus()
+ const recentPlayers = searchResults.slice(0, 4)
  ...
- <MiniStat value={currentUser.wins} label="Побед" />
+ <MiniStat value={meData?.inventory?.length ?? 0} label="Предметов" />
- <MiniStat value={currentUser.friends} label="Тиммейтов" />
+ <MiniStat value={meData?.referral?.invited_count ?? 0} label="Приглашено" />
```

---

## Task 6 — match-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/match-tab.tsx`
**Коммит:** `feat(frontend): connect match-tab to live search and teams API`

### Чек-лист
- [ ] Заменить `players`, `teams`, `games` из `lib/data.ts` на данные с API:
  - `players` → `useState<ApiSearchResult[]>([])`, загружать через `api.get("/api/search")`
  - `teams` → `useState<ApiTeam[]>([])`, загружать через `api.get("/api/teams")`
  - `games` — оставить из `lib/data.ts` (статические константы для фильтров)
- [ ] Кнопка "Найти" → вызывать `api.get("/api/search")` (бэкенд фильтрует по игре профиля,
      клиентская фильтрация по nick/role поверх результатов — оставить)
- [ ] `p.locked` → `result.contact === null && !result.nickname.startsWith("🔒")` для
      непремиум результатов. Бэкенд возвращает `nickname: "🔒 Скрыто"` без премиума.
- [ ] `onConnect(player)` — адаптировать `ContactSheet` под тип `ApiSearchResult`
      (или создать адаптер `searchResultToPlayer()`)
- [ ] `onJoinTeam(team)` → `api.post("/api/teams/${team.id}/apply", { message: "" })`
      с toast-уведомлением
- [ ] `freeSearchesLeft` — убрать (бэкенд управляет лимитами через премиум-статус,
      не через счётчик на фронтенде). Вместо этого: если результаты обрезаны (≤3 и нет
      премиума) — показывать paywall с кнопкой "PRO за X Stars"
- [ ] Загрузить команды при переключении на вкладку "Команды": `api.get("/api/teams")`

**Ключевое изменение (`freeSearchesLeft`):**
```diff
- const { freeSearchesLeft, useFreeSearch, spendStars, unlockPlayer } = useNexus()
+ const { meData } = useNexus()
+ const isPremium = meData?.premium_active ?? false
  ...
- if (!extended) { const ok = useFreeSearch(); if (!ok) { setNotice("..."); return } }
+ // бэкенд сам ограничивает результаты до 3 без премиума
```

---

## Task 7 — profile-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/profile-tab.tsx`
**Коммит:** `feat(frontend): connect profile-tab to API (customize, streak, achievements)`

### Чек-лист
- [ ] Заменить `currentUser`, `achievements` из `lib/data.ts` на данные из `useNexus()`:
  - `nick` → `meData.mini_profile.nick ?? ""`
  - `bio` → `meData.mini_profile.bio ?? ""`
  - `deco` → `meData.mini_profile.deco ?? "orange"`
  - `unlockedDecos` → `meData.mini_profile.unlocked_decos`
  - `avatar` → `meData.mini_profile.avatar`
  - `coins/stars/points` → `meData.currency.*`
  - `premiumActive` → `meData.premium_active`
- [ ] Кнопка "Сохранить анкету" → `api.post("/api/profile/customize", { nick, bio, deco })`
      + обновить `meData.mini_profile` в контексте
- [ ] Выбор `deco` → `api.post("/api/profile/customize", { deco: selectedDeco })`
- [ ] Загрузка аватара → base64 → `api.post("/api/profile/customize", { avatar: dataUrl })`
      (бэкенд принимает avatar как TEXT)
- [ ] `claimDailyStreak()` → из `useNexus()` (уже API-based после Task 4)
- [ ] `claimAchievement(id, pts, coins)` → из `useNexus()`
- [ ] Достижения: тип `ApiAchievement` не содержит `title/desc/points/coins` —
      они в `lib/data.ts`. Нужно смержить: UI-данные из `achData` в `lib/data.ts`,
      claimed-статус из `meData.achievements`.
      ```typescript
      const mergedAchievements = achData.map(a => ({
        ...a,
        claimed: meData?.achievements.some(x => x.achievement_id === a.id && x.claimed) ?? false
      }))
      ```
- [ ] `streakDay` и `lastStreakAt` → из `meData.streak`
- [ ] Реферальный код → `meData.referral.referral_code`
- [ ] Кнопка "Поделиться в Telegram" → `window.Telegram?.WebApp?.openTelegramLink(...)`
- [ ] `currentUser.level` → `Math.floor(meData.battlepass.bp_xp / 100)`
- [ ] `currentUser.xp` (% до следующего уровня) →
      `(meData.battlepass.bp_xp % 100)` (остаток XP как % от 100)

---

## Task 8 — cases-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/cases-tab.tsx`
**Коммит:** `feat(frontend): connect cases-tab to live case/inventory API`

### Чек-лист
- [ ] Убрать `openCase` из `useNexus()` (старый localStorage-вариант) — заменить на:
  ```typescript
  async function handleOpen(c: LootCase) {
    if (spin) return
    setSpinLoading(true)
    try {
      const res = await api.post<ApiCaseOpenResult>("/api/nexus/cases/open", { case_id: c.id })
      // res.item.key → найти полный объект в lootCases для анимации
      const fullItem = c.items.find(i => i.key === res.item.key) ?? {
        ...res.item, weight: 0, sell: res.item.sell ?? 0
      }
      setSpin({ box: c, winner: fullItem })
      // обновить кулдаун
      refreshMe()
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Ошибка открытия кейса")
    } finally {
      setSpinLoading(false)
    }
  }
  ```
- [ ] `refreshMe()` — добавить в контекст: `api.get("/api/me").then(setMeData)`
- [ ] Инвентарь: убрать `inventory` из `useNexus()` localStorage, читать из
      `meData.inventory` (тип `ApiInventoryItem[]`)
- [ ] Адаптер `ApiInventoryItem → InventoryItem` для совместимости с UI:
  ```typescript
  function adaptInventoryItem(i: ApiInventoryItem): InventoryItem {
    return { uid: String(i.id), key: i.item_key, name: i.item_name,
             rarity: i.item_rarity, sell: i.sell_price, desc: "",
             weight: 0, grantsPremium: i.grants_premium }
  }
  ```
- [ ] Продажа `sellItem(item.uid)` → `api.post("/api/nexus/inventory/sell", { item_id: Number(item.uid) })`
      + оптимистично удалить предмет из UI, при ошибке восстановить
- [ ] Магазин монет `buyFromShop` → `api.post("/api/nexus/shop/buy", { item_key: shopItem.key })`
- [ ] `caseReadyIn(caseId)` — вычислять из `meData.case_cooldowns[caseId]`:
  ```typescript
  function caseReadyIn(caseId: string): number {
    const iso = meData?.case_cooldowns[caseId]
    if (!iso) return 0
    return Math.max(0, new Date(iso).getTime() + 24*3600*1000 - Date.now())
  }
  ```
- [ ] Убедиться, что `CaseSpinner` получает `winner` с сервера (не `rollItem()` на клиенте)

---

## Task 9 — battlepass-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/battlepass-tab.tsx`
**Коммит:** `feat(frontend): connect battlepass-tab to live API`

### Чек-лист
- [ ] Заменить `bpPremium`, `bpClaimedCount`, `bpCanClaim`, `bpNextClaimIn` из
      localStorage-store на данные из `meData.battlepass`:
  ```typescript
  const { meData } = useNexus()
  const bp = meData?.battlepass
  const bpPremium = bp?.bp_premium ?? false
  const bpClaimedCount = bp?.claimed_count ?? 0
  const bpNextClaimIn = bp?.last_claim_at
    ? Math.max(0, new Date(bp.last_claim_at).getTime() + 24*3600*1000 - Date.now())
    : 0
  const bpCanClaim = bpClaimedCount < battlePassTiers.length && bpNextClaimIn === 0
  ```
- [ ] `buyBattlePass()` → из `useNexus()` (уже API после Task 4) — проверить
- [ ] `claimNextBpTier()` → из `useNexus()` (API) — проверить
- [ ] `stars` для проверки баланса → `meData.currency.stars`
- [ ] Отображение прогресса: `claimed / total` — верно, данные из API
- [ ] Тикер для обратного отсчёта: `now` из `useNexus()` (интервал 1000ms)
- [ ] После `claimNextBpTier()`: обновить `meData` через `refreshMe()` (переспросить `/api/me`)
- [ ] Убедиться, что `battlePassTiers` для UI-рендера берутся из `lib/data.ts` (статика) —
      они идентичны `BATTLE_PASS_TIERS` на бэкенде

---

## Task 10 — donate-tab.tsx: подключить к API (invoice + exchange + leaderboard)

**Файлы:** `web-src/components/miniapp/donate-tab.tsx`
**Коммит:** `feat(frontend): connect donate-tab to real payment and leaderboard API`

### Чек-лист

**Leaderboard:**
- [ ] Заменить `leaderboard` из `lib/data.ts` на `useState<ApiLeaderEntry[]>([])`
- [ ] `useEffect` → `api.get("/api/leaderboard").then(d => setLeaderboard(d.leaderboard))`
- [ ] Адаптер: `e.username || e.first_name || "Игрок"` → в место `e.nick`
- [ ] Аватар: `/placeholder-user.jpg` (API не возвращает аватары в лидерборде)
- [ ] `e.premium` → `e.is_premium`

**Монеты Nexus (coinPacks — обмен Stars → монеты):**
- [ ] Убрать `spendStars(pack.stars)` + `addCoins(pack.coins)` из localStorage-store
- [ ] Заменить на `api.post("/api/nexus/exchange", { pack_id: pack.id })`
- [ ] После успеха: `refreshMe()` для обновления баланса
- [ ] `pack.id` должен совпадать с `id` в `COIN_PACKS` на бэкенде (`data/games.py`).
      Проверить соответствие `coinPacks` в `donate-tab.tsx` и бэкенда.
      ⚠️ Если отличаются — скорректировать `pack.id` в компоненте.

**Пакеты Stars (starPacks — реальная оплата через Telegram):**
- [ ] Убрать фейковую `buy()` функцию (она симулировала успех без оплаты)
- [ ] Кнопка "Купить [N] Stars" → `api.post("/api/pay/invoice", { type: "pro_subscription" })`
      → `window.Telegram?.WebApp?.openLink(invoice_link)` или `openTelegramLink`
- [ ] Секцию starPacks переработать в конкретные продукты:
  - "PRO-подписка (30 дней)" → `type: "pro_subscription"`
  - "Поднять анкету в топ" → `type: "highlight"`
  - Остальные starPacks из `lib/data.ts` убрать (они не имеют аналогов в API)
- [ ] "Отправить звёзды тиммейту" — убрать кнопки (нет API для p2p Stars)
      или заменить на "Открыть чат с ботом" → `window.Telegram.WebApp.openTelegramLink`

**Текущий баланс stars:**
- [ ] `stars` → `meData?.currency.stars ?? 0`
- [ ] Убрать `spendStars` из destructuring

---

## Task 11 — guides-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/guides-tab.tsx`
**Коммит:** `feat(frontend): connect guides-tab to live API`

### Чек-лист
- [ ] Прочитать `web-src/components/miniapp/guides-tab.tsx` — понять текущую структуру
- [ ] Заменить `guides` из `lib/data.ts` на `useState<ApiGuide[]>([])`
- [ ] `useEffect` → `api.get("/api/guides").then(d => setGuides(d.guides))`
- [ ] При клике на гайд → `api.get("/api/guides/${guide.id}")` → получить полный текст
      и открыть детальный view (если он есть в компоненте) или показать `guide.preview`
- [ ] Фильтр по игре: передавать `?game=cs2` → `api.get("/api/guides?game=cs2")`
- [ ] Тип `Guide` из `lib/data.ts` vs `ApiGuide` — адаптировать поля:
  - `g.type` ("free"|"paid") → UI отображает иконку замка если `!g.unlocked`
  - `g.cover` → `g.game` + map на `/guide-cs2.png`, `/guide-moba.png`, `/guide-br.png`
    (у бэкенда нет поля cover — используем статический маппинг по game)
- [ ] `g.stars > 0 && !g.unlocked` → кнопка "Купить за [stars] Stars" →
      `api.post("/api/pay/invoice", { type: "guide", guide_id: g.id })`

---

## Task 12 — promo-tab.tsx: подключить к API

**Файлы:** `web-src/components/miniapp/promo-tab.tsx`
**Коммит:** `feat(frontend): connect promo-tab to live promo API`

### Чек-лист
- [ ] Заменить `promoCodes`, `redeemedCodes` из localStorage-store на API:
  - Загрузка: `useState<{codes: ApiPromoCode[], redeemed: string[]}>`, загружать через
    `api.get("/api/promo/list")` при монтировании
- [ ] `redeemPromo(code)` → из `useNexus()` (уже API после Task 4)
      + после успеха перезагрузить список: `api.get("/api/promo/list")`
- [ ] `createPromo(code, reward, maxUses)` → из `useNexus()` (API после Task 4)
      + после успеха перезагрузить список
- [ ] Показывать кнопку "Забрать" серой если `redeemedCodes.includes(c.code)`
- [ ] Лимит создания промокодов (5 в день) — бэкенд вернёт ошибку, показать через toast
- [ ] Минимальная длина кода: 3 символа (проверка есть в компоненте, оставить ✅)
- [ ] `simulateInvite()` — убрать полностью (был только для демонстрации)

---

## Task 13 — Финальная сборка и локальный тест

**Коммит:** нет (проверка, не изменения)

### Чек-лист

**Сборка:**
- [ ] `cd web-src && pnpm build` — убедиться в `Export successful`
- [ ] Проверить `web-src/out/index.html` существует
- [ ] Проверить `web-src/out/_next/static/` содержит JS/CSS бандлы
- [ ] Запустить Python-сервер: `python main.py` (бот + aiohttp)
- [ ] Открыть `http://localhost:8080/` в браузере — должен отдать HTML Mini App

**Проверка API (без Telegram):**
- [ ] DevTools → Network: убедиться, что браузер делает запросы к `/api/me`
- [ ] Ответ `/api/me` — `401 unauthorized` (нет initData) — это норма в браузере
- [ ] Страница показывает fallback "Открой в Telegram" или лоадер (не белый экран)

**Проверка в Telegram:**
- [ ] Открыть `@BotFather` → задать Mini App URL на ngrok/Render URL
- [ ] Открыть Mini App через `/start` → проверить Network в Telegram DevTools
- [ ] Каждый запрос содержит заголовок `X-Telegram-Init-Data`
- [ ] `GET /api/me` → `200 OK` с реальными данными пользователя
- [ ] Вкладка Home: отображает данные пользователя (nick, currency)
- [ ] Вкладка Cases: кейс открывается, winner приходит с сервера
- [ ] Вкладка Battlepass: состояние загружается с сервера
- [ ] Вкладка Donate: leaderboard загружен, exchange работает
- [ ] Вкладка Promo: список кодов загружен, redeem работает

**Проверка Dockerfile:**
- [ ] `docker build -t teamfinder-test .` (если Docker установлен) — убедиться, что
      multi-stage build собирается
- [ ] Или проверить вручную: пути в Dockerfile совпадают со структурой проекта

---

## Task 14 — Подготовка коммитов и отчёт

**Коммит:** нет (только git-операции)

### Чек-лист
- [ ] `git checkout -b frontend-v0-integration`
- [ ] Просмотреть `git diff` — убедиться, что не попали лишние файлы
- [ ] Создать коммиты по логическим группам:

**Group A — Assets & Init:**
```
assets: add player avatar images from v0 design                    (Task 1)
feat(frontend): initialize Telegram WebApp SDK on mount            (Task 2)
```

**Group B — Infrastructure:**
```
feat(frontend): add TypeScript types for backend API responses     (Task 3)
feat(frontend): replace localStorage store with API-backed context (Task 4)
```

**Group C — Tabs (по одному коммиту на таск):**
```
feat(frontend): connect home-tab to live backend data              (Task 5)
feat(frontend): connect match-tab to live search and teams API     (Task 6)
feat(frontend): connect profile-tab to API                         (Task 7)
feat(frontend): connect cases-tab to live case/inventory API       (Task 8)
feat(frontend): connect battlepass-tab to live API                 (Task 9)
feat(frontend): connect donate-tab to real payment and leaderboard (Task 10)
feat(frontend): connect guides-tab to live API                     (Task 11)
feat(frontend): connect promo-tab to live promo API                (Task 12)
```

- [ ] Показать `git log --oneline` для ревью
- [ ] **НЕ пушить** до подтверждения

---

## Итоговый отчёт (заполняется после Task 13)

| # | Требование | Статус | Примечания |
|---|-----------|--------|-----------|
| R1 | Стратегия: web-src на месте | ✅ | Нет web-v0/, нет дублирования |
| R2 | Моки → реальный API | 🔲 | |
| R3 | initData в каждом запросе | 🔲 | |
| R4 | Изображения корректно грузятся | 🔲 | |
| R5 | `next build` без ошибок | 🔲 | |
| R6 | Cases/Battlepass/Donate через API | 🔲 | |

**Файлы, изменённые в рамках спеки:**

```
web-src/public/player-{1-4}.png          (добавлены)
web-src/app/layout.tsx                   (Script + TelegramInit)
web-src/components/telegram-init.tsx     (новый)
web-src/lib/api-types.ts                 (новый)
web-src/lib/store.tsx                    (переписан)
web-src/components/miniapp/home-tab.tsx
web-src/components/miniapp/match-tab.tsx
web-src/components/miniapp/profile-tab.tsx
web-src/components/miniapp/cases-tab.tsx
web-src/components/miniapp/battlepass-tab.tsx
web-src/components/miniapp/donate-tab.tsx
web-src/components/miniapp/guides-tab.tsx
web-src/components/miniapp/promo-tab.tsx
```

**Не изменены (проверено):**
```
web-src/lib/api.ts           (уже готов ✅)
web-src/lib/sfx.ts           (Web Audio, не зависит от данных ✅)
web-src/lib/utils.ts         (cn() helper ✅)
web-src/next.config.mjs      (output:'export' уже настроен ✅)
web-src/package.json         (зависимости не менялись ✅)
Dockerfile                   (multi-stage build корректен ✅)
render.yaml                  (конфигурация корректна ✅)
webapp/server.py             (API готов ✅)
webapp/auth.py               (валидация готова — см. production-readiness-audit ✅)
```
