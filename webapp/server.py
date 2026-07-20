"""HTTP-сервер для Telegram Mini App (WebApp), которое открывается по /start.

Отдаёт статику (webapp/static) и REST API, которым пользуется фронтенд
(webapp/static/app.js). Любой запрос к /api/* обязан нести заголовок
X-Telegram-Init-Data — это initData из window.Telegram.WebApp, подпись
которого проверяется в auth.py.

Когда сделаешь свой дизайн через другой ИИ — просто замени файлы в
webapp/static/ (index.html/style.css) своими, сохранив вызовы fetch('/api/...')
из app.js (или перенеси эту логику в свой JS). Бэкенд трогать не обязательно.
"""

from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta
from time import time

from aiohttp import web

import json

from config import Settings
from data.games import (
    GAMES, LOOKING_FOR, PLAYTIME,
    BATTLE_PASS_TIERS, BATTLE_PASS_XP_PER_LEVEL, BATTLE_PASS_PRICE_STARS,
    DAILY_STREAK_REWARDS, REFERRAL_REWARD, COIN_PACKS,
)
from data.guides import GUIDES
from database import Database
from services.matching import find_matches
from webapp.auth import validate_init_data

STATIC_DIR = Path(__file__).parent / "static"

# Rate limiting for web app API
WEB_RATE_LIMIT = 30
WEB_RATE_WINDOW = 60
web_user_requests: defaultdict[int, list[float]] = defaultdict(list)


def _get_user(request: web.Request) -> dict | None:
    return request.get("init_data", {}).get("user")


@web.middleware
async def error_middleware(request: web.Request, handler):
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except Exception as e:
        return web.json_response({"error": "internal server error"}, status=500)


@web.middleware
async def web_rate_limit_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        user = request.get("init_data", {}).get("user")
        if user and "id" in user:
            user_id = user["id"]
            now = time()
            web_user_requests[user_id] = [
                t for t in web_user_requests[user_id] if now - t < WEB_RATE_WINDOW
            ]
            if len(web_user_requests[user_id]) >= WEB_RATE_LIMIT:
                return web.json_response({"error": "rate limit exceeded"}, status=429)
            web_user_requests[user_id].append(now)
    return await handler(request)


@web.middleware
async def auth_middleware(request: web.Request, handler):
    if request.path.startswith("/api/"):
        settings: Settings = request.app["settings"]
        init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
        parsed = validate_init_data(init_data_raw, settings.bot_token)
        if not parsed or "user" not in parsed:
            return web.json_response({"error": "unauthorized"}, status=401)
        request["init_data"] = parsed
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
    await db.ensure_user(user["id"], user.get("username"), user.get("first_name"))

    currency = await db.get_currency(user["id"])
    mini_profile = await db.get_mini_app_profile(user["id"])
    inventory = await db.get_inventory(user["id"])
    battlepass = await db.get_battlepass(user["id"])
    streak = await db.get_daily_streak(user["id"])
    referral = await db.get_or_create_referral(user["id"])
    achievements = await db.get_user_achievements(user["id"])

    case_cooldowns = {}
    for case_id in CASES_CONFIG:
        last_open = await db.get_last_case_open(user["id"], case_id)
        case_cooldowns[case_id] = last_open

    return web.json_response({
        "user": user,
        "currency": currency,
        "mini_profile": mini_profile,
        "inventory": inventory,
        "battlepass": battlepass,
        "streak": streak,
        "referral": referral,
        "achievements": achievements,
        "case_cooldowns": case_cooldowns,
        "premium_active": await db.is_pro(user["id"]),
    })


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
        "nickname": str(body["nickname"]).strip()[:32],
        "rank": body["rank"],
        "role": body["role"],
        "playtime": body["playtime"],
        "looking_for": body["looking_for"],
        "region": str(body.get("region", "")).strip()[:40],
        "language": body.get("language", "RU"),
        "contact": str(body["contact"]).strip()[:80],
        "has_mic": bool(body.get("has_mic", True)),
        "description": str(body.get("description", "")).strip()[:300],
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
    allowed = {"avatar", "nick", "bio", "deco"}
    data = {k: body.get(k) for k in allowed if k in body}
    await db.save_mini_app_profile(user["id"], data)
    return web.json_response({"profile": await db.get_mini_app_profile(user["id"])})


async def handle_search(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)

    profile = await db.get_profile(user["id"])
    if not profile:
        return web.json_response({"error": "no profile"}, status=400)

    is_pro = await db.is_pro(user["id"])
    premium = is_pro or await db.has_search_boost(user["id"], profile["game"])
    candidates = await db.list_profiles_by_game(profile["game"], exclude_user_id=user["id"])
    matches = find_matches(profile, candidates, limit=10 if premium else 3)

    results = []
    for p, score in matches:
        contact_unlocked = await db.has_unlocked_contact(user["id"], p["id"])
        result = {
            "id": p["id"],
            "user_id": p["user_id"],
            "nickname": p["nickname"] if premium else "🔒 Скрыто",
            "rank": p["rank"],
            "role": p["role"],
            "playtime": p["playtime"],
            "region": p.get("region", ""),
            "score": score,
            "contact": p["contact"] if premium or contact_unlocked else None,
        }
        results.append(result)

    return web.json_response({"premium": premium, "is_pro": is_pro, "game": profile["game"], "results": results})


async def handle_guides(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    game = request.query.get("game")

    items = []
    for g in GUIDES:
        if game and g["game"] != game:
            continue
        unlocked = g["type"] == "free" or await db.has_unlocked(user["id"], g["id"])
        items.append({
            "id": g["id"], "game": g["game"], "title": g["title"],
            "type": g["type"], "stars": g["stars"], "unlocked": unlocked,
        })
    return web.json_response({"guides": items})


async def handle_guide_detail(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    guide_id = request.match_info["guide_id"]
    guide = next((g for g in GUIDES if g["id"] == guide_id), None)
    if not guide:
        return web.json_response({"error": "not found"}, status=404)

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
    else:
        return web.json_response({"error": "unknown invoice type"}, status=400)

    return web.json_response({"invoice_link": link})


async def handle_teams(request: web.Request):
    db: Database = request.app["db"]
    game = request.query.get("game")
    teams = await db.list_teams(game)
    return web.json_response({"teams": teams})


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
    return web.json_response({"team_id": team_id, "team": await db.get_team(team_id)})


async def handle_team_applications(request: web.Request):
    db: Database = request.app["db"]
    team_id = int(request.match_info["team_id"])
    status = request.query.get("status")
    applications = await db.get_team_applications(team_id, status)
    return web.json_response({"applications": applications})


async def handle_apply_team(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    team_id = int(request.match_info["team_id"])
    body = await request.json()
    message = str(body.get("message", "")).strip()[:500]

    is_premium = await db.consume_premium_application_credit(user["id"])
    app_id = await db.apply_to_team(team_id, user["id"], message, is_premium)
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
        "costStars": 150,
        "free": False,
        "dailyLimit": 99,
        "items": [
            {"key": "premium-card", "name": "Премиум-анкета", "desc": "Кастомные фото, свой текст и украшения карточки — без ограничений 1 день", "image": "/premium-reveal.png", "rarity": "premium", "sell": 100, "weight": 60, "grantsPremium": True},
            {"key": "premium-card-lite", "name": "Премиум", "desc": "Премиум-статус для анкеты", "image": "/premium-card.png", "rarity": "epic", "sell": 45, "weight": 40, "grantsPremium": True},
        ]
    }
}

COIN_SHOP = [
    {"key": "buy-premium-card", "name": "Премиум-анкета", "desc": "Кастом фото, текст и украшения на 1 день", "image": "/premium-reveal.png", "price": 200},
    {"key": "buy-premium-lite", "name": "Премиум", "desc": "Премиум-статус для анкеты", "image": "/premium-card.png", "price": 90},
    {"key": "buy-ak47", "name": "Скин AK-47", "desc": "Легендарный калаш", "image": "/ak47.png", "price": 35},
    {"key": "buy-premium-medium", "name": "Премиум средний", "desc": "4 открытия в день", "image": "/premium-x4.png", "price": 75},
]

QUESTS_CONFIG = [
    {"id": "play-cs16", "title": "Играй в CS 1.6", "desc": "Проведи 60 минут в CS 1.6", "reward": 50, "targetMinutes": 60},
    {"id": "play-dota2", "title": "Играй в Dota 2", "desc": "Проведи 60 минут в Dota 2", "reward": 50, "targetMinutes": 60},
    {"id": "play-csgo", "title": "Играй в CS:GO", "desc": "Проведи 60 минут в CS:GO", "reward": 50, "targetMinutes": 60},
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
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    case_id = body.get("case_id")

    if not case_id or not isinstance(case_id, str):
        return web.json_response({"error": "invalid case_id"}, status=400)

    if case_id not in CASES_CONFIG:
        return web.json_response({"error": "unknown case"}, status=400)

    case_config = CASES_CONFIG[case_id]

    # Roll item server-side (outcome is independent of the transaction)
    import random
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
    return web.json_response({"quests": QUESTS_CONFIG, "progress": progress})


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
    db: Database = request.app["db"]
    user = _get_user(request)
    ok = await db.buy_battlepass_premium(user["id"], BATTLE_PASS_PRICE_STARS)
    if not ok:
        return web.json_response({"error": "already premium or not enough stars"}, status=400)
    return web.json_response({"ok": True, "state": await db.get_battlepass(user["id"])})


async def handle_battlepass_claim_tier(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
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
    db: Database = request.app["db"]
    user = _get_user(request)
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


async def handle_leaderboard(request: web.Request):
    db: Database = request.app["db"]
    leaderboard = await db.get_leaderboard(limit=10)
    return web.json_response({"leaderboard": leaderboard})


def create_app(db: Database, settings: Settings, bot) -> web.Application:
    app = web.Application(middlewares=[error_middleware, auth_middleware, web_rate_limit_middleware])
    app["db"] = db
    app["settings"] = settings
    app["bot"] = bot

    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/games", handle_games)
    app.router.add_get("/api/me", handle_me)
    app.router.add_post("/api/profile", handle_save_profile)
    app.router.add_post("/api/profile/hide", handle_hide_profile)
    app.router.add_post("/api/profile/customize", handle_customize_profile)
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
    app.router.add_get("/api/nexus/shop", handle_nexus_shop)
    app.router.add_post("/api/nexus/shop/buy", handle_nexus_buy)
    app.router.add_post("/api/nexus/exchange", handle_nexus_exchange)
    app.router.add_post("/api/nexus/spend-stars", handle_nexus_spend_stars)

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
    app.router.add_post("/api/achievements/claim", handle_achievements_claim)
    app.router.add_get("/api/leaderboard", handle_leaderboard)

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
