# ROADMAP: 0 → 20-50k$/мес — TeamFinder Nexus TeamHub
> Фокус: не слить 50-100€ теста. Масштаб только из выручки.

## 0. Где сейчас
- Прод `teamfinder-bot-theta.vercel.app` + `Supabase 6543 pgbouncer` (`database.py:120`, `api/index.py`). Старый Neon `nameless-wave` locked 423 — миграция после дампа.
- Монетизация: `gold 75 ⭐` (`webapp/server.py:1404`), `jet 1200 🪙`, `premium/battlepass 250 ⭐` (`store.tsx:433`). `top-bar.tsx:52-63` `coins`/`stars` путаются в `leaderboard:2977 ORDER BY coins`.
- Рост: `daily_streak:95` (`10→200 🪙`), `referral_ladder:114`, `PROMO` `handle_promo_create:2751` есть, но `CAC/LTV` не меряется.

## Фаза 0 — Стабилизация (неделя 1, 0€) — MUST перед заливом
| Задача | Файл:строка | KPI |
|---|---|---|
| Починить `freeGoldPays/betaPays` уже `5f1d5be` | `server.py:1562` | `openCase` 400 `not enough beta cases` → 0 |
| Разделить топы: `leaderboard` по `stars`, отдельный по `coins/points` | `database.py:2977`, `server.py:3794` | CTR топа +15% |
| Включить `app.freeze()` для middleware — уже `f2b5d37` | `api/index.py` | `401` вместо `500` |
| Добавить ивент `purchase` (stars/coins/timestamp) | `lib/telegram-analytics.ts:50`, `cases-tab.tsx:200` `analytics.caseOpen` | `CR` измерим |

## Фаза 1 — 0 → 1к$ (мес 1-2, бюджет 100€ теста)
| Канал | Бюджет | KPI | Что мерить |
|---|---|---|---|
| 3× TG микро-канала CS2/Roblox/WoT 5-15k | 15€×3=45€ | `CTR>4%`, `CAC<1.2€` | `t.me/teamfinder_bot?start=ref_CODE` + `redeemedCodes` |
| 2× TikTok Shorts (юзер-крео, не баннер) | 30€ | `CPV<0.02€`, `D1>35%` | `caseSpinner` шаринг `shareDrop:998` |
| 5× Discord серверов ручной посев | 0€ | `5 инвайтов` | `discord_invite` |
| Резерв розыгрыш 100 ⭐ | 25€ | `+15% D7` | `daily_streak` `streakReady` |

Цель: `300-600` кликов → `80-150` стартов → `15-30` профилей → `2-5` оплат (3-7€). Ищем 1 канал с `CAC<1€`. Остальное — стоп.

**Монетизация 0→1к:** Бандл `250 ⭐` как подписка, не `75 ⭐` разово. `ARPPU` цель `1.5$ → 4$`. `store.tsx:860` `beta_free` уже, добавь `coins→stars` своп `10% fee`.

## Фаза 2 — 1к → 5к$ (мес 3-6, реинвест 100% выручки)
- Реинвест всей выручки в победивший канал. `CAC 1€ × 1000 платящих = 1000€` оборота.
- Ускорить: `server.py:4314` `CACHE_TTL` + `DB_POOL_MAX_SIZE 2→10` (`database.py:2300`), `next/image` для `case-*.webp`, `SWR` 30с на `store.tsx:843`.
- Виралка: шаринг `Mini Boss #token/20` (`cases-tab:1118`) с реф-кодом на картинке — каждый джекпот → пост.
- Метрика: `D7 >12%`, `LTV 6$`, `CAC/LTV <0.3`

## Фаза 3 — 5к → 20к$ (мес 6-12, команда)
- Нужен пул `15k DAU` (`730 покупок/день × 1.3$ = 28к gross → 20к net`). Это `100-150k` установок/год.
- Каналы: масштаб TikTok `500к просм/мес` + бренды (кейсы от партнеров, `market fee 10%` `market-tab:283`).
- Команда: модератор (`ban_middleware:462`), контент `GUIDES`, антифрод `IP_RATE_LIMIT:3400`.
- Диверсификация: `cases` 40% + `premium` 30% + `market` 15% + `adsgram 15 просмотров→20⭐` 15%.

## Что делать завтра
1. Сбрось тестовые `50010 ⭐` перед заливом (девальвация).
2. Дай 3 промо `PROMO10` на 1 голд.
3. Я залью `posthog` и разделю топы — ты заливаешь `45€` тест.

> 50к/мес — топ-1% TG Mini Apps, требует 12-24 мес и внешку. 20к — реально как студия с реинвестом, не с 50€ за неделю.
