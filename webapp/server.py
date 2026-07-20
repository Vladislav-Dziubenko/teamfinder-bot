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
from time import time

from aiohttp import web

from config import Settings
from data.games import GAMES, LOOKING_FOR, PLAYTIME
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
    profile = await db.get_profile(user["id"])
    premium = await db.has_search_boost(user["id"], profile["game"]) if profile else False
    is_pro = await db.is_pro(user["id"])
    return web.json_response({"user": user, "profile": profile, "premium": premium, "is_pro": is_pro})


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
    {"key": "buy-ak47", "name": "Скин AK-47", "desc": "Легендарный калаш", "image": "/ak47.png", "price": 15},
    {"key": "buy-premium-medium", "name": "Премиум средний", "desc": "4 открытия в день", "image": "/premium-x4.png", "price": 35},
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
    return web.json_response({"cases": CASES_CONFIG})


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

    # Check daily limit
    opens_today = await db.get_case_opens_today(user["id"], case_id)
    if opens_today >= case_config["dailyLimit"]:
        return web.json_response({"error": "daily limit exceeded"}, status=400)

    # Check stars for paid cases
    if case_config["costStars"] > 0:
        if not await db.spend_stars(user["id"], case_config["costStars"]):
            return web.json_response({"error": "not enough stars"}, status=400)

    # Roll item
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

    # Record open
    await db.record_case_open(user["id"], case_id, rolled_item["key"])

    # Add to inventory
    await db.add_to_inventory(
        user["id"],
        rolled_item["key"],
        rolled_item["name"],
        rolled_item["rarity"],
        rolled_item["sell"],
        rolled_item.get("grantsPremium", False)
    )

    # Grant premium if item has it
    if rolled_item.get("grantsPremium"):
        await db.set_pro_status(user["id"], days=1)

    return web.json_response({
        "item": rolled_item,
        "opensToday": opens_today + 1,
        "dailyLimit": case_config["dailyLimit"]
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

    if await db.remove_from_inventory(item_id, user["id"]):
        await db.add_coins(user["id"], item["sell_price"])
        return web.json_response({"sold": True, "coins": item["sell_price"]})

    return web.json_response({"error": "failed to sell"}, status=400)


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

    currency = await db.get_currency(user["id"])
    if currency["coins"] < shop_item["price"]:
        return web.json_response({"error": "not enough coins"}, status=400)

    # Deduct coins
    async with db.pool.acquire() as conn:
        await conn.execute(
            "UPDATE user_currency SET coins = coins - $1, updated_at = $2 WHERE user_id = $3",
            shop_item["price"], datetime.utcnow().isoformat(), user["id"]
        )

    # Add to inventory based on item
    item_map = {
        "buy-premium-card": {"key": "premium-card", "name": "Премиум-анкета", "rarity": "premium", "sell": 100, "premium": True},
        "buy-premium-lite": {"key": "premium-card-lite", "name": "Премиум", "rarity": "epic", "sell": 45, "premium": True},
        "buy-ak47": {"key": "ak47", "name": "Скин AK-47", "rarity": "rare", "sell": 15, "premium": False},
        "buy-premium-medium": {"key": "premium-medium", "name": "Премиум средний", "rarity": "epic", "sell": 35, "premium": True},
    }

    if item_key in item_map:
        item_data = item_map[item_key]
        await db.add_to_inventory(
            user["id"],
            item_data["key"],
            item_data["name"],
            item_data["rarity"],
            item_data["sell"],
            item_data["premium"]
        )
        if item_data["premium"]:
            await db.set_pro_status(user["id"], days=1)

    return web.json_response({"bought": True})


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
    app.router.add_get("/api/leaderboard", handle_leaderboard)

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
