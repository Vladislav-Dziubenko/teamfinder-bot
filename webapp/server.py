"""HTTP-сервер для Telegram Mini App (WebApp), которое открывается по /start.

Отдаёт статику (webapp/static) и REST API, которым пользуется фронтенд
(webapp/static/app.js). Любой запрос к /api/* обязан нести заголовок
X-Telegram-Init-Data — это initData из window.Telegram.WebApp, подпись
которого проверяется в auth.py.

Когда сделаешь свой дизайн через другой ИИ — просто замени файлы в
webapp/static/ (index.html/style.css) своими, сохранив вызовы fetch('/api/...')
из app.js (или перенеси эту логику в свой JS). Бэкенд трогать не обязательно.
"""

import gzip
import html
import json
import logging
import random
import re
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from time import time

from urllib.parse import urlencode, quote

from aiohttp import web, ClientSession, ClientTimeout

from config import Settings
from data.games import (
    GAMES, LOOKING_FOR, PLAYTIME,
    BATTLE_PASS_TIERS, BATTLE_PASS_XP_PER_LEVEL, BATTLE_PASS_PRICE_STARS,
    DAILY_STREAK_REWARDS, REFERRAL_REWARD, REFERRAL_LADDER, COIN_PACKS, DEFAULT_PROMO_CODES,
)
from data.guides import GUIDES
from database import Database
from services.matching import find_matches, score_match
from webapp.auth import validate_init_data
from webapp.discord import (build_auth_url, exchange_code, fetch_discord_user,
                            fetch_discord_connections, revoke_token, _make_state, _verify_state)
from webapp.redis_client import (
    init_redis, close_redis,
    rate_limit_check, rate_limit_checks,
    counter_incr,
    cache_get, cache_set, cache_delete_pattern,
)

STATIC_DIR = Path(__file__).parent / "static"


def _resolve_allowed_origins(settings: Settings) -> set[str]:
    """Разрешённые CORS-origin — домен самого приложения + локальная разработка."""
    origins = set()
    for url in (settings.webapp_url, getattr(settings, "public_app_url", None)):
        if url:
            parsed = url.rstrip("/")
            origins.add(parsed)
            if parsed.startswith("https://"):
                origins.add(parsed.replace("https://", "http://"))
    origins.add("http://localhost:3000")
    return origins


def sanitize(text: str, max_len: int = 0) -> str:
    """Удаляет управляющие символы и обрезает длину. HTML-экранирование на фронтенде (React)."""
    if not isinstance(text, str):
        text = str(text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = text.strip()
    if max_len > 0:
        text = text[:max_len]
    return text


# ---------------------------------------------------------------------------
# Content-Security-Policy и security-заголовки
# ---------------------------------------------------------------------------
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
    "X-XSS-Protection": "0",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}

CSP = (
    "default-src 'self';"
    "script-src 'self' 'unsafe-inline' https://telegram.org https://cdn.adsgram.ai https://sad.adsgram.ai https://*.adsgram.ai;"
    "style-src 'self' 'unsafe-inline';"
    "img-src 'self' data: https: https://*.adsgram.ai;"
    "font-src 'self' data:;"
    "connect-src 'self' https://translate.googleapis.com https://api.adsgram.ai https://partner.adsgram.ai https://tma.adsgram.ai https://*.adsgram.ai;"
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://*.adsgram.ai;"
    "frame-ancestors https://telegram.org;"
    "base-uri 'self';"
    "form-action 'self';"
    "object-src 'none'"
)

# ---------------------------------------------------------------------------
# CORS — разрешаем запросы только с домена приложения
# ---------------------------------------------------------------------------
CORS_ALLOW = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
    "Access-Control-Max-Age": "86400",
}

# ---------------------------------------------------------------------------
# Rate limiting — авторизованные /api/ эндпоинты (по user_id)
# Реализован через Redis sorted set (ключ rate:{user_id}).
# Fallback: если Redis недоступен — пропускаем rate-limit для запроса.
# ---------------------------------------------------------------------------
WEB_RATE_LIMIT = 120
WEB_RATE_WINDOW = 60

# Rate limit для /api/me — защита от наплыва опросов при 500+ юзерах.
# 12/мин = 1 запрос в 5с: с запасом на стартовый load, refresh после мутаций
# и повторные открытия приложения.
ME_RATE_LIMIT = 12       # запросов
ME_RATE_WINDOW = 60      # секунд

# Per-IP и глобальный RPS для всех /api/* (Redis, sliding window).
# У одного честного юзера 1-2 IP — лимит по IP срабатывает раньше, чем
# per-user, и режет фермеров с альт-аккаунтов и ботнеты.
# Глобальный лимит — верхний предохранитель от лавины.
IP_RATE_LIMIT = 150       # запросов/мин с одного IP
IP_RATE_WINDOW = 60
GLOBAL_RATE_LIMIT = 3000  # суммарно на весь сервис
GLOBAL_RATE_WINDOW = 60

# Антифарм welcome-бонуса: не больше N выдач стартового капитала с одного IP.
WELCOME_BONUS_IP_LIMIT = 3   # выдач
WELCOME_BONUS_IP_WINDOW = 86400  # за 24 часа

# Версия соглашения (онбординг: политика конфиденциальности + дисклеймер).
# Показываем пользователю один раз; при изменении текста политики версию
# поднимаем — и те, кто принимал более старую, увидят экран снова.
CONSENT_VERSION = 1

# ---------------------------------------------------------------------------
# Rate limiting — публичные /api/ эндпоинты (по IP, без авторизации)
# Применяется к: /api/leaderboard, /api/teams, /api/teams/{id}/applications
# Остаётся in-memory (IP не требует персистентности)
# ---------------------------------------------------------------------------
PUBLIC_RATE_LIMIT = 60   # запросов
PUBLIC_RATE_WINDOW = 60  # секунд
from collections import defaultdict
public_ip_requests: defaultdict[str, list[float]] = defaultdict(list)

# ---------------------------------------------------------------------------
# Global capacity limiter — prevent DB pool exhaustion / OOM under load.
# max concurrent API requests (tunable via env). Skip health, static, webhook.
# ---------------------------------------------------------------------------
import os
MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "50"))
_concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

CAPACITY_SKIP_PATHS = {
    "/health",
    "/webhook",
    "/api/client-error",
    "/api/diag/env",
}
CAPACITY_SKIP_PREFIXES = ("/static/", "/api/games", "/api/leaderboard", "/api/teams", "/api/nexus/shop", "/api/search/count", "/api/online", "/api/discord/callback")

# ---------------------------------------------------------------------------
# Кэш для публичных read-heavy эндпоинтов — Redis GET/SETEX, TTL 2 сек.
# Fallback: если Redis недоступен — кэш пропускается, данные берутся из БД.
# Применяется к: /api/leaderboard, /api/teams (с учётом ?game=)
# /api/teams/{id}/applications — НЕ кэшируется (актуальность важна)
# ---------------------------------------------------------------------------
CACHE_TTL = 2  # секунд

# ---------------------------------------------------------------------------
# Star packs (маппинг для Telegram Stars invoice)
# ---------------------------------------------------------------------------
STAR_PACKS: dict[str, dict] = {
    "p1": {"stars": 75, "title": "Буст профиля на 24 часа", "desc": "Твоя анкета выше в поиске — 24 часа"},
    "p2": {"stars": 250, "title": "Значок PRO + приоритет в поиске", "desc": "PRO-бейдж и приоритетный поиск"},
    "p3": {"stars": 500, "title": "PRO на месяц + кастомный ник", "desc": "PRO-подписка 30 дней + кастом"},
    "p4": {"stars": 1000, "title": "Всё сразу + анимированная рамка", "desc": "Полный пакет NEXUS TeamHub"},
}


def _client_ip(request: web.Request) -> str:
    """Возвращает IP клиента с учётом Render/nginx proxy (X-Forwarded-For).
    Берём только первый IP из заголовка — реальный клиент,
    остальные могут быть промежуточными прокси."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() if forwarded else ""
    return ip or request.remote or "unknown"


def _public_rate_limit(request: web.Request) -> bool:
    """Возвращает True если запрос нужно заблокировать (лимит превышен)."""
    ip = _client_ip(request)
    now = time()
    public_ip_requests[ip] = [
        t for t in public_ip_requests[ip] if now - t < PUBLIC_RATE_WINDOW
    ]
    if len(public_ip_requests[ip]) >= PUBLIC_RATE_LIMIT:
        return True
    public_ip_requests[ip].append(now)
    return False


def _get_user(request: web.Request) -> dict | None:
    return request.get("init_data", {}).get("user")


def _calc_searching_minutes(searching_since: str | None) -> int:
    if not searching_since:
        return 0
    try:
        since = datetime.fromisoformat(searching_since)
        minutes = int((datetime.utcnow() - since).total_seconds() // 60)
        return max(0, minutes) if minutes < 30 else 0
    except Exception:
        return 0


_SENTINEL = object()

_DB_FREE_PREFIXES = ("/api/games", "/api/nexus/shop", "/api/predictions/matches", "/api/client-error", "/api/discord/status", "/api/discord/auth", "/api/discord/callback", "/api/discord/unlink", "/api/discord/daily", "/api/diag/env")

@web.middleware
async def timing_middleware(request: web.Request, handler):
    start = time()
    response = _SENTINEL
    try:
        response = await handler(request)
        return response
    finally:
        elapsed = time() - start
        status = response.status if response is not _SENTINEL else 0
        level = logging.WARNING if elapsed > 1.0 else logging.INFO
        logging.log(level, "[TIMING] %s %s → %d (%.3fs)", request.method, request.path, status, elapsed)


@web.middleware
async def db_ready_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        if not request.app.get("db_ready", False):
            if not any(request.path.startswith(p) for p in _DB_FREE_PREFIXES):
                return web.json_response({"error": "service warming up"}, status=503)
    return await handler(request)


@web.middleware
async def security_middleware(request: web.Request, handler):
    response = await handler(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers[k] = v
    response.headers["Content-Security-Policy"] = CSP
    origin = request.headers.get("Origin", "")
    if origin:
        allowed = request.app.get("allowed_origins", set())
        if origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
    return response


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        resp = web.json_response({}, headers=CORS_ALLOW)
        origin = request.headers.get("Origin", "")
        allowed = request.app.get("allowed_origins", set())
        if origin in allowed:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
        return resp
    response = await handler(request)
    for k, v in CORS_ALLOW.items():
        if k != "Access-Control-Allow-Origin":
            response.headers[k] = v
    return response


@web.middleware
async def cache_static_middleware(request: web.Request, handler):
    response = await handler(request)
    if not request.path.startswith("/api/") and request.path != "/health":
        if not response.headers.get("Cache-Control"):
            if request.path == "/" or request.path == "/index.html":
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            elif request.path.startswith("/_next/static/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@web.middleware
async def gzip_middleware(request: web.Request, handler):
    response = await handler(request)
    accept = request.headers.get("Accept-Encoding", "")
    body = getattr(response, "body", None)
    if "gzip" in accept and body and len(body) > 1024:
        orig_type = response.content_type or ""
        if orig_type.startswith(("text/", "application/json", "application/javascript")):
            response.body = gzip.compress(response.body)
            response.headers["Content-Encoding"] = "gzip"
            response.headers["Content-Length"] = str(len(response.body))
    return response


@web.middleware
async def error_middleware(request: web.Request, handler):
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except (ConnectionResetError, ConnectionError):
        # Клиент оборвал соединение (таймаут/закрыл вкладку) — это не ошибка сервера.
        logging.info("Connection reset in %s %s", request.method, request.path)
        return web.Response(status=499)
    except Exception:
        # Полный стектрейс пишется в лог (виден в консоли / Render Log Stream).
        # Пользователю уходит только общее сообщение — без деталей исключения,
        # внутренних путей и текста ошибки.
        logging.exception("Unhandled exception in %s %s", request.method, request.path)
        return web.json_response({"error": "internal server error"}, status=500)


@web.middleware
async def active_middleware(request: web.Request, handler):
    """Updates last_active_at and logs activity for authenticated users on each API call."""
    response = await handler(request)
    if request.path.startswith("/api/"):
        user = _get_user(request)
        if user and "id" in user:
            db: Database = request.app["db"]
            user_id = user["id"]
            asyncio.ensure_future(db.pool.execute(
                "UPDATE users SET last_active_at = $1 WHERE user_id = $2",
                datetime.utcnow().isoformat(), user_id,
            ))
            # Log only meaningful events (skip /api/me, profile views and generic calls)
            event = _event_from_path(request.path)
            if event not in ("me", "profile", "api_call", ""):
                asyncio.ensure_future(db.log_activity(user_id, event))
    return response


def _event_from_path(path: str) -> str | None:
    """Map API path to a short event name for activity logging."""
    if "/search" in path:
        return "search"
    if "/apply" in path or "/team" in path:
        return "team_app"
    if "/nexus/open" in path:
        return "case_open"
    if "/nexus/ad/watch" in path:
        return "ad_watch"
    if "/achievements/claim" in path:
        return "achievement_claim"
    if "/donate" in path or "/stars" in path or "/coins/buy" in path:
        return "donate"
    if "/profile" in path:
        return "profile"
    if "/me" in path:
        return "me"
    return None


@web.middleware
async def capacity_middleware(request: web.Request, handler):
    """Global concurrent request limiter — returns 503 with retry-after when at capacity."""
    path = request.path
    if path in CAPACITY_SKIP_PATHS or any(path.startswith(p) for p in CAPACITY_SKIP_PREFIXES):
        return await handler(request)
    if not _concurrency_semaphore.locked():
        async with _concurrency_semaphore:
            return await handler(request)
    # at capacity — return 503 with Retry-After hint
    return web.json_response(
        {"error": "server busy", "message": "Сервер перегружен, попробуйте через несколько секунд", "retry_after": 5},
        status=503,
        headers={"Retry-After": "5"},
    )


@web.middleware
async def web_rate_limit_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        init_data = request.get("init_data")
        # init_data присутствует только на защищённых эндпоинтах — после того как
        # auth_middleware проверил X-Telegram-Init-Data и записал его в request.
        # Публичные /api/ эндпоинты (games, leaderboard, teams, nexus/shop…) намеренно
        # не требуют авторизации — auth_middleware их пропускает без установки init_data.
        # Rate-limit применяем только к аутентифицированным запросам.
        if init_data is not None:
            user = init_data.get("user")
            if user and "id" in user:
                user_id = user["id"]
                blocked = await rate_limit_check(user_id, WEB_RATE_LIMIT, WEB_RATE_WINDOW)
                if blocked:
                    return web.json_response({"error": "rate limit exceeded"}, status=429)
    return await handler(request)


@web.middleware
async def ip_rate_limit_middleware(request: web.Request, handler):
    """Per-IP и глобальный RPS для /api/* — работает до auth (в т.ч. для публичных).

    Счётчики в Redis (sliding window): rate:ip:{ip} и rate:global.
    Лимит по IP режет фермеров с альт-аккаунтов (много user_id с 1-2 IP),
    глобальный — предохранитель от лавины. Fail-open при недоступности Redis.
    """
    if request.path.startswith("/api/"):
        ip = _client_ip(request)
        blocked = await rate_limit_checks(
            [(f"ip:{ip}", IP_RATE_LIMIT, IP_RATE_WINDOW), ("global", GLOBAL_RATE_LIMIT, GLOBAL_RATE_WINDOW)]
        )
        if blocked[0] or blocked[1]:
            return web.json_response({"error": "slow down"}, status=429, headers={"Retry-After": "30"})
    return await handler(request)


PUBLIC_API_PREFIXES = (
    "/api/games",
    "/api/leaderboard",
    "/api/teams",
    "/api/nexus/shop",
    "/api/search/count",
    "/api/online",
    "/api/discord/callback",
    "/api/client-error",
    "/api/diag/env",
)

@web.middleware
async def auth_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        is_public = any(request.path.startswith(p) for p in PUBLIC_API_PREFIXES)
        settings: Settings = request.app["settings"]
        init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
        parsed = validate_init_data(init_data_raw, settings.bot_token)
        if parsed and "user" in parsed:
            request["init_data"] = parsed
        elif not is_public:
            if not init_data_raw:
                logging.warning(f"401 {request.path}: X-Telegram-Init-Data пустой")
            elif not parsed:
                logging.warning(f"401 {request.path}: validate_init_data вернул None (длина init_data={len(init_data_raw)})")
            else:
                logging.warning(f"401 {request.path}: нет user в parsed")
            return web.json_response({"error": "unauthorized"}, status=401)
    return await handler(request)


@web.middleware
async def ban_middleware(request: web.Request, handler):
    """Блокирует доступ забаненного ко всем авторизованным эндпоинтам, кроме /api/me.

    /api/me отдаёт статус бана в теле ответа ({"banned": true, "ban_reason"}) —
    клиент по нему показывает экран «Вы забанены». Все остальные операции
    (покупки, кейсы, чаты, поиск, рефералки) для забаненного — 403.
    Бан привязан к user_id, поэтому с другого аккаунта он не обходится.
    """
    if request.path.startswith("/api/"):
        init_data = request.get("init_data")
        if init_data is not None and request.path != "/api/me":
            user = init_data.get("user")
            if user and "id" in user:
                ban = await request.app["db"].get_global_ban(user["id"])
                if ban is not None:
                    return web.json_response(
                        {"error": "banned", "banned": True, "ban_reason": ban.get("reason", ""), "ban_expires_at": ban.get("expires_at", "")},
                        status=403,
                    )
    return await handler(request)


async def handle_index(request: web.Request):
    return web.FileResponse(STATIC_DIR / "index.html")


async def handle_health(request: web.Request):
    """Публичный, без авторизации — для UptimeRobot/cron-job.org, чтобы Render не усыплял сервис."""
    return web.json_response({"status": "ok"})


async def handle_games(request: web.Request):
    games = {
        key: {"title": g["title"], "emoji": g["emoji"], "ranks": g["ranks"], "roles": g["roles"]}
        for key, g in GAMES.items()
    }
    return web.json_response({"games": games, "looking_for": LOOKING_FOR, "playtime": PLAYTIME})


async def handle_me(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"), user.get("photo_url"), user.get("last_name"))

    # Rate limit: защита от спама опросами при 500+ юзерах. Вместо 429 сначала
    # пробуем отдать закэшированный ответ (TTL 4с) — клиент получает данные
    # вместо ошибки и не запускает ретрай-петлю.
    if await rate_limit_check(f"me:{user['id']}", ME_RATE_LIMIT, ME_RATE_WINDOW):
        cached = await cache_get(f"me:{user['id']}")
        if cached is not None:
            return web.json_response(cached)
        return web.json_response({"error": "slow down"}, status=429)

    # Общий предохранитель: /api/me делает ~20 запросов к БД (стартовый load).
    # Если БД зависла (таймаут внешнего сервиса, обрыв сети) — не даём
    # прокси (Render) оборвать соединение с 502: отдаём 503 и пусть клиент
    # ретраит сам. Обёртка ловит любые таймауты внутри хендлера.
    try:
        return await asyncio.wait_for(_me_payload(request, db, user), timeout=25)
    except asyncio.TimeoutError:
        logging.warning("/api/me: DB took >25s, returning 503 (timeout guard)")
        return web.json_response({"error": "server busy"}, status=503)


async def _me_payload(request: web.Request, db: Database, user: dict):
    # Бан аккаунта: статус отдаём клиенту в теле ответа (он покажет бан-экран),
    # бонусы забаненному не начисляются.
    ban_info = await db.get_global_ban(user["id"])
    banned = ban_info is not None

    # Приветственный бонус — один раз при первом входе в Mini App:
    # 500 ⭐, 10 бесплатных открытий премиум-кейса, 10 бесплатных открытий анкет.
    # Считается до gather, чтобы в ответе оказался уже обновлённый баланс.
    # Антифарм: не больше WELCOME_BONUS_IP_LIMIT выдач с одного IP за 24 часа.
    # Счётчик INCR растёт только при реальной выдаче (после проверки welcome_claimed).
    if banned:
        welcome_bonus = False
    elif await db.welcome_claimed(user["id"]):
        welcome_bonus = False
    elif await counter_incr(f"wbon:{_client_ip(request)}", WELCOME_BONUS_IP_WINDOW) > WELCOME_BONUS_IP_LIMIT:
        welcome_bonus = False
    else:
        welcome_bonus = await db.claim_welcome_bonus(user["id"])

    # Независимые запросы выполняются параллельно — пул max=10,
    # gather использует до 9 коннектов одновременно, остальные ждут.
    currency, mini_profile, inventory, battlepass, streak, referral, achievements, premium_active, ad_state = await asyncio.gather(
        db.get_currency(user["id"]),
        db.get_mini_app_profile(user["id"]),
        db.get_inventory(user["id"]),
        db.get_battlepass(user["id"]),
        db.get_daily_streak(user["id"]),
        db.get_or_create_referral(user["id"]),
        db.get_user_achievements(user["id"]),
        db.is_pro(user["id"]),
        db.get_ad_watch_state(user["id"]),
    )

    # Кулдауны кейсов и бонусы jet-предметов.
    case_cooldowns, free_gold_opens = await asyncio.gather(
        db.get_case_cooldowns(user["id"]),
        db.get_free_gold_opens(user["id"]),
    )

    # Username бота для ссылок t.me/<bot>. В aiogram он заполняется только
    # после bot.me() (кэшируется при старте в main.py); здесь — страховка.
    # Никаких хардкод-фолбэков: если username неизвестен, отдаём пустые
    # строки, и клиент просто не покажет кнопки со ссылками на t.me.
    bot = request.app.get("bot")
    bot_username = getattr(bot, "username", None) or ""
    if not bot_username and bot is not None:
        try:
            me = await asyncio.wait_for(bot.me(), timeout=5)
            bot_username = (me.username or "")
        except Exception:
            pass
    if not bot_username:
        logging.warning("/api/me: bot username unavailable, telegram links disabled")
    referral_bot_url = f"https://t.me/{bot_username}" if bot_username else ""
    app_short_name = "nexus"
    direct_app_url = f"https://t.me/{bot_username}/{app_short_name}" if bot_username else ""

    promo_data, role = await asyncio.gather(
        db.get_promo_codes_with_redemption(user["id"]),
        _effective_role(request, db, user["id"]),
    )

    is_beta = await _effective_is_beta(request, db, user["id"])

    # Антифрод рефералки: награда рефереру выплачивается не сразу при вводе кода,
    # а когда приглашённый заполнил анкету и прошло ≥24ч (см. settle_referral_reward).
    referral_settled = await db.settle_referral_reward(user["id"], REFERRAL_REWARD)

    # Ежедневная выдача бета-тестеру (200 кейсов + 10 000 ⭐) — идемпотентно раз в день.
    beta_state = None
    if is_beta:
        beta_state = await db.grant_beta_daily(user["id"])

    consent = await db.get_consent(user["id"])

    payload = {
        "user": user,
        "banned": banned,
        "ban_reason": (ban_info or {}).get("reason", ""),
        "ban_expires_at": (ban_info or {}).get("expires_at", ""),
        "role": role,
        "is_beta": is_beta,
        "beta_state": beta_state,
        "consent": consent,
        "welcome_bonus": welcome_bonus,
        "currency": currency,
        "mini_profile": mini_profile if mini_profile else {"games": []},
        "inventory": inventory,
        "battlepass": battlepass,
        "streak": streak,
        "referral": referral,
        "referral_settled": referral_settled,
        "achievements": achievements,
        "ad_state": ad_state,
        "cases": list(CASES_CONFIG.values()),
        "case_cooldowns": case_cooldowns,
        "free_gold_opens": free_gold_opens,
        "premium_active": premium_active,
        "star_packs": [{"id": k, "stars": v["stars"], "perk": v["desc"], "title": v["title"]} for k, v in STAR_PACKS.items()],
        "battlepass_tiers": BATTLE_PASS_TIERS,
        "referral_reward": REFERRAL_REWARD,
        "referral_ladder": REFERRAL_LADDER,
        "referral_bot_url": referral_bot_url,
        "direct_app_url": direct_app_url,
        "promos": promo_data["codes"],
        "redeemed_codes": promo_data["redeemed"],
        "default_promo_codes": [
            {"code": p["code"], "reward": p["reward"], "maxUses": p["max_uses"], "uses": 0, "createdByUser": False}
            for p in DEFAULT_PROMO_CODES
        ],
    }
    # Кэш на 4с: спайк запросов (открытие аппа, ретраи) бьётся в кэш вместо БД.
    await cache_set(f"me:{user['id']}", payload, ttl=4)
    return web.json_response(payload)


async def handle_user_language(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"), user.get("photo_url"), user.get("last_name"))

    if request.method == "POST":
        body = await request.json()
        lang = body.get("lang", "ru")
        await db.set_user_language(user["id"], lang)
        return web.json_response({"ok": True, "lang": lang})

    lang = await db.get_user_language(user["id"])
    # "ru" — дефолт БД, неотличим от "язык не выбирался". Не навязываем его
    # клиенту, чтобы не затирать автоопределение (язык Telegram игрока).
    if lang and lang.lower() == "ru":
        return web.json_response({"lang": None})
    return web.json_response({"lang": lang})


async def handle_user_consent(request: web.Request):
    """Согласие с политикой конфиденциальности и дисклеймером (онбординг).

    GET  -> {"accepted": bool, "version": int}  — принял ли пользователь
            актуальную версию соглашения.
    POST -> {"version": int}  — пользователь принял соглашение; сохраняем
            версию и время. Сервер хранит принятие навсегда, клиент после
            этого не показывает экран повторно.
    """
    db: Database = request.app["db"]
    user = _get_user(request)
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"), user.get("photo_url"), user.get("last_name"))

    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
        try:
            version = int(body.get("version", 0))
        except (TypeError, ValueError):
            version = 0
        if version < 1 or version > CONSENT_VERSION:
            return web.json_response({"error": "invalid consent version"}, status=400)
        await db.set_consent(user["id"], version)
        return web.json_response({"ok": True, "accepted": True, "version": version})

    version = await db.get_consent(user["id"])
    return web.json_response({"accepted": version >= CONSENT_VERSION, "version": version})


async def handle_user_sync(request: web.Request):
    """Сохраняет профиль Telegram (id, username, first/last name) из initDataUnsafe.user.
    Вызывается фронтендом при каждом запуске Mini App — чтобы в админке имя и
    username отображались даже для тех, кто ни разу не писал боту в ЛС."""
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    await db.ensure_user(
        user["id"],
        (body.get("username") or "").strip()[:64] or None,
        (body.get("first_name") or "").strip()[:128] or None,
        None,
        (body.get("last_name") or "").strip()[:128] or None,
    )
    return web.json_response({"ok": True})


async def handle_save_profile(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()

    required = ["game", "nickname", "rank", "role", "playtime", "looking_for", "contact"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return web.json_response({"error": f"missing fields: {', '.join(missing)}"}, status=400)
    if body["game"] not in GAMES:
        return web.json_response({"error": "unknown game"}, status=400)
    if body["rank"] not in GAMES[body["game"]]["ranks"]:
        return web.json_response({"error": "unknown rank"}, status=400)
    if body["role"] not in GAMES[body["game"]]["roles"]:
        return web.json_response({"error": "unknown role"}, status=400)

    data = {
        "user_id": user["id"],
        "game": body["game"],
        "nickname": sanitize(body["nickname"], 32),
        "rank": body["rank"],
        "role": body["role"],
        "playtime": body["playtime"],
        "looking_for": body["looking_for"],
        "region": sanitize(body.get("region", ""), 40),
        "language": body.get("language", "RU"),
        "contact": sanitize(body["contact"], 80),
        "has_mic": bool(body.get("has_mic", True)),
        "description": sanitize(body.get("description", ""), 300),
    }
    await db.save_profile(data)
    return web.json_response({"profile": await db.get_profile(user["id"])})


async def handle_hide_profile(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    await db.deactivate_profile(user["id"])
    return web.json_response({"ok": True})


async def handle_customize_profile(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    allowed = {"avatar", "nick", "bio", "deco", "games"}
    data = {}
    for k in allowed:
        if k in body:
            v = body.get(k)
            if k in ("nick", "bio"):
                data[k] = sanitize(v, 64 if k == "nick" else 500)
            elif k == "games":
                if isinstance(v, list):
                    data[k] = v
            else:
                data[k] = v
    await db.save_mini_app_profile(user["id"], data)
    return web.json_response({"profile": await db.get_mini_app_profile(user["id"])})





async def handle_search_count(request: web.Request):
    db: Database = request.app["db"]
    stats = await db.stats()
    return web.json_response({"count": stats["profiles"]})


async def handle_online(request: web.Request):
    db: Database = request.app["db"]
    online_count = await db.pool.fetchval(
        "SELECT COUNT(*) FROM profiles WHERE is_active = 1 AND searching_since IS NOT NULL AND searching_since > $1",
        (datetime.utcnow() - timedelta(minutes=15)).isoformat(),
    )
    return web.json_response({"online": online_count or 0})


async def handle_search(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    query = request.query.get("q", "").strip().lower()
    game_filter = request.query.get("game", "").strip().lower()
    discord_filter = request.query.get("discord") == "1"

    profile = await db.get_profile(user["id"])
    if not profile:
        where = "WHERE p.is_active = 1 AND p.user_id != $1"
        params: list = [user["id"]]
        if discord_filter:
            where += " AND EXISTS (SELECT 1 FROM discord_connections dc WHERE dc.user_id = u.user_id)"
        if query:
            where += (
                " AND (LOWER(COALESCE(mp.nick, '')) LIKE $2"
                " OR LOWER(COALESCE(p.nickname, '')) LIKE $2"
                " OR LOWER(COALESCE(p.role, '')) LIKE $2"
                " OR LOWER(COALESCE(p.rank, '')) LIKE $2)"
            )
            params.append(f"%{query}%")
        elif game_filter and game_filter != "all":
            where += " AND p.game = $2"
            params.append(game_filter)
        rows = await db.pool.fetch(
            f"""SELECT u.user_id, u.username, mp.nick, mp.avatar, p.game, p.rank, p.role, p.searching_since,
                EXISTS (SELECT 1 FROM discord_connections dc WHERE dc.user_id = u.user_id) AS has_discord
                FROM users u
                JOIN profiles p ON p.user_id = u.user_id AND p.is_active = 1
                LEFT JOIN mini_app_profiles mp ON mp.user_id = u.user_id
                {where}
                ORDER BY p.searching_since DESC NULLS LAST, p.updated_at DESC
                LIMIT 20""",
            *params,
        )
        players = [
            {
                "id": str(r["user_id"]),
                "user_id": r["user_id"],
                "nick": r["nick"] or f"User{r['user_id']}",
                "avatar": r["avatar"] or f"/player-{((r['user_id'] % 4) + 1)}.webp",
                "game": r["game"] or "unknown",
                "rank": r["rank"] or "",
                "role": r["role"] or "",
                "realName": r["nick"] or "",
                "winrate": 0,
                "kd": 0,
                "tags": [],
                "bio": "",
                "tgUsername": r["username"] or "",
                "vibe": 0,
                "hours": 0,
                "level": None,
                "online": False,
                "lastSeen": None,
                "searching_minutes": _calc_searching_minutes(r["searching_since"]),
                "has_discord": bool(r["has_discord"]),
            }
            for r in rows
        ]
        asyncio.create_task(db.update_searching_since(user["id"]))
        return web.json_response({"players": players, "teams": []})

    # When "all" games with nickname query, search across every game
    if game_filter == "all" and query:
        d_where = "AND EXISTS (SELECT 1 FROM discord_connections dc WHERE dc.user_id = u.user_id)" if discord_filter else ""
        rows = await db.pool.fetch(
            f"""SELECT u.user_id, u.username, mp.nick, mp.avatar, p.game, p.rank, p.role, p.searching_since,
                EXISTS (SELECT 1 FROM discord_connections dc WHERE dc.user_id = u.user_id) AS has_discord
               FROM users u
               LEFT JOIN mini_app_profiles mp ON mp.user_id = u.user_id
               JOIN profiles p ON p.user_id = u.user_id AND p.is_active = 1
               WHERE p.game IN ('cs2','roblox','wot','wt','dota2','valorant','minecraft','fortnite','apex','rust')
                 AND (LOWER(COALESCE(mp.nick, '')) LIKE $1
                   OR LOWER(COALESCE(p.nickname, '')) LIKE $1
                   OR LOWER(COALESCE(p.role, '')) LIKE $1
                   OR LOWER(COALESCE(p.rank, '')) LIKE $1)
                 {d_where}
               LIMIT 20""",
            f"%{query}%",
        )
        await db.increment_user_stat(user["id"], "search_count")
        await db.update_quest_progress(user["id"], "do-searches", 1)
        await db.update_quest_progress(user["id"], "do-searches-2", 1)
        players = [
            {
                "id": str(r["user_id"]),
                "user_id": r["user_id"],
                "nick": r["nick"] or f"User{r['user_id']}",
                "avatar": r["avatar"] or f"/player-{((r['user_id'] % 4) + 1)}.webp",
                "game": r["game"] or "unknown",
                "rank": r["rank"] or "",
                "role": r["role"] or "",
                "realName": r["nick"] or "",
                "winrate": 0,
                "kd": 0,
                "tags": [],
                "bio": "",
                "tgUsername": r["username"] or "",
                "vibe": 0,
                "hours": 0,
                "level": None,
                "online": False,
                "lastSeen": None,
                "searching_minutes": _calc_searching_minutes(r["searching_since"]),
                "has_discord": bool(r["has_discord"]),
            }
            for r in rows
        ]
        asyncio.create_task(db.update_searching_since(user["id"]))
        return web.json_response({"players": players, "teams": []})
    game_to_search = game_filter if game_filter and game_filter != "all" else (profile["game"] if profile else None)
    is_pro = await db.is_pro(user["id"])
    has_boost = await db.has_search_boost(user["id"], game_to_search) if not is_pro else False
    premium = is_pro or has_boost
    is_beta = await _effective_is_beta(request, db, user["id"])
    search_limit = 500 if (premium or is_beta) else 20
    if has_boost:
        await db.consume_search_boost(user["id"], game_to_search)
    if game_filter == "all":
        candidates = await db.pool.fetch(
            """SELECT p.*, COALESCE(mp.games, '') AS fav_games
               FROM profiles p
               LEFT JOIN mini_app_profiles mp ON p.user_id = mp.user_id
               WHERE p.is_active = 1 AND p.user_id != $1""",
            user["id"],
        )
        candidates = [dict(r) for r in candidates]
    else:
        candidates = await db.list_profiles_by_game(game_to_search, exclude_user_id=user["id"])

    # Filter by nickname/role/rank if q provided
    if query:
        candidates = [
            c for c in candidates
            if query in c.get("nickname", "").lower()
            or query in c.get("role", "").lower()
            or query in c.get("rank", "").lower()
        ]

    if discord_filter:
        discord_ids = {
            r["user_id"] for r in await db.pool.fetch("SELECT user_id FROM discord_connections")
        }
        candidates = [c for c in candidates if c["user_id"] in discord_ids]
    else:
        discord_ids = None

    matches = find_matches(profile, candidates, limit=search_limit)
    if not matches and candidates:
        scored = [(c, score_match(profile, c)) for c in candidates]
        scored.sort(key=lambda x: (-x[1], -int(x[0].get("_highlighted", False))))
        matches = scored[:search_limit]

    players = []
    matched_ids = [p["user_id"] for p, _ in matches]
    usernames: dict[int, str] = {}
    if matched_ids:
        try:
            urows = await db.pool.fetch(
                "SELECT user_id, username FROM users WHERE user_id = ANY($1::bigint[])",
                matched_ids,
            )
            usernames = {r["user_id"]: (r["username"] or "") for r in urows}
        except Exception:
            usernames = {}
    for p, score in matches:
        contact_unlocked = await db.has_unlocked_contact(user["id"], p["id"])
        mini_profile = await db.get_mini_app_profile(p["user_id"])
        nick = mini_profile.get("nick") or p["nickname"] or "Unknown"
        avatar = mini_profile.get("avatar") or f"/player-{((p['user_id'] % 4) + 1)}.webp"
        contact = p["contact"] if premium or contact_unlocked else None
        if discord_ids is not None:
            has_discord = p["user_id"] in discord_ids
        else:
            has_discord = bool(
                await db.pool.fetchval(
                    "SELECT 1 FROM discord_connections WHERE user_id = $1", p["user_id"]
                )
            )
        players.append({
            "id": str(p["user_id"]),
            "user_id": p["user_id"],
            "nick": nick,
            "avatar": avatar,
            "nickname": p["nickname"] if premium else "🔒 Скрыто",
            "game": p["game"],
            "rank": p["rank"],
            "role": p["role"],
            "playtime": p["playtime"],
            "region": p.get("region", ""),
            "realName": nick,
            "winrate": 0,
            "kd": 0,
            "tags": [],
            "bio": p.get("description") or "",
            "tgUsername": usernames.get(p["user_id"], ""),
            "vibe": score,
            "hours": int(p.get("playtime") or 0) if (p.get("playtime") or "").isdigit() else 0,
            "level": None,
            "online": False,
            "lastSeen": None,
            "contact": contact,
            "searching_minutes": _calc_searching_minutes(p.get("searching_since")),
            "has_discord": bool(has_discord),
        })

    await db.increment_user_stat(user["id"], "search_count")
    await db.update_quest_progress(user["id"], "do-searches", 1)
    await db.update_quest_progress(user["id"], "do-searches-2", 1)
    asyncio.create_task(db.update_searching_since(user["id"]))

    return web.json_response({"premium": premium, "is_pro": is_pro, "game": game_to_search, "players": players, "teams": []})


async def handle_guides(request: web.Request):
    init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
    logging.info(f"[AUTH] GET {request.path} init_data_present={bool(init_data_raw)} init_data_len={len(init_data_raw)} (handler)")
    db: Database = request.app["db"]
    user = _get_user(request)
    game = request.query.get("game")

    items = []
    for g in GUIDES:
        if game and g["game"] != game:
            continue
        if user is None:
            unlocked = g["type"] == "free"
        else:
            unlocked = g["type"] == "free" or await db.has_unlocked(user["id"], g["id"])
        items.append({
            "id": g["id"], "game": g["game"], "title": g["title"],
            "type": g["type"], "stars": g["stars"], "unlocked": unlocked,
            "video_url": g.get("video_url"),
        })
    return web.json_response({"guides": items})


async def handle_guide_detail(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    guide_id = request.match_info["guide_id"]
    guide = next((g for g in GUIDES if g["id"] == guide_id), None)
    if not guide:
        return web.json_response({"error": "not found"}, status=404)

    if user is None:
        unlocked = guide["type"] == "free"
    else:
        unlocked = guide["type"] == "free" or await db.has_unlocked(user["id"], guide_id)
    payload = {"id": guide["id"], "title": guide["title"], "type": guide["type"], "stars": guide["stars"], "unlocked": unlocked}
    if unlocked:
        payload["text"] = guide["text"]
        payload["video_url"] = guide.get("video_url")
    else:
        payload["preview"] = guide["text"][:200]
    return web.json_response(payload)


async def handle_create_invoice(request: web.Request):
    db: Database = request.app["db"]
    bot = request.app["bot"]
    settings: Settings = request.app["settings"]
    user = _get_user(request)
    body = await request.json()
    kind = body.get("type")

    if kind == "best_team":
        profile = await db.get_profile(user["id"])
        if not profile:
            return web.json_response({"error": "no profile"}, status=400)
        link = await bot.create_invoice_link(
            title="Лучший подбор команд",
            description=f"Топ-10 игроков с % совместимости и контактами для {profile['game']}",
            payload=f"best_team:{profile['game']}",
            currency="XTR",
            prices=[{"label": "Лучший подбор", "amount": settings.price_best_team}],
        )
    elif kind == "highlight":
        link = await bot.create_invoice_link(
            title="Поднять анкету в топ",
            description="Твоя анкета выше в поиске 24 часа",
            payload="highlight:profile",
            currency="XTR",
            prices=[{"label": "Поднять анкету", "amount": settings.price_highlight}],
        )
    elif kind == "guide":
        guide = next((g for g in GUIDES if g["id"] == body.get("guide_id")), None)
        if not guide or guide["stars"] <= 0:
            return web.json_response({"error": "guide unavailable"}, status=400)
        link = await bot.create_invoice_link(
            title=guide["title"],
            description="Премиум-гайд TeamFinder",
            payload=f"guide:{guide['id']}",
            currency="XTR",
            prices=[{"label": guide["title"], "amount": guide["stars"]}],
        )
    elif kind == "pro_subscription":
        if await db.is_pro(user["id"]):
            return web.json_response({"error": "already pro"}, status=400)
        link = await bot.create_invoice_link(
            title="PRO-подписка на 30 дней",
            description="Безлимитный поиск, мульти-анкеты, приоритет в заявках",
            payload="pro:subscription",
            currency="XTR",
            prices=[{"label": "PRO-подписка", "amount": settings.price_pro_subscription}],
        )
    elif kind == "single_contact":
        profile_id = body.get("profile_id")
        if not profile_id:
            return web.json_response({"error": "profile_id required"}, status=400)
        if await db.has_unlocked_contact(user["id"], profile_id):
            return web.json_response({"error": "already unlocked"}, status=400)
        link = await bot.create_invoice_link(
            title="Открыть контакт",
            description="Просмотр контакта одного игрока",
            payload=f"contact:{profile_id}",
            currency="XTR",
            prices=[{"label": "Открыть контакт", "amount": settings.price_single_contact}],
        )
    elif kind == "premium_application":
        link = await bot.create_invoice_link(
            title="Премиум-заявка",
            description="Твоя заявка в топе списка команд",
            payload="premium:application",
            currency="XTR",
            prices=[{"label": "Премиум-заявка", "amount": settings.price_premium_application}],
        )
    elif kind == "star_pack":
        pack_id = body.get("pack_id")
        pack = STAR_PACKS.get(pack_id)
        if not pack:
            return web.json_response({"error": "unknown star pack"}, status=400)
        link = await bot.create_invoice_link(
            title=pack["title"],
            description=pack["desc"],
            payload=f"star_pack:{pack_id}",
            currency="XTR",
            prices=[{"label": pack["title"], "amount": pack["stars"]}],
        )
    elif kind == "tip":
        amount = body.get("amount", 0)
        if not isinstance(amount, int) or amount <= 0 or amount > 10000:
            return web.json_response({"error": "invalid amount"}, status=400)
        link = await bot.create_invoice_link(
            title="Поддержать проект",
            description=f"Отправка {amount} ⭐ в поддержку Nexus",
            payload=f"tip:{amount}",
            currency="XTR",
            prices=[{"label": "Поддержка", "amount": amount}],
        )
    elif kind == "buy_stars":
        amount = body.get("amount", 0)
        if not isinstance(amount, int) or amount <= 0 or amount > 10000:
            return web.json_response({"error": "invalid amount"}, status=400)
        link = await bot.create_invoice_link(
            title=f"{amount} ⭐",
            description="Пополнение баланса Telegram Stars",
            payload=f"buy_stars:{amount}",
            currency="XTR",
            prices=[{"label": f"{amount} ⭐", "amount": amount}],
        )
    else:
        return web.json_response({"error": "unknown invoice type"}, status=400)

    return web.json_response({"invoice_link": link})


async def handle_teams(request: web.Request):
    if _public_rate_limit(request):
        return web.json_response({"error": "rate limit exceeded"}, status=429)
    game = request.query.get("game")
    # Кэш-ключ включает game-фильтр: "teams:cs2", "teams:dota2", "teams:" (все)
    cache_key = f"teams:{game or ''}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return web.json_response(cached)
    db: Database = request.app["db"]
    teams = await db.list_teams(game)
    data = {"teams": teams}
    await cache_set(cache_key, data, CACHE_TTL)
    return web.json_response(data)


async def handle_create_team(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()

    required = ["game", "name", "max_players"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return web.json_response({"error": f"missing fields: {', '.join(missing)}"}, status=400)

    team_id = await db.create_team(
        captain_id=user["id"],
        game=body["game"],
        name=str(body["name"]).strip()[:64],
        description=str(body.get("description", "")).strip()[:300],
        max_players=int(body["max_players"]),
    )
    # Инвалидируем весь кэш команд — сбрасываем все ключи с префиксом "teams:".
    # Это покрывает все комбинации фильтров (?game=, ?region= и любые будущие),
    # поэтому добавление нового query-параметра в handle_teams не требует правок здесь.
    # Соглашение: все кэш-ключи handle_teams ДОЛЖНЫ начинаться с "teams:".
    await cache_delete_pattern("teams:*")
    return web.json_response({"team_id": team_id, "team": await db.get_team(team_id)})


async def handle_team_applications(request: web.Request):
    if _public_rate_limit(request):
        return web.json_response({"error": "rate limit exceeded"}, status=429)
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        team_id = int(request.match_info["team_id"])
    except ValueError:
        return web.json_response({"error": "invalid team_id"}, status=400)
    team = await db.get_team(team_id)
    if not team:
        return web.json_response({"error": "team not found"}, status=404)
    if team.get("captain_id") != user["id"]:
        return web.json_response({"error": "forbidden"}, status=403)
    status = request.query.get("status")
    applications = await db.get_team_applications(team_id, status)
    return web.json_response({"applications": applications})


async def handle_apply_team(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        team_id = int(request.match_info["team_id"])
    except ValueError:
        return web.json_response({"error": "invalid team_id"}, status=400)
    body = await request.json()
    message = str(body.get("message", "")).strip()[:500]

    is_premium = await db.consume_premium_application_credit(user["id"])
    app_id = await db.apply_to_team(team_id, user["id"], message, is_premium)
    await db.increment_user_stat(user["id"], "team_app_count")
    return web.json_response({"application_id": app_id, "is_premium": is_premium})


async def handle_user_applications(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    applications = await db.get_user_applications(user["id"])
    return web.json_response({"applications": applications})


# Nexus Mini App API endpoints
CASES_CONFIG = {
    "blue": {
        "id": "blue",
        "name": "Nexus Basic case",
        "subtitle": "Бесплатный ежедневный кейс",
        "image": "/case-blue.webp",
        "gold": False,
        "costStars": 0,
        "free": True,
        "dailyLimit": 1,
        "items": [
            {"key": "premium-medium", "name": "Премиум средний", "desc": "Премиум на 1 день: до 4 открытий кейсов в день (вместо 1), приоритет в поиске тиммейтов, расширенные анкеты игроков",         "image": "/premium-x4.webp", "rarity": "epic", "sell": 35, "weight": 12, "grantsPremium": True},
            {"key": "ak47", "name": "Скин AK-47", "desc": "Коллекционный скин-картинка для твоей анкеты. Показывается в профиле, не влияет на геймплей",         "image": "/ak47.webp", "rarity": "rare", "sell": 15, "weight": 30},
            {"key": "icon-skull", "name": "Череп", "desc": "Декоративная иконка для профиля 💀", "icon": "💀", "rarity": "common", "sell": 10, "weight": 8},
            {"key": "icon-fire", "name": "Пламя", "desc": "Декоративная иконка для профиля 🔥", "icon": "🔥", "rarity": "common", "sell": 10, "weight": 12},
            {"key": "icon-crown", "name": "Корона", "desc": "Декоративная иконка для профиля 👑", "icon": "👑", "rarity": "common", "sell": 10, "weight": 6},
            {"key": "icon-target", "name": "Прицел", "desc": "Декоративная иконка для профиля 🎯", "icon": "🎯", "rarity": "common", "sell": 10, "weight": 14},
            {"key": "icon-bolt", "name": "Молния", "desc": "Декоративная иконка для профиля ⚡", "icon": "⚡", "rarity": "common", "sell": 10, "weight": 9},
            {"key": "icon-star", "name": "Звезда", "desc": "Декоративная иконка для профиля ⭐", "icon": "⭐", "rarity": "common", "sell": 10, "weight": 9},
        ]
    },
    "jet": {
        "id": "jet",
        "name": "Nexus Jet case",
        "subtitle": "Военный кейс · 1200 монет за открытие",
        "image": "/case-jet.webp",
        "gold": False,
        "costStars": 0,
        "costCoins": 1200,
        "free": False,
        "dailyLimit": 99,
        "items": [
            {"key": "f16", "name": "F-16 Fighting Falcon", "desc": "15% шанс · +2000 ⭐ · +20 анкет/день · топ в поиске",         "image": "/f16.webp", "rarity": "legendary", "sell": 0, "weight": 15, "kind": "jet", "bonuses": {"stars": 2000, "searches": 20, "highlight_hours": 24}},
            {"key": "f15", "name": "F-15 Eagle", "desc": "20% шанс · +5000 монет · +10 анкет · топ 2-3 · бесплатное премиум-открытие",         "image": "/f15.webp", "rarity": "epic", "sell": 0, "weight": 20, "kind": "jet", "bonuses": {"coins": 5000, "searches": 10, "highlight_hours": 48, "free_gold_opens": 1}},
            {"key": "f14", "name": "F-14 Tomcat", "desc": "10% шанс · +4000 ⭐ · +50 премиум-открытий · +50 анкет · топ-1 на 3 дня",         "image": "/f14.webp", "rarity": "legendary", "sell": 0, "weight": 10, "kind": "jet", "bonuses": {"stars": 4000, "free_gold_opens": 50, "searches": 50, "highlight_hours": 72}},
            {"key": "premium-medium", "name": "Премиум средний", "desc": "Премиум на 1 день: до 4 открытий кейсов, приоритет в поиске",         "image": "/premium-x4.webp", "rarity": "epic", "sell": 35, "weight": 10, "grantsPremium": True},
            {"key": "ak47", "name": "Скин AK-47", "desc": "Коллекционный скин-картинка для профиля",         "image": "/ak47.webp", "rarity": "rare", "sell": 15, "weight": 8},
            {"key": "icon-skull", "name": "Череп", "desc": "Декоративная иконка 💀", "icon": "💀", "rarity": "common", "sell": 10, "weight": 6},
            {"key": "icon-fire", "name": "Пламя", "desc": "Декоративная иконка 🔥", "icon": "🔥", "rarity": "common", "sell": 10, "weight": 6},
            {"key": "icon-crown", "name": "Корона", "desc": "Декоративная иконка 👑", "icon": "👑", "rarity": "common", "sell": 10, "weight": 5},
            {"key": "icon-target", "name": "Прицел", "desc": "Декоративная иконка 🎯", "icon": "🎯", "rarity": "common", "sell": 10, "weight": 7},
            {"key": "icon-bolt", "name": "Молния", "desc": "Декоративная иконка ⚡", "icon": "⚡", "rarity": "common", "sell": 10, "weight": 6},
            {"key": "icon-star", "name": "Звезда", "desc": "Декоративная иконка ⭐", "icon": "⭐", "rarity": "common", "sell": 10, "weight": 7},
        ]
    },
    "gold": {
        "id": "gold",
        "name": "Nexus Premium",
        "subtitle": "Золотой премиальный кейс",
        "image": "/case-gold.webp",
        "gold": True,
        "costStars": 75,
        "free": False,
        "dailyLimit": 99,
        "items": [
            {"key": "premium-card", "name": "Премиум-анкета", "desc": "Максимальный премиум на 1 день: кастомные фото, свой текст и украшения карточки без ограничений, до 4 открытий кейсов, приоритет в поиске, расширенные анкеты игроков",         "image": "/premium-reveal.webp", "rarity": "premium", "sell": 100, "weight": 40, "grantsPremium": True},
            {"key": "premium-card-lite", "name": "Премиум", "desc": "Премиум-статус на 1 день: приоритет в поиске тиммейтов, расширенные анкеты игроков, больше результатов в поиске",         "image": "/premium-card.webp", "rarity": "epic", "sell": 45, "weight": 22, "grantsPremium": True},
            {"key": "premium-medium", "name": "Премиум средний", "desc": "Премиум на 1 день: до 4 открытий кейсов в день (вместо 1), приоритет в поиске тиммейтов, расширенные анкеты игроков",         "image": "/premium-x4.webp", "rarity": "epic", "sell": 75, "weight": 20, "grantsPremium": True},
            {"key": "stars-150", "name": "150 ⭐", "desc": "150 звёзд на баланс", "icon": "⭐", "rarity": "common", "sell": 0, "weight": 8, "kind": "stars", "stars": 150},
            {"key": "stars-400", "name": "400 ⭐", "desc": "400 звёзд на баланс", "icon": "⭐", "rarity": "rare", "sell": 0, "weight": 4, "kind": "stars", "stars": 400},
            {"key": "stars-1200", "name": "1200 ⭐", "desc": "1200 звёзд на баланс", "icon": "⭐", "rarity": "epic", "sell": 0, "weight": 1.2, "kind": "stars", "stars": 1200},
            {"key": "nexus-model", "name": "Mini Boss bro", "desc": "Лимитированная 3D-модель. Тираж 20 шт. Джекпот: 10 000 ⭐, роль модератора/админа, пожизненный премиум, доход 50-100 ⭐ в день", "icon": "💎", "rarity": "legendary", "sell": 55000, "weight": 0.1, "jackpot": True, "kind": "model"},
        ]
    }
}

COIN_SHOP = [
    {"key": "buy-premium-card", "name": "Премиум-анкета", "desc": "Максимальный премиум на 1 день: кастом фото/текст, 4 открытия кейсов, приоритет в поиске",         "image": "/premium-reveal.webp", "price": 100},
    {"key": "buy-premium-lite", "name": "Премиум", "desc": "Премиум-статус на 1 день: приоритет в поиске, расширенные анкеты игроков",         "image": "/premium-card.webp", "price": 45},
    {"key": "buy-ak47", "name": "Скин AK-47", "desc": "Коллекционный скин-картинка для профиля",         "image": "/ak47.webp", "price": 18},
    {"key": "buy-premium-medium", "name": "Премиум средний", "desc": "Премиум на 1 день: до 4 открытий кейсов, приоритет в поиске",         "image": "/premium-x4.webp", "price": 38},
]

QUESTS_CONFIG = [
    {"id": "open-cases", "title": "Открой 25 кейсов", "desc": "Открой 25 кейсов в Nexus", "reward": "40 ⭐", "rewardStars": 40, "target": 25},
    {"id": "do-searches", "title": "Сделай 14 поисков", "desc": "Найди тиммейтов 14 раз", "reward": "35 ⭐", "rewardStars": 35, "target": 14},
    {"id": "open-cases-2", "title": "Открой 50 кейсов", "desc": "Открой 50 кейсов в Nexus", "reward": "75 ⭐", "rewardStars": 75, "target": 50},
    {"id": "do-searches-2", "title": "Сделай 30 поисков", "desc": "Найди тиммейтов 30 раз", "reward": "60 ⭐", "rewardStars": 60, "target": 30},
]


# Per-user locks to serialize case opens: prevents bursts of concurrent
# transactions on the same user from exhausting the DB pool / entity locks.
_user_locks: dict[int, asyncio.Lock] = {}
_user_locks_guard = asyncio.Lock()


async def _user_lock(user_id: int) -> asyncio.Lock:
    """Return the per-user asyncio lock (thread-safe creation under guard)."""
    async with _user_locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            _user_locks[user_id] = lock
        return lock


async def handle_nexus_balance(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    currency = await db.get_currency(user["id"])
    return web.json_response(currency)


async def handle_nexus_cases(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    cooldowns = {}
    for case_id in CASES_CONFIG:
        last_open = await db.get_last_case_open(user["id"], case_id)
        cooldowns[case_id] = last_open
    return web.json_response({"cases": CASES_CONFIG, "cooldowns": cooldowns})


async def handle_nexus_open_case(request: web.Request):
    init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
    logging.info(f"[AUTH] POST {request.path} init_data_present={bool(init_data_raw)} init_data_len={len(init_data_raw)} (handler)")
    db: Database = request.app["db"]
    user = _get_user(request)
    logging.info(f"[AUTH] POST {request.path} user_parsed={user is not None} user_id={user.get('id') if user else None}")
    body = await request.json()
    case_id = body.get("case_id")
    count = body.get("count", 1)
    request_id = body.get("request_id")

    if not case_id or not isinstance(case_id, str):
        return web.json_response({"error": "invalid case_id"}, status=400)

    if case_id not in CASES_CONFIG:
        return web.json_response({"error": "unknown case"}, status=400)

    if not isinstance(count, int) or count <= 0:
        return web.json_response({"error": "invalid count"}, status=400)

    if request_id is not None and not isinstance(request_id, str):
        return web.json_response({"error": "invalid request_id"}, status=400)

    case_config = CASES_CONFIG[case_id]

    # Мульти-открытие доступно только для платных кейсов (у бесплатного дневной кулдаун)
    if count > 1 and case_config["free"]:
        return web.json_response({"error": "multi open not allowed for free case"}, status=400)

    def _roll_normal_item(items: list[dict]) -> dict:
        normal = [i for i in items if not i.get("jackpot")]
        total_weight = sum(i["weight"] for i in normal)
        rand = random.uniform(0, total_weight)
        current = 0
        for item in normal:
            current += item["weight"]
            if rand <= current:
                return item
        return normal[0]

    # Everything below runs inside one DB transaction to keep currency/items consistent.
    # Per-user lock serializes opens from the same user so rapid clicks can't spawn
    # concurrent transactions on the same row (avoids lock waits / pool exhaustion).
    lock = await _user_lock(user["id"])
    async with lock:
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                # Идемпотентность: если этот request_id уже обработан (клиент мог
                # повторить запрос после обрыва сети), возвращаем сохранённый результат
                # и ничего не списываем повторно.
                if request_id:
                    existing = await conn.fetchval(
                        "SELECT result FROM case_open_requests WHERE request_id = $1 AND user_id = $2",
                        request_id, user["id"],
                    )
                    if existing is not None:
                        return web.json_response(json.loads(existing))

                if case_config["free"]:
                    last_open = await db.get_last_case_open(user["id"], case_id, conn)
                    if last_open:
                        last_dt = datetime.fromisoformat(last_open)
                        if (datetime.utcnow() - last_dt).total_seconds() < 24 * 3600 and not body.get("via_ad"):
                            return web.json_response({"error": "cooldown"}, status=400)
                else:
                    # Бета-тестер открывает премиум-кейс за накопленный бесплатный
                    # баланс (до 200/день, копится до 6000) вместо звёзд.
                    is_beta = await _effective_is_beta(request, db, user["id"])
                    beta_free = body.get("beta_free") or is_beta
                    if beta_free and case_id == "gold":
                        beta_state = await db.get_beta_state(user["id"])
                        if beta_state and beta_state["case_balance"] >= count:
                            if not await db.consume_beta_case(user["id"], count, conn):
                                return web.json_response({"error": "not enough beta cases"}, status=400)
                        else:
                            total_cost = case_config["costStars"] * count
                            if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                return web.json_response({"error": "not enough stars"}, status=400)
                    elif case_id == "gold":
                        # Бесплатные премиум-открытия от jet-предметов
                        free_opens = await conn.fetchval(
                            "SELECT free_gold_opens FROM users WHERE user_id = $1", user["id"],
                        ) or 0
                        if free_opens >= count:
                            await conn.execute(
                                "UPDATE users SET free_gold_opens = free_gold_opens - $1 WHERE user_id = $2",
                                count, user["id"],
                            )
                        else:
                            remaining = count - free_opens
                            if free_opens > 0:
                                await conn.execute(
                                    "UPDATE users SET free_gold_opens = 0 WHERE user_id = $1", user["id"],
                                )
                            total_cost = case_config["costStars"] * remaining
                            if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                return web.json_response({"error": "not enough stars"}, status=400)
                    elif case_config.get("costCoins"):
                        total_cost = case_config["costCoins"] * count
                        if not await db._adjust_currency_conn(conn, user["id"], coins=-total_cost):
                            return web.json_response({"error": "not enough coins"}, status=400)
                    else:
                        total_cost = case_config["costStars"] * count
                        if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                            return web.json_response({"error": "not enough stars"}, status=400)

                jackpot_item = next((i for i in case_config["items"] if i.get("jackpot")), None)
                rolled_items: list[dict] = []
                stars_won = 0
                coins_won = 0
                inventory_batch: list[tuple] = []
                premium_count = 0
                jet_bonuses_batch: list[dict] = []
                now = datetime.utcnow().isoformat()

                for _ in range(count):
                    # Джекпот-ролл (0.1%) — лимитированная 3D-модель, если тираж не распродан.
                    rolled_item = _roll_normal_item(case_config["items"])
                    model_token = None
                    granted_role = None
                    if jackpot_item and random.random() < 0.001:
                        token = await db.next_limited_token(conn)
                        if token is not None:
                            rolled_item = jackpot_item
                            model_token = token

                    kind = rolled_item.get("kind", "inventory")
                    if kind == "stars":
                        stars_won += rolled_item.get("stars", 0)
                    elif kind == "jet":
                        bonuses = rolled_item.get("bonuses", {})
                        stars_won += bonuses.get("stars", 0)
                        coins_won += bonuses.get("coins", 0)
                        jet_bonuses_batch.append(bonuses)
                    elif kind == "model":
                        settings = request.app.get("settings")
                        dev_id = settings.admin_ids[0] if settings and settings.admin_ids else None
                        granted_role = await db.grant_limited_model(conn, user["id"], model_token, dev_id)
                    else:
                        inventory_batch.append((
                            rolled_item["key"],
                            rolled_item["name"],
                            rolled_item["rarity"],
                            rolled_item["sell"],
                            int(bool(rolled_item.get("grantsPremium"))),
                        ))
                        if rolled_item.get("grantsPremium"):
                            premium_count += 1

                    result_item = dict(rolled_item)
                    if model_token is not None:
                        result_item["token"] = model_token
                        result_item["role"] = granted_role
                        nick = await conn.fetchval(
                            "SELECT nick FROM mini_app_profiles WHERE user_id = $1",
                            user["id"],
                        )
                        claimed_now = await conn.fetchval(
                            "SELECT COUNT(*) FROM limited_models WHERE model_id = $1",
                            "nexus-model",
                        )
                        await db.send_global_message(
                            user["id"],
                            f"выбил Mini Boss bro #{model_token} из кейса NEXUS TeamHub Premium! Тираж: {claimed_now}/20",
                            kind="system",
                            conn=conn,
                        )
                    rolled_items.append(result_item)

                # Применяем результаты батчами
                if stars_won > 0:
                    await db._adjust_currency_conn(conn, user["id"], stars=stars_won)
                if coins_won > 0:
                    await db._adjust_currency_conn(conn, user["id"], coins=coins_won)

                # Jet-бонусы: подсветка, бесплатные премиум-открытия, анкеты
                for bonuses in jet_bonuses_batch:
                    await db.grant_jet_bonuses(user["id"], bonuses, conn)

                if inventory_batch:
                    rows_sql = ", ".join(
                        f"({user['id']}, ${i*6+1}, ${i*6+2}, ${i*6+3}, ${i*6+4}, ${i*6+5}, ${i*6+6})"
                        for i in range(len(inventory_batch))
                    )
                    inv_params: list = []
                    for key, name, rarity, sell, premium in inventory_batch:
                        inv_params += [key, name, rarity, sell, premium, now]
                    await conn.execute(
                        f"INSERT INTO user_inventory (user_id, item_key, item_name, item_rarity, sell_price, grants_premium, acquired_at) VALUES {rows_sql}",
                        *inv_params,
                    )

                if premium_count > 0:
                    await db.set_pro_status(user["id"], days=premium_count, conn=conn)

                if rolled_items:
                    keys_sql = ", ".join(
                        f"({user['id']}, ${i*3+1}, ${i*3+2}, ${i*3+3})"
                        for i in range(len(rolled_items))
                    )
                    open_params: list = []
                    for it in rolled_items:
                        open_params += [case_id, now, it["key"]]
                    await conn.execute(
                        f"INSERT INTO case_opens (user_id, case_id, opened_at, item_key) VALUES {keys_sql}",
                        *open_params,
                    )

                await db.add_battlepass_xp(user["id"], 20 * count, conn)

                if request_id:
                    await conn.execute(
                        "INSERT INTO case_open_requests (request_id, user_id, case_id, count, result, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
                        request_id, user["id"], case_id, count,
                        json.dumps({
                            "item": rolled_items[0],
                            "items": rolled_items if count > 1 else None,
                            "last_open_at": datetime.utcnow().isoformat(),
                        }),
                        now,
                    )

    # Track quest progress: case opened (await — прогресс должен быть в БД
    # уже к моменту ответа, иначе «Забрать награду» сразу после открытия
    # вернёт «quest not completed»).
    await db.update_quest_progress(user["id"], "open-cases", count)
    await db.update_quest_progress(user["id"], "open-cases-2", count)

    return web.json_response({
        "item": rolled_items[0],
        "items": rolled_items if count > 1 else None,
        "last_open_at": datetime.utcnow().isoformat(),
    })


async def handle_nexus_share_image(request: web.Request):
    """Генерирует PNG-карточку дропа для шеринга в соцсети."""
    _get_user(request)
    body = await request.json()
    item = body.get("item") or {}
    case = body.get("case") or {}

    item_name = item.get("name") or "Награда"
    rarity = item.get("rarity") or "common"
    icon = item.get("icon") or "🎁"
    image = item.get("image")
    case_name = case.get("name") or "Nexus case"

    png = await asyncio.to_thread(_render_share_image, item_name, rarity, icon, image, case_name)
    if png is None:
        return web.json_response({"error": "image generation failed"}, status=500)
    return web.Response(body=png, content_type="image/png")


def _render_share_image(item_name: str, rarity: str, icon: str, image: str | None, case_name: str) -> bytes | None:
    """Синхронная Pillow-генерация — выполняется в потоке, чтобы не блокировать event loop."""
    try:
        from PIL import Image, ImageDraw, ImageFont

        rarity_colors = {
            "common": "#9ca3af",
            "rare": "#38bdf8",
            "epic": "#a855f7",
            "premium": "#eab308",
            "legendary": "#ffd700",
        }
        color = rarity_colors.get(rarity, "#9ca3af")

        W, H = 1080, 1350
        img = Image.new("RGB", (W, H), (10, 10, 16))
        draw = ImageDraw.Draw(img)

        def _font(size: int) -> ImageFont.ImageFont:
            for candidate in (
                "C:\\Windows\\Fonts\\segoeui.ttf",
                "C:\\Windows\\Fonts\\arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ):
                try:
                    return ImageFont.truetype(candidate, size)
                except Exception:
                    continue
            return ImageFont.load_default()

        font_big = _font(64)
        font_mid = _font(44)
        font_small = _font(34)

        # Title
        draw.text((60, 70), "NEXUS TEAMHUB", font=_font(36), fill="#6b7280")
        draw.text((60, 120), case_name, font=font_big, fill="#f3f4f6")

        # Card background
        card = Image.new("RGBA", (W - 120, 620), (24, 24, 34, 255))
        card_draw = ImageDraw.Draw(card)
        card_draw.rounded_rectangle([0, 0, card.width, card.height], radius=40, fill=(24, 24, 34, 255), outline=color, width=6)
        img.paste(card, (60, 260), card)

        # Item image or emoji
        item_img = None
        if image:
            try:
                base = Path(__file__).parent / "static"
                p = base / image.lstrip("/")
                if p.exists():
                    item_img = Image.open(p).convert("RGBA")
                    ratio = min(480 / item_img.width, 480 / item_img.height)
                    item_img = item_img.resize((int(item_img.width * ratio), int(item_img.height * ratio)))
            except Exception:
                item_img = None
        if item_img:
            img.paste(item_img, (W // 2 - item_img.width // 2, 330), item_img)
        else:
            draw.text((W // 2 - 120, 430), icon, font=_font(220), anchor="mm")

        # Item name
        draw.text((60, 980), item_name, font=font_big, fill="#ffffff", anchor="mm")

        # Rarity
        draw.text((60, 1100), rarity.upper(), font=font_mid, fill=color, anchor="mm")

        # Footer
        draw.text((60, 1220), "TeamFinder · найди тиммейтов", font=font_small, fill="#9ca3af", anchor="mm")

        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        logging.warning(f"[share_image] failed: {e}")
        return None


async def handle_nexus_cases_history(request: web.Request):
    """История открытий юзера (последние 20) с именами предметов."""
    db: Database = request.app["db"]
    user = _get_user(request)
    rows = await db.pool.fetch(
        """
        SELECT co.case_id, co.opened_at, co.item_key
        FROM case_opens co
        WHERE co.user_id = $1
        ORDER BY co.opened_at DESC, co.id DESC
        LIMIT 20
        """,
        user["id"],
    )
    items_map: dict[str, dict] = {}
    for cfg in CASES_CONFIG.values():
        for it in cfg["items"]:
            items_map[it["key"]] = it
    history = []
    for r in rows:
        item = items_map.get(r["item_key"]) or {}
        case = CASES_CONFIG.get(r["case_id"]) or {}
        history.append({
            "case_id": r["case_id"],
            "case_name": case.get("name") or "Nexus",
            "opened_at": r["opened_at"],
            "item_key": r["item_key"],
            "item_name": item.get("name") or r["item_key"],
            "rarity": item.get("rarity") or "common",
            "image": item.get("image"),
            "icon": item.get("icon"),
            "kind": item.get("kind", "inventory"),
        })
    return web.json_response({"history": history})


async def handle_nexus_inventory(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    inventory = await db.get_inventory(user["id"])
    return web.json_response({"inventory": inventory})


async def handle_nexus_sell(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "bad request"}, status=400)

    item_key = body.get("item_key")
    if isinstance(item_key, str) and item_key:
        count = int(body.get("count") or 1)
        sold, coins = await db.sell_inventory_batch(user["id"], item_key, count)
        return web.json_response({"sold": sold, "coins": coins})

    item_id = body.get("item_id")
    if not item_id or not isinstance(item_id, int):
        return web.json_response({"error": "invalid item_id"}, status=400)

    inventory = await db.get_inventory(user["id"])
    item = next((i for i in inventory if i["id"] == item_id), None)
    if not item:
        return web.json_response({"error": "item not found"}, status=400)

    # Transaction: remove item and add coins atomically
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "DELETE FROM user_inventory WHERE id = $1 AND user_id = $2",
                item_id, user["id"],
            )
            if result != "DELETE 1":
                return web.json_response({"error": "failed to sell"}, status=400)
            await conn.execute(
                """
                INSERT INTO user_currency (user_id, coins, stars, points, updated_at)
                VALUES ($1, $2, 0, 0, $3)
                ON CONFLICT (user_id) DO UPDATE SET
                    coins = user_currency.coins + $2,
                    updated_at = $3
                """,
                user["id"], item["sell_price"], datetime.utcnow().isoformat(),
            )
    return web.json_response({"sold": True, "coins": item["sell_price"]})


async def handle_nexus_quests(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    progress = await db.get_all_quests_progress(user["id"])
    progress_by_quest = {p["quest_id"]: p for p in progress}
    quests = []
    for q in QUESTS_CONFIG:
        entry = dict(q)
        p = progress_by_quest.get(q["id"])
        if p:
            entry["progress"] = p["progress_minutes"]
            entry["completed"] = bool(p["completed"])
        else:
            entry["progress"] = 0
            entry["completed"] = False
        entry["target"] = q["target"]
        quests.append(entry)
    return web.json_response({"quests": quests})


async def handle_nexus_claim_quest_reward(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    quest_id = body.get("quest_id")
    if not quest_id:
        return web.json_response({"error": "quest_id required"}, status=400)
    quest_config = next((q for q in QUESTS_CONFIG if q["id"] == quest_id), None)
    if not quest_config:
        return web.json_response({"error": "unknown quest"}, status=400)
    progress = await db.get_all_quests_progress(user["id"])
    prog = next((p for p in progress if p["quest_id"] == quest_id), None)
    if not prog or prog["progress_minutes"] < quest_config["target"]:
        return web.json_response({"error": "quest not completed"}, status=400)
    if prog["completed"]:
        return web.json_response({"error": "already claimed"}, status=400)
    await db.adjust_currency(user["id"], stars=quest_config["rewardStars"])
    await db.complete_quest(user["id"], prog["id"])
    return web.json_response({"ok": True, "stars": quest_config["rewardStars"]})


async def handle_nexus_shop(request: web.Request):
    return web.json_response({"shop": COIN_SHOP})


async def handle_nexus_ad_state(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    state = await db.get_ad_watch_state(user["id"])
    return web.json_response(state)


async def handle_nexus_ad_watch(request: web.Request):
    """Клиент засчитывает просмотр рекламы после показа. Сервер ведёт счётчик
    и выдаёт достижение «15 реклам → +20 ⭐» один раз."""
    db: Database = request.app["db"]
    user = _get_user(request)
    state = await db.record_ad_watch(user["id"])
    return web.json_response(state)


async def handle_nexus_buy(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    item_key = body.get("item_key")

    if not item_key or not isinstance(item_key, str):
        return web.json_response({"error": "invalid item_key"}, status=400)

    shop_item = next((i for i in COIN_SHOP if i["key"] == item_key), None)
    if not shop_item:
        return web.json_response({"error": "item not found"}, status=400)

    item_map = {
        "buy-premium-card": {"key": "premium-card", "name": "Премиум-анкета", "rarity": "premium", "sell": 200, "premium": True},
        "buy-premium-lite": {"key": "premium-card-lite", "name": "Премиум", "rarity": "epic", "sell": 90, "premium": True},
        "buy-ak47": {"key": "ak47", "name": "Скин AK-47", "rarity": "rare", "sell": 35, "premium": False},
        "buy-premium-medium": {"key": "premium-medium", "name": "Премиум средний", "rarity": "epic", "sell": 75, "premium": True},
    }

    item_data = item_map.get(item_key)
    if not item_data:
        return web.json_response({"error": "unknown item"}, status=400)

    # Transaction: deduct coins, add item/decor, grant premium
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT coins FROM user_currency WHERE user_id = $1 FOR UPDATE",
                user["id"],
            )
            current_coins = row["coins"] if row else 0
            if current_coins < shop_item["price"]:
                return web.json_response({"error": "not enough coins"}, status=400)
            await conn.execute(
                "UPDATE user_currency SET coins = coins - $1, updated_at = $2 WHERE user_id = $3",
                shop_item["price"], datetime.utcnow().isoformat(), user["id"],
            )

            await conn.execute(
                """
                INSERT INTO user_inventory (user_id, item_key, item_name, item_rarity, sell_price, grants_premium, acquired_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                user["id"], item_data["key"], item_data["name"], item_data["rarity"],
                item_data["sell"], int(item_data["premium"]), datetime.utcnow().isoformat(),
            )
            if item_data["premium"]:
                until = (datetime.utcnow() + timedelta(days=1)).isoformat()
                await conn.execute(
                    "UPDATE users SET pro_until = $1 WHERE user_id = $2",
                    until, user["id"],
                )

    return web.json_response({"bought": True, "item": item_data})


async def handle_battlepass(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    bp = await db.get_battlepass(user["id"])
    return web.json_response({"tiers": BATTLE_PASS_TIERS, "state": bp})


async def handle_battlepass_buy(request: web.Request):
    logging.info(f"[DEBUG] handle_battlepass_buy called, init_data in request: {'init_data' in request}")
    db: Database = request.app["db"]
    user = _get_user(request)
    logging.info(f"[DEBUG] handle_battlepass_buy user: {user.get('id') if user else None}")
    ok = await db.buy_battlepass_premium(user["id"], BATTLE_PASS_PRICE_STARS)
    if not ok:
        return web.json_response({"error": "already premium or not enough stars"}, status=400)
    return web.json_response({"ok": True, "state": await db.get_battlepass(user["id"])})


async def handle_battlepass_claim_tier(request: web.Request):
    logging.info(f"[DEBUG] handle_battlepass_claim_tier called, init_data in request: {'init_data' in request}")
    db: Database = request.app["db"]
    user = _get_user(request)
    logging.info(f"[DEBUG] handle_battlepass_claim_tier user: {user.get('id') if user else None}")
    body = await request.json()
    tier_key = body.get("tier_key")
    if not tier_key or not isinstance(tier_key, str):
        return web.json_response({"error": "invalid tier_key"}, status=400)

    tier = None
    is_premium = False
    for t in BATTLE_PASS_TIERS:
        if t["free"] and t["free"]["key"] == tier_key:
            tier = t
            break
        if t["premium"]["key"] == tier_key:
            tier = t
            is_premium = True
            break
    if not tier:
        return web.json_response({"error": "tier not found"}, status=404)

    ok = await db.claim_battlepass_tier(user["id"], tier, is_premium)
    if not ok:
        return web.json_response({"error": "cannot claim tier"}, status=400)
    return web.json_response({"ok": True, "state": await db.get_battlepass(user["id"])})


async def handle_battlepass_claim_next(request: web.Request):
    logging.info(f"[DEBUG] handle_battlepass_claim_next called, init_data in request: {'init_data' in request}")
    db: Database = request.app["db"]
    user = _get_user(request)
    logging.info(f"[DEBUG] handle_battlepass_claim_next user: {user.get('id') if user else None}")
    result = await db.claim_next_battlepass_tier(user["id"])
    if not result["ok"]:
        return web.json_response({"error": result["error"]}, status=400)
    return web.json_response({
        "ok": True,
        "tierLevel": result["tier"]["level"],
        "state": await db.get_battlepass(user["id"]),
    })


async def handle_nexus_exchange(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    pack_id = body.get("pack_id")

    pack = next((p for p in COIN_PACKS if p["id"] == pack_id), None)
    if not pack:
        return web.json_response({"error": "unknown pack"}, status=400)

    now = datetime.utcnow().isoformat()
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT stars FROM user_currency WHERE user_id = $1 FOR UPDATE",
                user["id"],
            )
            current_stars = row["stars"] if row else 0
            if current_stars < pack["stars"]:
                return web.json_response({"error": "not enough stars"}, status=400)
            await conn.execute(
                """
                INSERT INTO user_currency (user_id, coins, stars, points, updated_at)
                VALUES ($1, $2, $3, 0, $4)
                ON CONFLICT (user_id) DO UPDATE SET
                    coins = user_currency.coins + $2,
                    stars = user_currency.stars + $3,
                    updated_at = $4
                """,
                user["id"], pack["coins"], -pack["stars"], now,
            )

    ip = _client_ip(request)
    await db.audit_log(user["id"], "exchange", f"pack={pack_id} coins=+{pack['coins']} stars=-{pack['stars']}", ip)
    return web.json_response({"ok": True, "pack": pack})


async def handle_nexus_spend_stars(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    amount = body.get("amount", 0)

    if not isinstance(amount, int) or amount <= 0 or amount > 10000:
        return web.json_response({"error": "invalid amount"}, status=400)

    if not await db.adjust_currency(user["id"], stars=-amount):
        return web.json_response({"error": "not enough stars"}, status=400)

    return web.json_response({"ok": True})


async def handle_nexus_unlock_contact(request: web.Request):
    """Бесплатное открытие анкеты (контакта) игрока.

    Использует баланс free_contact_opens (приветственный бонус и т.п.).
    Если бесплатных открытий нет — возвращает ошибку, клиент фолбэком
    списывает звёзды как раньше.
    """
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    try:
        target_user_id = int(body.get("user_id") or 0)
    except (TypeError, ValueError):
        target_user_id = 0
    if target_user_id <= 0:
        return web.json_response({"error": "user_id required"}, status=400)

    async with db.pool.acquire() as conn:
        profile = await conn.fetchrow(
            "SELECT id FROM profiles WHERE user_id = $1 AND is_active = 1 ORDER BY updated_at DESC LIMIT 1",
            target_user_id,
        )
        if not profile:
            return web.json_response({"error": "profile not found"}, status=404)
        profile_id = profile["id"]
        if await conn.fetchrow(
            "SELECT 1 FROM contact_unlocks WHERE user_id = $1 AND profile_id = $2",
            user["id"], profile_id,
        ):
            return web.json_response({"error": "already unlocked"}, status=400)
        async with conn.transaction():
            used = await db.consume_free_contact_open(user["id"], conn)
            if not used:
                return web.json_response({"error": "no free contact opens"}, status=400)
            await db.unlock_contact(user["id"], profile_id)

    return web.json_response({"ok": True, "used_free": True})


async def handle_nexus_buy_star_pack(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    pack_id = body.get("pack_id")

    pack = STAR_PACKS.get(pack_id)
    if not pack:
        return web.json_response({"error": "unknown pack"}, status=400)

    cost = pack["stars"]
    profile = await db.get_profile(user["id"])
    game = profile["game"] if profile else "cs2"

    async with db.pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT stars FROM user_currency WHERE user_id = $1 FOR UPDATE",
                user["id"],
            )
            current = row["stars"] if row else 0
            if current < cost:
                return web.json_response({"error": "not enough stars"}, status=400)
            await conn.execute(
                "UPDATE user_currency SET stars = stars - $1, updated_at = $2 WHERE user_id = $3",
                cost, datetime.utcnow().isoformat(), user["id"],
            )

    # Apply pack benefits
    if pack_id == "p1":
        await db.highlight_profile(user["id"], hours=24)
    elif pack_id == "p2":
        await db.set_pro_status(user["id"], days=7)
        await db.add_search_boost(user["id"], game, uses=10)
    elif pack_id == "p3":
        await db.set_pro_status(user["id"], days=30)
    elif pack_id == "p4":
        await db.set_pro_status(user["id"], days=30)
        await db.highlight_profile(user["id"], hours=72)

    ip = _client_ip(request)
    await db.audit_log(user["id"], "buy_star_pack", f"pack={pack_id} cost={cost}", ip)
    return web.json_response({"ok": True})


async def handle_nexus_model_state(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    return web.json_response(await db.get_limited_models_state(user["id"]))


async def handle_nexus_model_history(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    models = await db.get_limited_model_history()
    return web.json_response({"models": models})


async def handle_nexus_transfer_stars(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    to_user_id = body.get("to_user_id")
    amount = body.get("amount")
    if not isinstance(to_user_id, int) or not isinstance(amount, int) or amount <= 0:
        return web.json_response({"error": "invalid params"}, status=400)
    if to_user_id == user["id"]:
        return web.json_response({"error": "cannot send to self"}, status=400)
    if amount > 100000:
        return web.json_response({"error": "amount too large"}, status=400)
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval("SELECT 1 FROM users WHERE user_id = $1", to_user_id)
            if not exists:
                return web.json_response({"error": "user not found"}, status=404)
            if not await db._adjust_currency_conn(conn, user["id"], stars=-amount):
                return web.json_response({"error": "not enough stars"}, status=400)
            await db._adjust_currency_conn(conn, to_user_id, stars=amount)
    return web.json_response({"ok": True})


async def handle_nexus_model_list(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    token_id = body.get("token_id")
    price = body.get("price", 0)
    if not isinstance(token_id, int) or not isinstance(price, int) or price <= 0:
        return web.json_response({"error": "invalid price"}, status=400)
    if not await db.list_limited_model(user["id"], token_id, price):
        return web.json_response({"error": "not owner"}, status=400)
    return web.json_response({"ok": True})


async def handle_nexus_model_unlist(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    token_id = body.get("token_id")
    if not isinstance(token_id, int):
        return web.json_response({"error": "invalid token_id"}, status=400)
    if not await db.unlist_limited_model(user["id"], token_id):
        return web.json_response({"error": "not owner"}, status=400)
    return web.json_response({"ok": True})


async def handle_nexus_model_buy(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    token_id = body.get("token_id")
    if not isinstance(token_id, int):
        return web.json_response({"error": "invalid token_id"}, status=400)
    settings = request.app.get("settings")
    dev_id = settings.admin_ids[0] if settings and settings.admin_ids else None
    ok, err, price = await db.buy_limited_model(user["id"], token_id, dev_id)
    if not ok:
        return web.json_response({"error": err}, status=400)
    return web.json_response({"ok": True, "price": price})


async def handle_nexus_model_transfer(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    token_id = body.get("token_id")
    to_user_id = body.get("to_user_id")
    if not isinstance(token_id, int) or not isinstance(to_user_id, int) or to_user_id <= 0:
        return web.json_response({"error": "invalid recipient"}, status=400)
    settings = request.app.get("settings")
    dev_id = settings.admin_ids[0] if settings and settings.admin_ids else None
    ok, err = await db.transfer_limited_model(user["id"], to_user_id, token_id, dev_id)
    if not ok:
        return web.json_response({"error": err}, status=400)
    return web.json_response({"ok": True})


async def handle_nexus_model_sell(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    token_id = body.get("token_id")
    if not isinstance(token_id, int):
        return web.json_response({"error": "invalid token_id"}, status=400)
    ok, err, price = await db.sell_limited_model(user["id"], token_id)
    if not ok:
        return web.json_response({"error": err}, status=400)
    return web.json_response({"ok": True, "price": price})


# Ежедневный доход владельцам лимитированной 3D-модели (50-100 ⭐ в сутки).
MODEL_INCOME_TICK = 3600


async def _model_income_loop(app: web.Application) -> None:
    while True:
        try:
            paid = await app["db"].pay_limited_model_income()
            if paid:
                logging.info("[MODEL] daily income paid to %d limited model(s)", paid)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("[MODEL] income tick failed")
        await asyncio.sleep(MODEL_INCOME_TICK)


async def _start_model_income(app: web.Application) -> None:
    app["model_income_task"] = asyncio.create_task(_model_income_loop(app))


async def _stop_model_income(app: web.Application) -> None:
    task = app.get("model_income_task")
    if task:
        task.cancel()
        try:
            await task
        except Exception:
            pass



async def handle_promo_list(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    data = await db.get_promo_codes_with_redemption(user["id"])
    return web.json_response(data)


async def handle_promo_redeem(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    if len(code) < 3:
        return web.json_response({"error": "code too short"}, status=400)

    reward = await db.redeem_promo_code(user["id"], code)
    if not reward:
        return web.json_response({"error": "invalid, used or expired code"}, status=400)

    return web.json_response({"ok": True, "reward": reward})


async def handle_promo_create(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    reward = body.get("reward")
    max_uses = body.get("max_uses", 10)

    if len(code) < 3:
        return web.json_response({"error": "code too short"}, status=400)
    if not isinstance(reward, dict) or "coins" not in reward:
        return web.json_response({"error": "invalid reward"}, status=400)
    if not isinstance(max_uses, int) or max_uses < 1 or max_uses > 1000:
        return web.json_response({"error": "invalid max_uses"}, status=400)

    # Abuse limit: 5 promo codes per user per day
    created_today = await db.count_user_created_promos_today(user["id"])
    if created_today >= 5:
        return web.json_response({"error": "daily promo creation limit reached"}, status=429)

    ok = await db.create_promo_code(code, reward, max_uses, user["id"])
    if not ok:
        return web.json_response({"error": "code already exists"}, status=400)

    ip = _client_ip(request)
    await db.audit_log(user["id"], "promo_create", f"code={code} reward={reward} max_uses={max_uses}", ip)
    return web.json_response({"ok": True, "code": code})


async def handle_referral(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    referral = await db.get_or_create_referral(user["id"])
    return web.json_response({"referral": referral})


async def handle_referral_claim(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    if not code:
        return web.json_response({"error": "code required"}, status=400)

    referrer = await db.get_or_create_referral(user["id"])
    if referrer["referral_code"] == code:
        return web.json_response({"error": "cannot invite yourself"}, status=400)

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT user_id FROM referrals WHERE referral_code = $1", code)
    if not row:
        return web.json_response({"error": "invalid referral code"}, status=400)

    referrer_user_id = row["user_id"]
    if referrer_user_id == user["id"]:
        return web.json_response({"error": "cannot invite yourself"}, status=400)

    ok = await db.claim_referral_reward(referrer_user_id, user["id"], REFERRAL_REWARD)
    if not ok:
        return web.json_response({"error": "referral reward already claimed"}, status=400)

    # Инвайт-лестница: скин за приглашённых друзей (выдаёт ступень, если достигнут порог)
    granted = None
    try:
        granted = await db.claim_referral_ladder(referrer_user_id, REFERRAL_LADDER)
    except Exception as e:
        logging.warning(f"[referral] ladder claim failed: {e}")

    return web.json_response({"ok": True, "reward": REFERRAL_REWARD, "ladder_granted": granted})


async def handle_streak_claim(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    result = await db.claim_daily_streak(user["id"], DAILY_STREAK_REWARDS)
    if not result["ok"]:
        return web.json_response({"error": result["error"]}, status=400)
    return web.json_response(result)


async def handle_achievements(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    rows = await db.get_user_achievements(user["id"])
    return web.json_response({"achievements": rows})


async def handle_achievements_recent(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    rows = await db.get_user_achievements(user["id"])
    claimed = [r for r in rows if r["claimed"]]
    claimed.sort(key=lambda r: r["claimed_at"] or "", reverse=True)
    return web.json_response([
        {"id": r["achievement_id"], "title": r["achievement_id"], "game": "", "icon": "🏆", "unlockedAt": (r["claimed_at"] or "")[:10]}
        for r in claimed[:10]
    ])


async def handle_achievements_claim(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    achievement_id = body.get("achievement_id")
    points = body.get("points", 0)
    coins = body.get("coins", 0)

    if not achievement_id or not isinstance(achievement_id, str):
        return web.json_response({"error": "invalid achievement_id"}, status=400)
    if not isinstance(points, int) or not isinstance(coins, int) or points < 0 or coins < 0:
        return web.json_response({"error": "invalid reward values"}, status=400)

    ok = await db.claim_achievement(user["id"], achievement_id, points, coins)
    if not ok:
        return web.json_response({"error": "already claimed or failed"}, status=400)

    return web.json_response({"ok": True})


# ---------------------------------------------------------------------------
# Chat API
# ---------------------------------------------------------------------------

async def handle_chat_list(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    # Кэшируем список чатов на 5с — он общий для всех poll-запросов одного юзера.
    cached = await cache_get(f"chat_list:{user['id']}")
    if cached is not None:
        chats = cached.get("chats", [])
    else:
        chats = await db.get_user_chats(user["id"])
        await cache_set(f"chat_list:{user['id']}", {"chats": chats}, 5)
    settings = request.app.get("settings")
    admin_ids = set(settings.admin_ids) if settings else set()
    for c in chats:
        if isinstance(c.get("other_id"), int) and c["other_id"] in admin_ids:
            c["other_role"] = "developer"
    return web.json_response({"chats": chats})


async def handle_chat_messages(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    await db.mark_chat_read(chat_id, user["id"])
    # Кэшируем сообщения на 3с — убирает дублирующие SQL при поллинге.
    cache_key = f"chat_msgs:{chat_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        messages = cached.get("messages", [])
    else:
        messages = await db.get_chat_messages(chat_id)
        await cache_set(cache_key, {"messages": messages}, 3)
    for msg in messages:
        if msg.get("sender_id") == user["id"]:
            msg["sender_id"] = "me"
    status = await db.get_chat_status(chat_id, user["id"])
    return web.json_response({"messages": messages, "status": status})


async def handle_chat_send(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    status = await db.get_chat_status(chat_id, user["id"])
    if status["blocked"]:
        return web.json_response({"error": "blocked"}, status=403)
    body = await request.json()
    text = sanitize(body.get("text", ""), 500)
    if not text:
        return web.json_response({"error": "empty message"}, status=400)
    await db.mark_chat_read(chat_id, user["id"])
    msg = await db.send_message(chat_id, user["id"], text)
    # Сбрасываем кэш сообщений — чтобы poller сразу получил новое сообщение.
    await cache_delete_pattern(f"chat_msgs:{chat_id}")
    return web.json_response({"message": msg})


async def handle_chat_clear(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    await db.clear_chat(chat_id)
    return web.json_response({"ok": True})


async def handle_chat_block(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    status = await db.get_chat_status(chat_id, user["id"])
    if status["other_id"] is not None:
        await db.block_user(user["id"], status["other_id"])
    return web.json_response({"ok": True})


async def handle_chat_unblock(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    status = await db.get_chat_status(chat_id, user["id"])
    if status["other_id"] is not None:
        await db.unblock_user(user["id"], status["other_id"])
    return web.json_response({"ok": True})


async def handle_chat_mute(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    await db.mute_chat(user["id"], chat_id)
    return web.json_response({"ok": True})


async def handle_chat_unmute(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    await db.unmute_chat(user["id"], chat_id)
    return web.json_response({"ok": True})


# ---------------------------------------------------------------------------
# Roles & moderation helpers
# ---------------------------------------------------------------------------

# Отдельный лимит на отправку в глобальный чат (против спама поверх общего 120/мин)
GLOBAL_SEND_LIMIT = 10   # сообщений
GLOBAL_SEND_WINDOW = 60  # секунд


def _is_developer(request: web.Request, user_id: int) -> bool:
    settings = request.app.get("settings")
    return bool(settings and user_id in settings.admin_ids)


async def _effective_role(request: web.Request, db: Database, user_id: int) -> str:
    """developer (from bot ADMIN_IDS) > admin > moderator."""
    if _is_developer(request, user_id):
        return "developer"
    return await db.get_role(user_id)


async def _effective_is_beta(request: web.Request, db: Database, user_id: int) -> bool:
    """Разработчик (bot ADMIN_IDS) автоматически получает бонусы бета-тестера:
    ежедневные 200 кейсов + 10 000 ⭐, безлимитный поиск, бесплатный gold-кейс."""
    return await db.get_beta(user_id) or _is_developer(request, user_id)


async def handle_global_messages(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    # Кэшируем сообщения на 3с — они общие для всех пользователей.
    cached = await cache_get("global_chat_msgs")
    if cached is not None:
        messages = cached.get("messages", [])
    else:
        messages = await db.get_global_messages(50)
        await cache_set("global_chat_msgs", {"messages": messages}, 3)
    settings = request.app.get("settings")
    admin_ids = set(settings.admin_ids) if settings else set()
    for msg in messages:
        uid = msg.get("user_id")
        if uid == user["id"]:
            msg["user_id"] = "me"
        if isinstance(uid, int) and uid in admin_ids:
            msg["role"] = "developer"
    role = await _effective_role(request, db, user["id"])
    banned = await db.is_globally_banned(user["id"])
    return web.json_response({"messages": messages, "me_role": role, "me_banned": banned})


async def handle_global_send(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if await db.is_globally_banned(user["id"]):
        return web.json_response({"error": "banned"}, status=403)
    if await rate_limit_check(f"gsend:{user['id']}", GLOBAL_SEND_LIMIT, GLOBAL_SEND_WINDOW):
        return web.json_response({"error": "slow down"}, status=429)
    body = await request.json()
    text = sanitize(body.get("text", ""), 500)
    if not text:
        return web.json_response({"error": "empty message"}, status=400)
    msg = await db.send_global_message(user["id"], text)
    msg["user_id"] = "me"
    # Сбрасываем кэш глобальных сообщений — чтобы poller сразу видел новое.
    await cache_delete_pattern("global_chat_msgs")
    return web.json_response({"message": msg})


async def handle_global_delete(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    role = await _effective_role(request, db, user["id"])
    if db.ROLE_RANK.get(role, 0) < 1:
        return web.json_response({"error": "forbidden"}, status=403)
    body = await request.json()
    try:
        message_id = int(body.get("message_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid message_id"}, status=400)
    author_id = await db.get_global_message_author(message_id)
    if author_id is None:
        return web.json_response({"error": "not found"}, status=404)
    if author_id != user["id"]:
        author_role = await _effective_role(request, db, author_id)
        if db.ROLE_RANK.get(author_role, 0) >= db.ROLE_RANK.get(role, 0):
            return web.json_response({"error": "cannot delete same or higher role"}, status=403)
    await db.delete_global_message(message_id)
    return web.json_response({"ok": True})


async def handle_global_ban(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    role = await _effective_role(request, db, user["id"])
    if db.ROLE_RANK.get(role, 0) < 2:
        logging.info("[BAN] admin=%s denied (role=%r too low)", user["id"], role)
        return web.json_response({"error": "forbidden"}, status=403)
    body = await request.json()
    try:
        target_id = int(body.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    if _is_developer(request, target_id):
        logging.info("[BAN] admin=%s target=%s denied (target is developer)", user["id"], target_id)
        return web.json_response({"error": "cannot ban developer"}, status=403)
    target_role = await db.get_role(target_id)
    if db.ROLE_RANK.get(target_role, 0) >= db.ROLE_RANK.get(role, 0):
        logging.info("[BAN] admin=%s target=%s denied (target role %r >= mine %r)", user["id"], target_id, target_role, role)
        return web.json_response({"error": "cannot ban same or higher role"}, status=403)
    reason = sanitize(body.get("reason", ""), 200)
    if not reason:
        reason = "Без причины"
    duration = int(body.get("duration", 0) or 0)
    allowed_durations = (0, 24 * 3600, 7 * 24 * 3600, 30 * 24 * 3600)
    if duration not in allowed_durations:
        return web.json_response({"error": "invalid duration"}, status=400)
    expires_at = ""
    if duration > 0:
        expires_at = (datetime.utcnow() + timedelta(seconds=duration)).isoformat()
    await db.ban_global(target_id, user["id"], reason, expires_at)
    logging.info("[BAN] admin=%s target=%s reason=%r duration=%s OK expires=%s", user["id"], target_id, reason, duration, expires_at)
    return web.json_response({"ok": True, "expires_at": expires_at})


async def handle_global_unban(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    role = await _effective_role(request, db, user["id"])
    if db.ROLE_RANK.get(role, 0) < 2:
        return web.json_response({"error": "forbidden"}, status=403)
    body = await request.json()
    try:
        target_id = int(body.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    await db.unban_global(target_id)
    return web.json_response({"ok": True})


async def handle_admin_role(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not _is_developer(request, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    body = await request.json()
    try:
        target_id = int(body.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    # Staff role (moderator/admin/developer or empty to clear)
    role = (body.get("role") or "").strip()
    allowed_roles = {"admin", "moderator", "developer"}
    if role and role not in allowed_roles:
        return web.json_response({"error": "invalid role"}, status=400)
    # Beta flag (independent from staff role)
    beta = body.get("beta")
    if beta is not None:
        if not isinstance(beta, bool):
            return web.json_response({"error": "beta must be boolean"}, status=400)
        await db.set_beta(target_id, beta, user["id"])
    if role:
        await db.set_role(target_id, role, user["id"])
    elif role == "":
        # Explicit clear of staff role (keep beta flag)
        await db.set_role(target_id, "", user["id"])
    return web.json_response({"ok": True})


async def handle_admin_users(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not _is_developer(request, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    query = request.query.get("q", "").strip().lower()
    users = await db.search_users_with_roles(query or "%", 30)
    return web.json_response({"users": users})


async def handle_admin_tg_profile(request: web.Request):
    """Developer-only: get_chat(user_id) → карточка (имя/фамилия/username/био)
    в ЛС админу + пересылка последнего сообщения юзера (forward_message)."""
    db: Database = request.app["db"]
    user = _get_user(request)
    if not user or not _is_developer(request, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    try:
        target_id = int(request.match_info.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    bot = request.app.get("bot")
    if not bot:
        return web.json_response({"error": "bot not ready"}, status=503)
    admin_id = user["id"]

    try:
        chat = await bot.get_chat(target_id)
    except Exception as e:
        logging.warning("[ADMIN] get_chat(%s) failed: %s", target_id, e)
        return web.json_response({"ok": False, "error": f"get_chat: {e}"})

    first = chat.first_name or ""
    last = chat.last_name or ""
    username = chat.username or ""
    bio = (getattr(chat, "bio", None) or "").strip()

    name_line = "👤 <b>Имя:</b> " + html.escape((first + " " + last).strip() or "—")
    username_line = "📛 <b>Username:</b> " + ("@" + html.escape(username) if username else "—")
    bio_line = "📝 <b>Био:</b> " + (html.escape(bio) if bio else "—")
    card = "\n".join([
        "👤 <b>Карточка пользователя</b>",
        "",
        f"🆔 <b>ID:</b> <code>{target_id}</code>",
        name_line,
        username_line,
        bio_line,
    ])

    # 1) Карточка в ЛС админу
    try:
        await bot.send_message(admin_id, card)
    except Exception as e:
        logging.warning("[ADMIN] send card to %s failed: %s", admin_id, e)
        return web.json_response({"ok": False, "error": f"send_message: {e}"})

    # 2) Пересылка последнего сообщения юзера — кликабельное имя для перехода в профиль
    forwarded = False
    last = await db.get_last_message(target_id)
    if last:
        try:
            await bot.forward_message(admin_id, from_chat_id=last["chat_id"], message_id=last["message_id"])
            forwarded = True
        except Exception as e:
            logging.warning("[ADMIN] forward_message for %s failed: %s", target_id, e)

    return web.json_response({"ok": True, "forwarded": forwarded, "username": username})


# ---------------------------------------------------------------------------
# Reviews (отзывы о боте)
# ---------------------------------------------------------------------------

async def handle_review_submit(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    try:
        rating = int(body.get("rating", 0))
    except (ValueError, TypeError):
        rating = 0
    if not 1 <= rating <= 5:
        return web.json_response({"error": "invalid rating"}, status=400)
    text = sanitize(body.get("text", ""), 2000)
    pros = sanitize(body.get("pros", ""), 1000)
    cons = sanitize(body.get("cons", ""), 1000)
    review = await db.submit_review(user["id"], rating, text, pros, cons)
    return web.json_response({"review": review})


async def handle_review_my(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    review = await db.get_my_review(user["id"])
    return web.json_response({"review": review})


async def handle_reviews_list(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    review = await db.get_my_review(user["id"])
    all_reviews = await db.get_reviews(100)
    return web.json_response({"reviews": all_reviews, "my": review})


# ---------------------------------------------------------------------------
# Friends API
# ---------------------------------------------------------------------------

async def handle_translate(request: web.Request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    text = (data.get("text") or "").strip()
    target = (data.get("target") or "en").strip()
    if not text:
        return web.json_response({"error": "empty text"}, status=400)
    try:
        url = ("https://translate.googleapis.com/translate_a/single"
               "?client=gtx&sl=auto&tl=" + target + "&dt=t&q=" + quote(text))
        async with request.app["session"].get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=ClientTimeout(total=10)) as resp:
            result = await resp.json()
            translated = "".join(part[0] for part in result[0] if part[0])
            return web.json_response({"translated": translated})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)

async def handle_user_search(request: web.Request):
    db: Database = request.app["db"]
    query = request.query.get("q", "").strip().lower()
    if not query or len(query) < 2:
        return web.json_response({"users": []})
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT u.user_id, mp.nick, mp.avatar
               FROM users u
               LEFT JOIN mini_app_profiles mp ON mp.user_id = u.user_id
               WHERE (LOWER(u.username) LIKE $1 OR LOWER(mp.nick) LIKE $1) AND mp.nick IS NOT NULL
               LIMIT 20""",
            f"%{query}%",
        )
    return web.json_response({"users": [{"id": r["user_id"], "nick": r["nick"], "avatar": r["avatar"]} for r in rows]})

async def handle_profile_by_id(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    current_id = user["id"] if user else None
    try:
        target_id = int(request.match_info.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    await db.ensure_user(target_id, None, None, None)
    prof = await db.get_mini_app_profile(target_id)
    tg_username = ""
    try:
        urow = await db.pool.fetchrow("SELECT username FROM users WHERE user_id = $1", target_id)
        if urow:
            tg_username = urow["username"] or ""
    except Exception:
        pass
    # Статус дружбы (проверяем обе стороны)
    friend_status = None
    if current_id and current_id != target_id:
        fwd = await db.get_friend_status(current_id, target_id)
        rev = await db.get_friend_status(target_id, current_id)
        if fwd == "accepted" or rev == "accepted":
            friend_status = "accepted"
        elif fwd == "pending":
            friend_status = "outgoing"
        elif rev == "pending":
            friend_status = "incoming"
    return web.json_response({
        "id": target_id,
        "nick": prof.get("nick"),
        "avatar": prof.get("avatar"),
        "bio": prof.get("bio"),
        "tgUsername": tg_username,
        "friend_status": friend_status,
        "role": await _effective_role(request, db, target_id),
    })

async def handle_friend_add(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    friend_id_str = request.match_info.get("user_id")
    try:
        friend_id = int(friend_id_str)
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    if friend_id == user["id"]:
        return web.json_response({"error": "cannot add yourself"}, status=400)
    result = await db.send_friend_request(user["id"], friend_id)
    return web.json_response(result)

async def handle_friend_accept(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        friend_id = int(request.match_info.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    ok = await db.accept_friend_request(user["id"], friend_id)
    if not ok:
        return web.json_response({"error": "no pending request"}, status=400)
    return web.json_response({"ok": True})

async def handle_friend_decline(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        friend_id = int(request.match_info.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    ok = await db.decline_friend_request(user["id"], friend_id)
    return web.json_response({"ok": ok})

async def handle_friend_remove(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    try:
        friend_id = int(request.match_info.get("user_id"))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid user_id"}, status=400)
    ok = await db.remove_friend(user["id"], friend_id)
    return web.json_response({"ok": ok})

async def handle_friend_list(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    friends = await db.get_friends(user["id"])
    return web.json_response({"friends": friends})

async def handle_friend_requests(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    requests = await db.get_friend_requests(user["id"])
    return web.json_response({"requests": requests})

# ---------------------------------------------------------------------------
# Predictions API
# ---------------------------------------------------------------------------

_PRED_TEMPLATES = [
    ("IEM Katowice 2026", "CS2", "NAVI", "FaZe", 1.85, 1.95),
    ("The International", "Dota 2", "Team Spirit", "Gaimin Gladiators", 1.6, 2.35),
    ("VCT Champions", "Valorant", "Sentinels", "Fnatic", 2.1, 1.72),
    ("DreamLeague S24", "Dota 2", "Team Liquid", "OG", 2.2, 1.65),
    ("ESL Pro League", "CS2", "Vitality", "G2", 1.9, 1.9),
    ("LPL Spring", "LoL", "JDG", "BLG", 1.75, 2.05),
    ("BLAST Premier", "CS2", "MOUZ", "Astralis", 2.3, 1.6),
    ("Kings Trophy", "Valorant", "Team Heretics", "KC", 1.55, 2.4),
]

# Матч идёт PRED_MATCH_DURATION_MS после старта, затем автоматически рассчитывается.
PRED_MATCH_DURATION_MS = 15 * 60 * 1000
PRED_TICK_SECONDS = 15

_pred_matches: list[dict] = []
_pred_seq = 0


def _pred_new_match(offset_minutes: int) -> dict:
    global _pred_seq
    tpl = _PRED_TEMPLATES[_pred_seq % len(_PRED_TEMPLATES)]
    _pred_seq += 1
    tournament, discipline, teamA, teamB, oddsA, oddsB = tpl
    return {
        "id": f"m{_pred_seq}",
        "tournament": tournament,
        "discipline": discipline,
        "teamA": teamA,
        "teamB": teamB,
        "startsAt": int((datetime.utcnow() + timedelta(minutes=offset_minutes)).timestamp() * 1000),
        "oddsA": oddsA,
        "oddsB": oddsB,
        "status": "upcoming",
        "winner": None,
    }


def _pred_ensure_matches(min_upcoming: int = 4) -> None:
    """Пополняет список, пока в нём есть хотя бы min_upcoming предстоящих матчей."""
    while sum(1 for m in _pred_matches if m["status"] == "upcoming") < min_upcoming:
        offset = 3 + 25 * len(_pred_matches)
        _pred_matches.append(_pred_new_match(offset))
    # Не копим завершённые матчи бесконечно: держим не больше 30, выкидывая старые finished.
    if len(_pred_matches) > 30:
        drop = len(_pred_matches) - 30
        i = 0
        while drop > 0 and i < len(_pred_matches):
            if _pred_matches[i]["status"] == "finished":
                _pred_matches.pop(i)
                drop -= 1
            else:
                i += 1


def _pred_pick_winner(match: dict) -> str:
    """Случайный исход как у 1xBet: вероятность победы обратно пропорциональна коэффициенту."""
    pa = 1.0 / match["oddsA"]
    pb = 1.0 / match["oddsB"]
    return "A" if random.random() < pa / (pa + pb) else "B"


async def _prediction_tick(app: web.Application) -> None:
    db = app.get("db")
    if not db or not app.get("db_ready"):
        return
    now_ms = int(time() * 1000)
    for match in list(_pred_matches):
        status = match["status"]
        if status == "upcoming" and now_ms >= match["startsAt"]:
            match["status"] = "live"
        elif status == "live" and now_ms >= match["startsAt"] + PRED_MATCH_DURATION_MS:
            winner = _pred_pick_winner(match)
            try:
                result = await db.settle_match_predictions(match["id"], winner)
                logging.info("[PRED] match %s finished winner=%s %s", match["id"], winner, result)
            except Exception:
                logging.exception("[PRED] settle failed match=%s — retry next tick", match["id"])
                continue
            match["status"] = "finished"
            match["winner"] = winner
            _pred_ensure_matches()


async def _prediction_settler(app: web.Application) -> None:
    _pred_ensure_matches()
    while True:
        try:
            await _prediction_tick(app)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("[PRED] prediction tick failed")
        await asyncio.sleep(PRED_TICK_SECONDS)


async def _start_prediction_settler(app: web.Application) -> None:
    app["prediction_task"] = asyncio.create_task(_prediction_settler(app))


async def _stop_prediction_settler(app: web.Application) -> None:
    task = app.get("prediction_task")
    if task:
        task.cancel()
        try:
            await task
        except Exception:
            pass


async def handle_predictions_matches(request: web.Request):
    _pred_ensure_matches()
    return web.json_response({"matches": _pred_matches})


async def handle_predictions_place(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    match_id = body.get("match_id")
    side = body.get("side")
    amount = body.get("amount", 0)

    match = next((m for m in _pred_matches if m["id"] == match_id), None)
    if not match:
        return web.json_response({"error": "match not found"}, status=400)

    if match["status"] != "upcoming" or time() * 1000 >= match["startsAt"]:
        return web.json_response({"error": "match already started"}, status=400)

    if not isinstance(amount, int) or amount <= 0:
        return web.json_response({"error": "invalid amount"}, status=400)

    if side not in ("A", "B"):
        return web.json_response({"error": "invalid side"}, status=400)
    odds = match["oddsA"] if side == "A" else match["oddsB"]
    label = f"{match['teamA']} vs {match['teamB']} · {match['tournament']}"
    team = match["teamA"] if side == "A" else match["teamB"]

    result = await db.place_prediction(user["id"], match_id, side, amount, odds, label, team)
    if not result:
        return web.json_response({"error": "not enough coins"}, status=400)
    return web.json_response({"ok": True, "prediction": result})


async def handle_predictions_history(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    predictions = await db.get_user_predictions(user["id"])
    return web.json_response({"predictions": predictions})


async def handle_pvp_list(request: web.Request):
    db: Database = request.app["db"]
    challenges = await db.get_open_challenges()
    return web.json_response({"challenges": challenges})


async def handle_pvp_create(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    condition = str(body.get("condition", "")).strip()
    stake = body.get("stake", 0)

    if len(condition) < 5:
        return web.json_response({"error": "condition too short"}, status=400)
    if not isinstance(stake, int) or stake <= 0:
        return web.json_response({"error": "invalid stake"}, status=400)

    nick = (await db.get_mini_app_profile(user["id"])).get("nick", f"user_{user['id']}")
    result = await db.create_pvp_challenge(user["id"], nick, condition, stake)
    if not result:
        return web.json_response({"error": "not enough coins"}, status=400)
    # Return in the format frontend expects
    return web.json_response({"ok": True, "challenge": {
        "id": str(result["id"]),
        "creatorId": str(result["creator_id"]),
        "creatorNick": result.get("creator_nick", nick),
        "condition": result["condition"],
        "stake": result["stake"],
        "status": result["status"],
        "createdAt": int(datetime.fromisoformat(result["created_at"]).timestamp() * 1000),
    }})


async def handle_pvp_accept(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    challenge_id = request.match_info["challenge_id"]

    nick = (await db.get_mini_app_profile(user["id"])).get("nick", f"user_{user['id']}")
    ok = await db.accept_pvp_challenge(int(challenge_id), user["id"], nick)
    if not ok:
        return web.json_response({"error": "cannot accept challenge"}, status=400)
    return web.json_response({"ok": True})


async def handle_pvp_resolve(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    challenge_id = request.match_info["challenge_id"]
    body = await request.json()
    winner_id = body.get("winner_id")

    if not winner_id:
        return web.json_response({"error": "winner_id required"}, status=400)
    try:
        ok = await db.resolve_pvp_challenge(int(challenge_id), user["id"], int(winner_id))
    except ValueError:
        return web.json_response({"error": "invalid id"}, status=400)
    if not ok:
        return web.json_response({"error": "cannot resolve challenge"}, status=400)
    return web.json_response({"ok": True})


# ---------------------------------------------------------------------------
# Stats API
# ---------------------------------------------------------------------------

async def handle_stats_overview(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    stats = await db.get_user_stats(user["id"])
    profile = await db.get_profile(user["id"])
    return web.json_response({
        "games": stats["games_played"],
        "wins": stats["wins"],
        "favoriteGame": profile["game"] if profile else "—",
        "searchMinutes": 0,
        "gamesDelta": 0,
        "winsDelta": 0,
        "searchDelta": 0,
    })


async def handle_stats_progress(request: web.Request):
    return web.json_response([])


async def handle_stats_general(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    period = request.query.get("period", "30")
    try:
        days = int(period)
    except ValueError:
        days = 30
    if days not in (1, 7, 30):
        days = 30
    try:
        data = await db.get_general_stats(user["id"], days)
        return web.json_response(data)
    except Exception as e:
        logging.exception("stats/general error for user %s: %s", user["id"], e)
        return web.json_response({"error": "internal error"}, status=500)


async def handle_stats_rank(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    total = await db.pool.fetchval("SELECT COUNT(*) FROM users")
    row = await db.pool.fetchrow(
        "SELECT COUNT(*) AS pos FROM user_currency uc "
        "JOIN users u ON u.user_id = uc.user_id "
        "WHERE uc.coins > (SELECT COALESCE(coins, 0) FROM user_currency WHERE user_id = $1)",
        user["id"],
    )
    position = (row["pos"] if row else 0) + 1
    percentile = round((position / max(total, 1)) * 100)
    return web.json_response({"position": position, "total": total, "percentile": percentile})


async def handle_leaderboard(request: web.Request):
    if _public_rate_limit(request):
        return web.json_response({"error": "rate limit exceeded"}, status=429)
    try:
        limit = max(1, min(int(request.query.get("limit", "10")), 100))
    except (TypeError, ValueError):
        limit = 10
    cache_key = f"leaderboard:{limit}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return web.json_response(cached)
    db: Database = request.app["db"]
    leaderboard = await db.get_leaderboard(limit=limit)
    data = {"leaderboard": leaderboard}
    await cache_set(cache_key, data, CACHE_TTL)
    return web.json_response(data)


# ---------------------------------------------------------------------------
# Discord OAuth
# ---------------------------------------------------------------------------
async def handle_discord_auth(request: web.Request):
    db: Database = request.app["db"]
    settings: Settings = request.app["settings"]
    user = _get_user(request)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)

    if not settings.discord_client_id or not settings.discord_redirect_uri:
        return web.json_response({"error": "Discord not configured"}, status=503)

    # Generate state token and store in oauth_states table with TTL 10 min
    import secrets
    state = secrets.token_urlsafe(32)
    telegram_user_id = user["id"]
    created_at = datetime.utcnow().isoformat()
    try:
        await db.pool.execute(
            """
            INSERT INTO oauth_states (state, telegram_user_id, created_at, used)
            VALUES ($1, $2, $3, 0)
            """,
            state, telegram_user_id, created_at,
        )
    except Exception as e:
        logging.error(f"[discord.auth] Failed to store state: {e}")
        return web.json_response({"error": "internal server error"}, status=500)

    # Build Discord OAuth URL
    params = {
        "client_id": settings.discord_client_id,
        "redirect_uri": settings.discord_redirect_uri,
        "response_type": "code",
        "scope": "identify",
        "state": state,
        "prompt": "consent",
    }
    url = f"https://discord.com/api/oauth2/authorize?{urlencode(params)}"
    logging.info(f"[discord.auth] user={telegram_user_id} state={state[:16]}...")
    return web.json_response({"url": f"https://discord.com/api/oauth2/authorize?{urlencode(params)}"})


async def handle_discord_callback(request: web.Request):
    db: Database = request.app["db"]
    settings: Settings = request.app["settings"]
    code = request.query.get("code")
    state = request.query.get("state")
    error = request.query.get("error")

    logging.info(f"[discord.callback] hit state_present={bool(state)} code_present={bool(code)}")

    if error or not code or not state:
        redirect_url = settings.webapp_url or settings.public_app_url
        reason = error or ("missing_code" if not code else "missing_state")
        logging.warning(f"[discord.callback] early_error reason={reason}")
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason={reason}")
        return web.json_response({"error": f"oauth early failure: {reason}"}, status=400)

    # Lookup state in oauth_states table
    row = await db.pool.fetchrow(
        "SELECT telegram_user_id, used, created_at FROM oauth_states WHERE state = $1",
        state,
    )
    logging.info(f"[discord.callback] state_lookup state={state[:16]}... found_user={row['telegram_user_id'] if row else None} code_present={bool(code)}")

    if not row:
        redirect_url = settings.public_app_url or settings.webapp_url
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason=bad_state")
        return web.json_response({"error": "invalid state"}, status=400)

    if row["used"]:
        redirect_url = settings.public_app_url or settings.webapp_url
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason=bad_state")
        return web.json_response({"error": "state already used"}, status=400)

    # Check TTL (10 minutes)
    created_at = datetime.fromisoformat(row["created_at"])
    if (datetime.utcnow() - created_at).total_seconds() > 600:
        redirect_url = settings.public_app_url or settings.webapp_url
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason=state_expired")
        return web.json_response({"error": "state expired"}, status=400)

    # Mark state as used
    await db.pool.execute("UPDATE oauth_states SET used = 1 WHERE state = $1", state)

    user_id = row["telegram_user_id"]

    # Exchange code for token
    token_data = await exchange_code(settings.discord_client_id, settings.discord_client_secret, settings.discord_redirect_uri, code)
    if not token_data or "access_token" not in token_data:
        logging.error(f"[discord.callback] token_exchange status=failed body={str(token_data)[:300]}")
        redirect_url = settings.public_app_url or settings.webapp_url
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason=token")
        return web.json_response({"error": "token exchange failed"}, status=400)

    logging.info(f"[discord.callback] token_exchange status=200 body={str(token_data)[:300]}")

    # Fetch Discord user
    discord_user = await fetch_discord_user(token_data["access_token"])
    if not discord_user:
        redirect_url = settings.public_app_url or settings.webapp_url
        if redirect_url:
            raise web.HTTPFound(f"{redirect_url}?discord=error&reason=user_fetch")
        return web.json_response({"error": "failed to fetch user"}, status=400)

    avatar = None
    if discord_user.get("avatar"):
        avatar = f"https://cdn.discordapp.com/avatars/{discord_user['id']}/{discord_user['avatar']}.png"

    expires_at = None
    if token_data.get("expires_in"):
        expires_at = datetime.utcfromtimestamp(time() + token_data["expires_in"]).isoformat()

    # UPSERT into discord_links (using existing discord_connections table)
    await db.save_discord_connection(user_id, {
        "discord_id": discord_user["id"],
        "discord_username": discord_user.get("username"),
        "discord_global_name": discord_user.get("global_name"),
        "discord_avatar": avatar,
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", ""),
        "token_expires_at": expires_at,
    })

    # Одноразовая награда за первую связку Discord
    try:
        await db.claim_discord_welcome_reward(user_id)
    except Exception as e:
        logging.warning(f"[discord.callback] welcome_reward failed: {e}")

    logging.info(f"[discord.callback] linked telegram={user_id} discord={discord_user['id']}")

    # Redirect to main fallback
    fallback_redirect = settings.public_app_url or settings.webapp_url
    if fallback_redirect:
        raise web.HTTPFound(f"{fallback_redirect}?discord=ok")
    raise web.HTTPFound("https://t.me/teamfinder_bot?start=discord_ok")


async def handle_discord_status(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)

    conn = await db.get_discord_connection(user["id"])
    if not conn:
        return web.json_response({"linked": False})

    connections = []
    try:
        connections = await fetch_discord_connections(conn["access_token"])
    except Exception as e:
        logging.warning(f"Discord token invalid or expired for user {user['id']}: {e}")
        await db.remove_discord_connection(user["id"])
        return web.json_response({"linked": False})

    welcome_claimed = bool(
        await db.pool.fetchval(
            "SELECT discord_welcome_at FROM users WHERE user_id = $1", user["id"]
        )
    )
    daily_claimed_at = conn.get("last_daily_claim_at")
    daily_ready = True
    if daily_claimed_at:
        last = datetime.fromisoformat(daily_claimed_at)
        daily_ready = (datetime.utcnow() - last).total_seconds() >= 24 * 3600

    return web.json_response({
        "linked": True,
        "discord_id": conn["discord_id"],
        "username": conn["discord_username"],
        "global_name": conn["discord_global_name"],
        "avatar_url": conn["discord_avatar"],
        "linked_at": conn["connected_at"],
        "welcome_claimed": welcome_claimed,
        "daily_ready": daily_ready,
    })


async def handle_discord_unlink(request: web.Request):
    db: Database = request.app["db"]
    settings: Settings = request.app["settings"]
    user = _get_user(request)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)

    conn = await db.get_discord_connection(user["id"])
    if conn:
        try:
            await revoke_token(settings.discord_client_id, settings.discord_client_secret, conn["access_token"])
        except Exception as e:
            logging.warning(f"Discord token revoke failed: {e}")
        await db.remove_discord_connection(user["id"])

    return web.json_response({"ok": True})


async def handle_discord_daily(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    result = await db.claim_discord_daily_reward(user["id"])
    return web.json_response(result)


async def handle_client_error(request: web.Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    message = body.get("message", "")
    stack = body.get("stack", "")
    component_stack = body.get("componentStack", "")
    tab = body.get("tab", "unknown")
    url = body.get("url", "")
    stack_preview = "\n".join(stack.split("\n")[:3]) if stack else "(no stack)"
    logging.error(
        "[CLIENT_ERROR] tab=%s message=%s stack=%s",
        tab, message, stack_preview,
    )
    if component_stack:
        logging.error("[CLIENT_ERROR] componentStack=%s", component_stack[:300])
    if url:
        logging.info("[CLIENT_ERROR] url=%s", url)
    return web.json_response({"ok": True})


def create_app(db: Database, settings: Settings, bot) -> web.Application:
    # Порядок middleware критичен — менять только осознанно:
    # 1. security_middleware     — самый внешний: CSP + security headers на любой ответ (включая ошибки)
    # 2. ip_rate_limit_middleware — per-IP + глобальный RPS на /api/* (до auth, работает и для публичных)
    # 3. error_middleware        — перехватывает все исключения, скрывает стектрейс от клиента
    # 4. auth_middleware         — проверяет X-Telegram-Init-Data, пишет request["init_data"]
    # 5. ban_middleware          — режет все эндпоинты забаненному (кроме /api/me, где статус в теле)
    # 6. active_middleware      — обновляет last_active_at (fire-and-forget) для авторизованных
    # 7. web_rate_limit_middleware — читает user_id из request["init_data"], выставленного auth
    # Если поменять порядок — rate limiter получит init_data=None и вернёт 500.
    # Порядок: security → ip_rate_limit → timing → capacity → db_ready → cors → gzip → cache → error → auth → ban → active → rate_limit
    app = web.Application(middlewares=[security_middleware, ip_rate_limit_middleware, timing_middleware, capacity_middleware, db_ready_middleware, cors_middleware, gzip_middleware, cache_static_middleware, error_middleware, auth_middleware, ban_middleware, active_middleware, web_rate_limit_middleware])
    app["allowed_origins"] = _resolve_allowed_origins(settings)
    app["db"] = db
    app["settings"] = settings
    app["bot"] = bot
    app["session"] = ClientSession()

    app.on_startup.append(lambda _app: init_redis())
    app.on_startup.append(_start_prediction_settler)
    app.on_startup.append(_start_model_income)
    app.on_cleanup.append(lambda _app: close_redis())
    app.on_cleanup.append(_stop_prediction_settler)
    app.on_cleanup.append(_stop_model_income)
    app.on_cleanup.append(lambda _app: _app["session"].close())

    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/games", handle_games)
    app.router.add_get("/api/me", handle_me)
    app.router.add_route("GET", "/api/user/language", handle_user_language)
    app.router.add_route("POST", "/api/user/language", handle_user_language)
    app.router.add_route("GET", "/api/user/consent", handle_user_consent)
    app.router.add_route("POST", "/api/user/consent", handle_user_consent)
    app.router.add_post("/api/user/sync", handle_user_sync)
    app.router.add_post("/api/profile", handle_save_profile)
    app.router.add_post("/api/profile/hide", handle_hide_profile)
    app.router.add_post("/api/profile/customize", handle_customize_profile)
    app.router.add_get("/api/search/count", handle_search_count)
    app.router.add_get("/api/online", handle_online)
    app.router.add_post("/api/client-error", handle_client_error)
    app.router.add_get("/api/search", handle_search)
    app.router.add_get("/api/guides", handle_guides)
    app.router.add_get("/api/guides/{guide_id}", handle_guide_detail)
    app.router.add_post("/api/pay/invoice", handle_create_invoice)
    app.router.add_get("/api/teams", handle_teams)
    app.router.add_post("/api/teams", handle_create_team)
    app.router.add_get("/api/teams/{team_id}/applications", handle_team_applications)
    app.router.add_post("/api/teams/{team_id}/apply", handle_apply_team)
    app.router.add_get("/api/me/applications", handle_user_applications)

    # Nexus Mini App API routes
    app.router.add_get("/api/nexus/balance", handle_nexus_balance)
    app.router.add_get("/api/nexus/cases", handle_nexus_cases)
    app.router.add_post("/api/nexus/cases/open", handle_nexus_open_case)
    app.router.add_get("/api/nexus/cases/history", handle_nexus_cases_history)
    app.router.add_post("/api/nexus/cases/share-image", handle_nexus_share_image)
    app.router.add_get("/api/nexus/inventory", handle_nexus_inventory)
    app.router.add_post("/api/nexus/inventory/sell", handle_nexus_sell)
    app.router.add_get("/api/nexus/quests", handle_nexus_quests)
    app.router.add_post("/api/nexus/quests/claim", handle_nexus_claim_quest_reward)
    app.router.add_get("/api/nexus/shop", handle_nexus_shop)
    app.router.add_post("/api/nexus/shop/buy", handle_nexus_buy)
    app.router.add_post("/api/nexus/exchange", handle_nexus_exchange)
    app.router.add_post("/api/nexus/spend-stars", handle_nexus_spend_stars)
    app.router.add_post("/api/nexus/unlock-contact", handle_nexus_unlock_contact)
    app.router.add_post("/api/nexus/buy-star-pack", handle_nexus_buy_star_pack)
    app.router.add_get("/api/nexus/model/state", handle_nexus_model_state)
    app.router.add_get("/api/nexus/model/history", handle_nexus_model_history)
    app.router.add_post("/api/nexus/transfer-stars", handle_nexus_transfer_stars)
    app.router.add_post("/api/nexus/model/list", handle_nexus_model_list)
    app.router.add_post("/api/nexus/model/unlist", handle_nexus_model_unlist)
    app.router.add_post("/api/nexus/model/buy", handle_nexus_model_buy)
    app.router.add_post("/api/nexus/model/transfer", handle_nexus_model_transfer)
    app.router.add_post("/api/nexus/model/sell", handle_nexus_model_sell)
    app.router.add_get("/api/nexus/ad/state", handle_nexus_ad_state)
    app.router.add_post("/api/nexus/ad/watch", handle_nexus_ad_watch)

    # Battle Pass, Promo, Referral, Streak, Achievements
    app.router.add_get("/api/battlepass", handle_battlepass)
    app.router.add_post("/api/battlepass/buy", handle_battlepass_buy)
    app.router.add_post("/api/battlepass/claim-tier", handle_battlepass_claim_tier)
    app.router.add_post("/api/battlepass/claim-next", handle_battlepass_claim_next)
    app.router.add_get("/api/promo/list", handle_promo_list)
    app.router.add_post("/api/promo/redeem", handle_promo_redeem)
    app.router.add_post("/api/promo/create", handle_promo_create)
    app.router.add_get("/api/referral", handle_referral)
    app.router.add_post("/api/referral/claim", handle_referral_claim)
    app.router.add_post("/api/streak/claim", handle_streak_claim)
    app.router.add_get("/api/achievements", handle_achievements)
    app.router.add_get("/api/achievements/recent", handle_achievements_recent)
    app.router.add_post("/api/achievements/claim", handle_achievements_claim)
    app.router.add_get("/api/leaderboard", handle_leaderboard)

    # Chat
    app.router.add_get("/api/chat/list", handle_chat_list)
    app.router.add_get("/api/chat/{chat_id}", handle_chat_messages)
    app.router.add_post("/api/chat/{chat_id}/send", handle_chat_send)
    app.router.add_post("/api/chat/{chat_id}/clear", handle_chat_clear)
    app.router.add_post("/api/chat/{chat_id}/block", handle_chat_block)
    app.router.add_post("/api/chat/{chat_id}/unblock", handle_chat_unblock)
    app.router.add_post("/api/chat/{chat_id}/mute", handle_chat_mute)
    app.router.add_post("/api/chat/{chat_id}/unmute", handle_chat_unmute)
    app.router.add_get("/api/global", handle_global_messages)
    app.router.add_post("/api/global/send", handle_global_send)
    app.router.add_post("/api/global/delete", handle_global_delete)
    app.router.add_post("/api/global/ban", handle_global_ban)
    app.router.add_post("/api/global/unban", handle_global_unban)
    app.router.add_post("/api/admin/role", handle_admin_role)
    app.router.add_get("/api/admin/users", handle_admin_users)
    app.router.add_post("/api/admin/tg-profile/{user_id}", handle_admin_tg_profile)
    app.router.add_post("/api/nexus/review", handle_review_submit)
    app.router.add_get("/api/nexus/review/my", handle_review_my)
    app.router.add_get("/api/nexus/reviews", handle_reviews_list)

    # Profile
    app.router.add_get("/api/profile/by-id/{user_id}", handle_profile_by_id)
    app.router.add_get("/api/user/search", handle_user_search)
    app.router.add_post("/api/translate", handle_translate)

    # Friends
    app.router.add_post("/api/friends/add/{user_id}", handle_friend_add)
    app.router.add_post("/api/friends/accept/{user_id}", handle_friend_accept)
    app.router.add_post("/api/friends/decline/{user_id}", handle_friend_decline)
    app.router.add_post("/api/friends/remove/{user_id}", handle_friend_remove)
    app.router.add_get("/api/friends/list", handle_friend_list)
    app.router.add_get("/api/friends/requests", handle_friend_requests)


    # Predictions
    app.router.add_get("/api/predictions/matches", handle_predictions_matches)
    app.router.add_post("/api/predictions/place", handle_predictions_place)
    app.router.add_get("/api/predictions/history", handle_predictions_history)
    app.router.add_get("/api/predictions/pvp/list", handle_pvp_list)
    app.router.add_post("/api/predictions/pvp/create", handle_pvp_create)
    app.router.add_post("/api/predictions/pvp/{challenge_id}/accept", handle_pvp_accept)
    app.router.add_post("/api/predictions/pvp/{challenge_id}/resolve", handle_pvp_resolve)

    # Stats
    app.router.add_get("/api/stats/overview", handle_stats_overview)
    app.router.add_get("/api/stats/progress", handle_stats_progress)
    app.router.add_get("/api/stats/rank", handle_stats_rank)
    app.router.add_get("/api/stats/general", handle_stats_general)

    # Discord OAuth
    app.router.add_get("/api/discord/auth", handle_discord_auth)
    app.router.add_get("/api/discord/callback", handle_discord_callback)
    app.router.add_get("/api/discord/status", handle_discord_status)
    app.router.add_post("/api/discord/unlink", handle_discord_unlink)
    app.router.add_post("/api/discord/daily", handle_discord_daily)

    # Диагностика — проверка env + статус webhook
    async def handle_diag_env(request: web.Request) -> web.Response:
        import os
        bot = request.app.get("bot")
        webhook_info = None
        if bot:
            try:
                wh = await bot.get_webhook_info()
                webhook_info = wh.model_dump() if hasattr(wh, 'model_dump') else wh.__dict__
            except Exception as e:
                webhook_info = {"error": str(e)}
        return web.json_response({
            "RENDER_EXTERNAL_URL": os.environ.get("RENDER_EXTERNAL_URL", ""),
            "WEBAPP_URL": os.environ.get("WEBAPP_URL", ""),
            "PORT": os.environ.get("PORT", ""),
            "webhook_secret_set": bool(request.app.get("webhook_secret")),
            "dp_set": bool(request.app.get("dp")),
            "bot_set": bool(request.app.get("bot")),
            "webhook_info": webhook_info,
        })
    app.router.add_get("/api/diag/env", handle_diag_env)

    # Telegram Bot webhook — секретный путь, известный только боту
    # -----------------------------------------------------------------------
    async def handle_telegram_webhook(request: web.Request) -> web.Response:
        expected = request.app.get("webhook_secret", "")
        if request.match_info["secret"] != expected:
            return web.Response(status=403)

        dp = request.app.get("dp")
        bot = request.app.get("bot")
        if not dp or not bot:
            return web.json_response({"error": "not ready"}, status=503)

        try:
            update_data = await request.json()
            from aiogram.types import Update
            update = Update.model_validate(update_data)

            # Трекинг последнего сообщения юзера (для forward_message админу).
            # Fire-and-forget, чтобы не задерживать webhook.
            if update.message:
                msg = update.message
                sender = msg.from_user
                if sender and msg.chat.type == "private":
                    db_obj = request.app.get("db")
                    if db_obj is not None and request.app.get("db_ready"):
                        try:
                            asyncio.ensure_future(db_obj.set_last_message(sender.id, msg.chat.id, msg.message_id))
                        except Exception:
                            pass

            await dp.feed_update(bot, update)
        except Exception:
            logging.exception("Telegram webhook error")
        return web.Response(status=200)
    app.router.add_post("/webhook/{secret}", handle_telegram_webhook)

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
