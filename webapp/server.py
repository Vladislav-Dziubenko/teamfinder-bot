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
    DAILY_STREAK_REWARDS, REFERRAL_REWARD, COIN_PACKS, DEFAULT_PROMO_CODES,
)
from data.guides import GUIDES
from database import Database
from services.matching import find_matches, score_match
from webapp.auth import validate_init_data
from webapp.discord import (build_auth_url, exchange_code, fetch_discord_user,
                            fetch_discord_connections, revoke_token, _make_state, _verify_state)
from webapp.redis_client import (
    init_redis, close_redis,
    rate_limit_check,
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
    "script-src 'self' 'unsafe-inline' https://telegram.org;"
    "style-src 'self' 'unsafe-inline';"
    "img-src 'self' data: https:;"
    "font-src 'self' data:;"
    "connect-src 'self' https://translate.googleapis.com;"
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com;"
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
    "p4": {"stars": 1000, "title": "Всё сразу + анимированная рамка", "desc": "Полный пакет NEXUS"},
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

_DB_FREE_PREFIXES = ("/api/games", "/api/nexus/shop", "/api/predictions/matches", "/api/client-error", "/api/discord/status", "/api/discord/auth", "/api/discord/callback", "/api/discord/unlink", "/api/diag/env")

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
    except Exception:
        # Полный стектрейс пишется в лог (виден в консоли / Render Log Stream).
        # Пользователю уходит только общее сообщение — без деталей исключения,
        # внутренних путей и текста ошибки.
        logging.exception("Unhandled exception in %s %s", request.method, request.path)
        return web.json_response({"error": "internal server error"}, status=500)


@web.middleware
async def active_middleware(request: web.Request, handler):
    """Updates last_active_at for authenticated users on each API call (fire-and-forget)."""
    response = await handler(request)
    if request.path.startswith("/api/"):
        user = _get_user(request)
        if user and "id" in user:
            db: Database = request.app["db"]
            asyncio.ensure_future(db.pool.execute(
                "UPDATE users SET last_active_at = $1 WHERE user_id = $2",
                datetime.utcnow().isoformat(), user["id"],
            ))
    return response


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
        logging.info(f"[AUTH] {request.method} {request.path} init_data_present={bool(init_data_raw)} init_data_len={len(init_data_raw)} is_public={is_public}")
        parsed = validate_init_data(init_data_raw, settings.bot_token)
        logging.info(f"[AUTH] {request.path} parsed={parsed is not None} user_in_parsed={'user' in (parsed or {})}")
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
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"), user.get("photo_url"))

    tasks = [
        db.get_currency(user["id"]),
        db.get_mini_app_profile(user["id"]),
        db.get_inventory(user["id"]),
        db.get_battlepass(user["id"]),
        db.get_daily_streak(user["id"]),
        db.get_or_create_referral(user["id"]),
        db.get_user_achievements(user["id"]),
        db.is_pro(user["id"]),
    ]
    results = await asyncio.gather(*tasks)

    case_cooldowns = {}
    for case_id in CASES_CONFIG:
        last_open = await db.get_last_case_open(user["id"], case_id)
        case_cooldowns[case_id] = last_open

    bot_username = getattr(request.app.get("bot"), "username", None) or "TeamUpMatchBot"
    referral_bot_url = f"https://t.me/{bot_username}"
    app_short_name = "nexus"
    direct_app_url = f"https://t.me/{bot_username}/{app_short_name}"

    promo_data = await db.get_promo_codes_with_redemption(user["id"])
    role = await _effective_role(request, db, user["id"])

    return web.json_response({
        "user": user,
        "role": role,
        "currency": results[0],
        "mini_profile": results[1] if results[1] else {"games": []},
        "inventory": results[2],
        "battlepass": results[3],
        "streak": results[4],
        "referral": results[5],
        "achievements": results[6],
        "cases": list(CASES_CONFIG.values()),
        "case_cooldowns": case_cooldowns,
        "premium_active": results[7],
        "star_packs": [{"id": k, "stars": v["stars"], "perk": v["desc"], "title": v["title"]} for k, v in STAR_PACKS.items()],
        "battlepass_tiers": BATTLE_PASS_TIERS,
        "referral_reward": REFERRAL_REWARD,
        "referral_bot_url": referral_bot_url,
        "direct_app_url": direct_app_url,
        "promos": promo_data["codes"],
        "redeemed_codes": promo_data["redeemed"],
        "default_promo_codes": [
            {"code": p["code"], "reward": p["reward"], "maxUses": p["max_uses"], "uses": 0, "createdByUser": False}
            for p in DEFAULT_PROMO_CODES
        ],
    })


async def handle_user_language(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"), user.get("photo_url"))

    if request.method == "POST":
        body = await request.json()
        lang = body.get("lang", "ru")
        await db.set_user_language(user["id"], lang)
        return web.json_response({"ok": True, "lang": lang})

    lang = await db.get_user_language(user["id"])
    return web.json_response({"lang": lang})


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

    profile = await db.get_profile(user["id"])
    if not profile:
        where = "WHERE p.is_active = 1 AND p.user_id != $1"
        params: list = [user["id"]]
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
            f"""SELECT u.user_id, mp.nick, mp.avatar, p.game, p.rank, p.role, p.searching_since
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
                "avatar": r["avatar"] or f"/player-{((r['user_id'] % 4) + 1)}.png",
                "game": r["game"] or "unknown",
                "rank": r["rank"] or "",
                "role": r["role"] or "",
                "realName": r["nick"] or "",
                "winrate": 0,
                "kd": 0,
                "tags": [],
                "bio": "",
                "tgUsername": "",
                "vibe": 0,
                "hours": 0,
                "level": None,
                "online": False,
                "lastSeen": None,
                "searching_minutes": _calc_searching_minutes(r["searching_since"]),
            }
            for r in rows
        ]
        asyncio.create_task(db.update_searching_since(user["id"]))
        return web.json_response({"players": players, "teams": []})

    # When "all" games with nickname query, search across every game
    if game_filter == "all" and query:
        rows = await db.pool.fetch(
            """SELECT u.user_id, mp.nick, mp.avatar, p.game, p.rank, p.role, p.searching_since
               FROM users u
               LEFT JOIN mini_app_profiles mp ON mp.user_id = u.user_id
               JOIN profiles p ON p.user_id = u.user_id AND p.is_active = 1
               WHERE p.game IN ('cs2','roblox','wot','wt','dota2','valorant','minecraft','fortnite','apex','rust')
                 AND (LOWER(COALESCE(mp.nick, '')) LIKE $1
                   OR LOWER(COALESCE(p.nickname, '')) LIKE $1
                   OR LOWER(COALESCE(p.role, '')) LIKE $1
                   OR LOWER(COALESCE(p.rank, '')) LIKE $1)
               LIMIT 20""",
            f"%{query}%",
        )
        await db.increment_user_stat(user["id"], "search_count")
        asyncio.create_task(db.update_quest_progress(user["id"], "do-searches", 1))
        asyncio.create_task(db.update_quest_progress(user["id"], "do-searches-2", 1))
        players = [
            {
                "id": str(r["user_id"]),
                "user_id": r["user_id"],
                "nick": r["nick"] or f"User{r['user_id']}",
                "avatar": r["avatar"] or f"/player-{((r['user_id'] % 4) + 1)}.png",
                "game": r["game"] or "unknown",
                "rank": r["rank"] or "",
                "role": r["role"] or "",
                "realName": r["nick"] or "",
                "winrate": 0,
                "kd": 0,
                "tags": [],
                "bio": "",
                "tgUsername": "",
                "vibe": 0,
                "hours": 0,
                "level": None,
                "online": False,
                "lastSeen": None,
                "searching_minutes": _calc_searching_minutes(r["searching_since"]),
            }
            for r in rows
        ]
        asyncio.create_task(db.update_searching_since(user["id"]))
        return web.json_response({"players": players, "teams": []})
    game_to_search = game_filter if game_filter and game_filter != "all" else (profile["game"] if profile else None)
    is_pro = await db.is_pro(user["id"])
    has_boost = await db.has_search_boost(user["id"], game_to_search) if not is_pro else False
    premium = is_pro or has_boost
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

    matches = find_matches(profile, candidates, limit=50 if premium else 20)
    if not matches and candidates:
        scored = [(c, score_match(profile, c)) for c in candidates]
        scored.sort(key=lambda x: (-x[1], -int(x[0].get("_highlighted", False))))
        matches = scored[: 50 if premium else 20]

    players = []
    for p, score in matches:
        contact_unlocked = await db.has_unlocked_contact(user["id"], p["id"])
        mini_profile = await db.get_mini_app_profile(p["user_id"])
        nick = mini_profile.get("nick") or p["nickname"] or "Unknown"
        avatar = mini_profile.get("avatar") or f"/player-{((p['user_id'] % 4) + 1)}.png"
        contact = p["contact"] if premium or contact_unlocked else None
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
            "tgUsername": "",
            "vibe": score,
            "hours": int(p.get("playtime") or 0) if (p.get("playtime") or "").isdigit() else 0,
            "level": None,
            "online": False,
            "lastSeen": None,
            "contact": contact,
            "searching_minutes": _calc_searching_minutes(p.get("searching_since")),
        })

    await db.increment_user_stat(user["id"], "search_count")
    asyncio.create_task(db.update_quest_progress(user["id"], "do-searches", 1))
    asyncio.create_task(db.update_quest_progress(user["id"], "do-searches-2", 1))
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
        "name": "Nexus Counter Strike 1.6",
        "subtitle": "Бесплатный ежедневный кейс",
        "image": "/case-blue.png",
        "gold": False,
        "costStars": 0,
        "free": True,
        "dailyLimit": 1,
        "items": [
            {"key": "premium-medium", "name": "Премиум средний", "desc": "Премиум-доступ на 4 открытия в день", "image": "/premium-x4.png", "rarity": "epic", "sell": 35, "weight": 8, "grantsPremium": True},
            {"key": "ak47", "name": "Скин AK-47", "desc": "Легендарный калаш из старой школы", "image": "/ak47.png", "rarity": "rare", "sell": 15, "weight": 14},
            {"key": "icon-skull", "name": "Череп", "desc": "Иконка «Череп»", "icon": "💀", "rarity": "common", "sell": 10, "weight": 10},
            {"key": "icon-fire", "name": "Пламя", "desc": "Иконка «Пламя»", "icon": "🔥", "rarity": "common", "sell": 10, "weight": 10},
            {"key": "icon-crown", "name": "Корона", "desc": "Иконка «Корона»", "icon": "👑", "rarity": "common", "sell": 10, "weight": 10},
            {"key": "icon-target", "name": "Прицел", "desc": "Иконка «Прицел»", "icon": "🎯", "rarity": "common", "sell": 10, "weight": 10},
            {"key": "icon-bolt", "name": "Молния", "desc": "Иконка «Молния»", "icon": "⚡", "rarity": "common", "sell": 10, "weight": 10},
            {"key": "icon-star", "name": "Звезда", "desc": "Иконка «Звезда»", "icon": "⭐", "rarity": "common", "sell": 10, "weight": 10},
        ]
    },
    "gold": {
        "id": "gold",
        "name": "Nexus Premium",
        "subtitle": "Золотой премиальный кейс",
        "image": "/case-gold.png",
        "gold": True,
        "costStars": 75,
        "free": False,
        "dailyLimit": 99,
        "items": [
            {"key": "premium-card", "name": "Премиум-анкета", "desc": "Кастомные фото, свой текст и украшения карточки — без ограничений 1 день", "image": "/premium-reveal.png", "rarity": "premium", "sell": 100, "weight": 60, "grantsPremium": True},
            {"key": "premium-card-lite", "name": "Премиум", "desc": "Премиум-статус для анкеты", "image": "/premium-card.png", "rarity": "epic", "sell": 45, "weight": 40, "grantsPremium": True},
        ]
    }
}

COIN_SHOP = [
    {"key": "buy-premium-card", "name": "Премиум-анкета", "desc": "Кастом фото, текст и украшения на 1 день", "image": "/premium-reveal.png", "price": 100},
    {"key": "buy-premium-lite", "name": "Премиум", "desc": "Премиум-статус для анкеты", "image": "/premium-card.png", "price": 45},
    {"key": "buy-ak47", "name": "Скин AK-47", "desc": "Легендарный калаш", "image": "/ak47.png", "price": 18},
    {"key": "buy-premium-medium", "name": "Премиум средний", "desc": "4 открытия в день", "image": "/premium-x4.png", "price": 38},
]

QUESTS_CONFIG = [
    {"id": "open-cases", "title": "Открой 25 кейсов", "desc": "Открой 25 кейсов в Nexus", "reward": "40 ⭐", "rewardStars": 40, "target": 25},
    {"id": "do-searches", "title": "Сделай 14 поисков", "desc": "Найди тиммейтов 14 раз", "reward": "35 ⭐", "rewardStars": 35, "target": 14},
    {"id": "open-cases-2", "title": "Открой 50 кейсов", "desc": "Открой 50 кейсов в Nexus", "reward": "75 ⭐", "rewardStars": 75, "target": 50},
    {"id": "do-searches-2", "title": "Сделай 30 поисков", "desc": "Найди тиммейтов 30 раз", "reward": "60 ⭐", "rewardStars": 60, "target": 30},
]


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

    if not case_id or not isinstance(case_id, str):
        return web.json_response({"error": "invalid case_id"}, status=400)

    if case_id not in CASES_CONFIG:
        return web.json_response({"error": "unknown case"}, status=400)

    case_config = CASES_CONFIG[case_id]

    # Roll item server-side (outcome is independent of the transaction)
    items = case_config["items"]
    total_weight = sum(item["weight"] for item in items)
    rand = random.uniform(0, total_weight)
    current = 0
    rolled_item = None
    for item in items:
        current += item["weight"]
        if rand <= current:
            rolled_item = item
            break
    if not rolled_item:
        rolled_item = items[0]

    # Everything below runs inside one DB transaction to keep currency/items consistent
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            if case_config["free"]:
                last_open = await db.get_last_case_open(user["id"], case_id, conn)
                if last_open:
                    last_dt = datetime.fromisoformat(last_open)
                    if (datetime.utcnow() - last_dt).total_seconds() < 24 * 3600:
                        return web.json_response({"error": "cooldown"}, status=400)
            else:
                if not await db._adjust_currency_conn(conn, user["id"], stars=-case_config["costStars"]):
                    return web.json_response({"error": "not enough stars"}, status=400)

            await db.record_case_open(user["id"], case_id, rolled_item["key"], conn)
            await db.add_to_inventory(
                user["id"],
                rolled_item["key"],
                rolled_item["name"],
                rolled_item["rarity"],
                rolled_item["sell"],
                rolled_item.get("grantsPremium", False),
                conn,
            )
            if rolled_item.get("grantsPremium"):
                await db.set_pro_status(user["id"], days=1, conn=conn)
            await db.add_battlepass_xp(user["id"], 20, conn)

    # Track quest progress: case opened
    asyncio.create_task(db.update_quest_progress(user["id"], "open-cases", 1))
    asyncio.create_task(db.update_quest_progress(user["id"], "open-cases-2", 1))

    return web.json_response({
        "item": rolled_item,
        "last_open_at": datetime.utcnow().isoformat(),
    })


async def handle_nexus_inventory(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    inventory = await db.get_inventory(user["id"])
    return web.json_response({"inventory": inventory})


async def handle_nexus_sell(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
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

    return web.json_response({"ok": True, "reward": REFERRAL_REWARD})


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
    chats = await db.get_user_chats(user["id"])
    return web.json_response({"chats": chats})


async def handle_chat_messages(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    chat_id = request.match_info["chat_id"]
    if not await db.can_access_chat(chat_id, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    await db.mark_chat_read(chat_id, user["id"])
    messages = await db.get_chat_messages(chat_id)
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

def _is_developer(request: web.Request, user_id: int) -> bool:
    settings = request.app.get("settings")
    return bool(settings and user_id in settings.admin_ids)


async def _effective_role(request: web.Request, db: Database, user_id: int) -> str:
    """developer (from bot ADMIN_IDS) > admin > moderator."""
    if _is_developer(request, user_id):
        return "developer"
    return await db.get_role(user_id)


async def handle_global_messages(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    messages = await db.get_global_messages(50)
    for msg in messages:
        if msg.get("user_id") == user["id"]:
            msg["user_id"] = "me"
    role = await _effective_role(request, db, user["id"])
    banned = await db.is_globally_banned(user["id"])
    return web.json_response({"messages": messages, "me_role": role, "me_banned": banned})


async def handle_global_send(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if await db.is_globally_banned(user["id"]):
        return web.json_response({"error": "banned"}, status=403)
    body = await request.json()
    text = sanitize(body.get("text", ""), 500)
    if not text:
        return web.json_response({"error": "empty message"}, status=400)
    msg = await db.send_global_message(user["id"], text)
    msg["user_id"] = "me"
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
    await db.delete_global_message(message_id)
    return web.json_response({"ok": True})


async def handle_global_ban(request: web.Request):
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
    if _is_developer(request, target_id):
        return web.json_response({"error": "cannot ban developer"}, status=403)
    target_role = await db.get_role(target_id)
    if db.ROLE_RANK.get(target_role, 0) >= db.ROLE_RANK.get(role, 0):
        return web.json_response({"error": "cannot ban same or higher role"}, status=403)
    await db.ban_global(target_id, user["id"], sanitize(body.get("reason", ""), 200))
    return web.json_response({"ok": True})


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
    role = (body.get("role") or "").strip()
    allowed = {"admin", "moderator"}
    if role and role not in allowed:
        return web.json_response({"error": "invalid role"}, status=400)
    await db.set_role(target_id, role or None, user["id"])
    return web.json_response({"ok": True})


async def handle_admin_users(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    if not _is_developer(request, user["id"]):
        return web.json_response({"error": "forbidden"}, status=403)
    query = request.query.get("q", "").strip().lower()
    users = await db.search_users_with_roles(query or "%", 30)
    return web.json_response({"users": users})


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

ESPORTS_MATCHES = [
    {"id": "m1", "tournament": "IEM Katowice 2026", "discipline": "CS2", "teamA": "NAVI", "teamB": "FaZe", "startsAt": int((datetime.utcnow() + timedelta(hours=2)).timestamp() * 1000), "oddsA": 1.85, "oddsB": 1.95, "status": "upcoming"},
    {"id": "m2", "tournament": "The International", "discipline": "Dota 2", "teamA": "Team Spirit", "teamB": "Gaimin Gladiators", "startsAt": int((datetime.utcnow() + timedelta(hours=6)).timestamp() * 1000), "oddsA": 1.6, "oddsB": 2.35, "status": "upcoming"},
    {"id": "m3", "tournament": "VCT Champions", "discipline": "Valorant", "teamA": "Sentinels", "teamB": "Fnatic", "startsAt": int((datetime.utcnow() + timedelta(hours=26)).timestamp() * 1000), "oddsA": 2.1, "oddsB": 1.72, "status": "upcoming"},
    {"id": "m4", "tournament": "DreamLeague S24", "discipline": "Dota 2", "teamA": "Team Liquid", "teamB": "OG", "startsAt": int((datetime.utcnow() + timedelta(hours=48)).timestamp() * 1000), "oddsA": 2.2, "oddsB": 1.65, "status": "upcoming"},
]


async def handle_predictions_matches(request: web.Request):
    return web.json_response({"matches": ESPORTS_MATCHES})


async def handle_predictions_place(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    match_id = body.get("match_id")
    side = body.get("side")
    amount = body.get("amount", 0)

    match = next((m for m in ESPORTS_MATCHES if m["id"] == match_id), None)
    if not match:
        return web.json_response({"error": "match not found"}, status=400)

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
    cache_key = "leaderboard"
    cached = await cache_get(cache_key)
    if cached is not None:
        return web.json_response(cached)
    db: Database = request.app["db"]
    leaderboard = await db.get_leaderboard(limit=10)
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

    return web.json_response({
        "linked": True,
        "discord_id": conn["discord_id"],
        "username": conn["discord_username"],
        "global_name": conn["discord_global_name"],
        "avatar_url": conn["discord_avatar"],
        "linked_at": conn["connected_at"],
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
    # 2. error_middleware        — перехватывает все исключения, скрывает стектрейс от клиента
    # 3. auth_middleware         — проверяет X-Telegram-Init-Data, пишет request["init_data"]
    # 4. active_middleware      — обновляет last_active_at (fire-and-forget) для авторизованных
    # 5. web_rate_limit_middleware — читает user_id из request["init_data"], выставленного auth
    # Если поменять порядок — rate limiter получит init_data=None и вернёт 500.
    # Порядок: security → timing → db_ready → cors → gzip → cache → error → auth → active → rate_limit
    app = web.Application(middlewares=[security_middleware, timing_middleware, db_ready_middleware, cors_middleware, gzip_middleware, cache_static_middleware, error_middleware, auth_middleware, active_middleware, web_rate_limit_middleware])
    app["allowed_origins"] = _resolve_allowed_origins(settings)
    app["db"] = db
    app["settings"] = settings
    app["bot"] = bot
    app["session"] = ClientSession()

    app.on_startup.append(lambda _app: init_redis())
    app.on_cleanup.append(lambda _app: close_redis())
    app.on_cleanup.append(lambda _app: _app["session"].close())

    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/games", handle_games)
    app.router.add_get("/api/me", handle_me)
    app.router.add_route("GET", "/api/user/language", handle_user_language)
    app.router.add_route("POST", "/api/user/language", handle_user_language)
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
    app.router.add_get("/api/nexus/inventory", handle_nexus_inventory)
    app.router.add_post("/api/nexus/inventory/sell", handle_nexus_sell)
    app.router.add_get("/api/nexus/quests", handle_nexus_quests)
    app.router.add_post("/api/nexus/quests/claim", handle_nexus_claim_quest_reward)
    app.router.add_get("/api/nexus/shop", handle_nexus_shop)
    app.router.add_post("/api/nexus/shop/buy", handle_nexus_buy)
    app.router.add_post("/api/nexus/exchange", handle_nexus_exchange)
    app.router.add_post("/api/nexus/spend-stars", handle_nexus_spend_stars)
    app.router.add_post("/api/nexus/buy-star-pack", handle_nexus_buy_star_pack)

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

    # Discord OAuth
    app.router.add_get("/api/discord/auth", handle_discord_auth)
    app.router.add_get("/api/discord/callback", handle_discord_callback)
    app.router.add_get("/api/discord/status", handle_discord_status)
    app.router.add_post("/api/discord/unlink", handle_discord_unlink)

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
            await dp.feed_update(bot, update)
        except Exception:
            logging.exception("Telegram webhook error")
        return web.Response(status=200)
    app.router.add_post("/webhook/{secret}", handle_telegram_webhook)

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
