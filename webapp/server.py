"""HTTP-сервер для Telegram Mini App (WebApp), которое открывается по /start.

Отдаёт статику (webapp/static) и REST API, которым пользуется фронтенд
(webapp/static/app.js). Любой запрос к /api/* обязан нести заголовок
X-Telegram-Init-Data — это initData из window.Telegram.WebApp, подпись
которого проверяется в auth.py.

Когда сделаешь свой дизайн через другой ИИ — просто замени файлы в
webapp/static/ (index.html/style.css) своими, сохранив вызовы fetch('/api/...')
из app.js (или перенеси эту логику в свой JS). Бэкенд трогать не обязательно.
"""

import random
from pathlib import Path

from aiohttp import web

from config import Settings
from data.games import GAMES, LOOKING_FOR, PLAYTIME
from data.guides import GUIDES
from database import Database
from services.matching import find_matches
from webapp.auth import validate_init_data

STATIC_DIR = Path(__file__).parent / "static"


def _get_user(request: web.Request) -> dict | None:
    return request.get("init_data", {}).get("user")


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


async def handle_apply_team(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    team_id = int(request.match_info["team_id"])
    body = await request.json()
    message = str(body.get("message", "")).strip()[:500]

    is_premium = await db.consume_premium_application_credit(user["id"])
    app_id = await db.apply_to_team(team_id, user["id"], message, is_premium=is_premium)
    return web.json_response({"application_id": app_id, "is_premium": is_premium})


async def handle_team_applications(request: web.Request):
    db: Database = request.app["db"]
    team_id = int(request.match_info["team_id"])
    status = request.query.get("status")
    applications = await db.get_team_applications(team_id, status)
    return web.json_response({"applications": applications})


async def handle_user_applications(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    applications = await db.get_user_applications(user["id"])
    return web.json_response({"applications": applications})


# Nexus Currency API
async def handle_currency(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    currency = await db.get_currency(user["id"])
    return web.json_response(currency)


# Nexus Cases API
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
            {"key": "premium-medium", "name": "Премиум средний", "desc": "Премиум-доступ на 4 открытия в день", "image": "/premium-x4.png", "rarity": "epic", "sell": 75, "weight": 8, "grantsPremium": True},
            {"key": "ak47", "name": "Скин AK-47", "desc": "Легендарный калаш из старой школы", "image": "/ak47.png", "rarity": "rare", "sell": 35, "weight": 14},
            {"key": "icon-skull", "name": "Череп", "desc": "Иконка «Череп»", "icon": "💀", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-fire", "name": "Пламя", "desc": "Иконка «Пламя»", "icon": "🔥", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-crown", "name": "Корона", "desc": "Иконка «Корона»", "icon": "👑", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-target", "name": "Прицел", "desc": "Иконка «Прицел»", "icon": "🎯", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-bolt", "name": "Молния", "desc": "Иконка «Молния»", "icon": "⚡", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-star", "name": "Звезда", "desc": "Иконка «Звезда»", "icon": "⭐", "rarity": "common", "sell": 20, "weight": 10},
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
            {"key": "premium-card", "name": "Премиум-анкета", "desc": "Кастомные фото, свой текст и украшения карточки — без ограничений 1 день", "image": "/premium-reveal.png", "rarity": "premium", "sell": 200, "weight": 60, "grantsPremium": True},
            {"key": "premium-card-lite", "name": "Премиум", "desc": "Премиум-статус для анкеты", "image": "/premium-card.png", "rarity": "epic", "sell": 90, "weight": 40, "grantsPremium": True},
        ]
    }
}


def _roll_item(case_id: str) -> dict | None:
    case = CASES_CONFIG.get(case_id)
    if not case:
        return None
    total = sum(item["weight"] for item in case["items"])
    r = random.random() * total
    for item in case["items"]:
        r -= item["weight"]
        if r <= 0:
            return item
    return case["items"][-1]


async def handle_cases(request: web.Request):
    return web.json_response({"cases": list(CASES_CONFIG.values())})


async def handle_open_case(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    case_id = body.get("case_id")
    
    case = CASES_CONFIG.get(case_id)
    if not case:
        return web.json_response({"error": "case not found"}, status=404)
    
    # Check daily limit for free cases
    if case["free"]:
        opens_today = await db.get_case_opens_today(user["id"], case_id)
        if opens_today >= case["dailyLimit"]:
            return web.json_response({"error": "daily limit exceeded"}, status=400)
    
    # Check stars for paid cases
    if not case["free"]:
        if not await db.spend_stars(user["id"], case["costStars"]):
            return web.json_response({"error": "insufficient stars"}, status=400)
    
    # Roll item
    item = _roll_item(case_id)
    if not item:
        return web.json_response({"error": "failed to roll item"}, status=500)
    
    # Record the open
    await db.record_case_open(user["id"], case_id, item["key"])
    
    # Add to inventory
    await db.add_to_inventory(
        user["id"],
        item["key"],
        item["name"],
        item["rarity"],
        item["sell"],
        item.get("grantsPremium", False)
    )
    
    # Grant premium if item grants it
    if item.get("grantsPremium"):
        await db.set_pro_status(user["id"], days=1)
    
    return web.json_response({"ok": True, "item": item})


async def handle_inventory(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    inventory = await db.get_inventory(user["id"])
    return web.json_response({"inventory": inventory})


async def handle_sell_item(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    item_id = body.get("item_id")
    
    if not item_id:
        return web.json_response({"error": "item_id required"}, status=400)
    
    # Get item to check sell price
    inventory = await db.get_inventory(user["id"])
    item = next((i for i in inventory if i["id"] == item_id), None)
    if not item:
        return web.json_response({"error": "item not found"}, status=404)
    
    # Remove from inventory and add coins
    if await db.remove_from_inventory(item_id, user["id"]):
        await db.add_coins(user["id"], item["sell_price"])
        return web.json_response({"ok": True, "coins": item["sell_price"]})
    
    return web.json_response({"error": "failed to sell item"}, status=400)


# Quests API
QUESTS_CONFIG = [
    {"id": "a1", "game": "CS:GO", "title": "Разминка на 35 минут", "desc": "Сыграй 35 минут в CS:GO", "minutes": 35, "points": 100, "coins": 15, "withTeammate": False},
    {"id": "a2", "game": "War Thunder", "title": "Танковый экипаж", "desc": "Сыграй 60 минут в War Thunder в отряде с тиммейтом из бота", "minutes": 60, "points": 150, "coins": 35, "withTeammate": True},
    {"id": "a3", "game": "Roblox", "title": "Соседи по Brookhaven", "desc": "Сыграй 120 минут в Roblox Brookhaven с тиммейтом", "minutes": 120, "points": 220, "coins": 65, "withTeammate": True},
]


async def handle_quests(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    progress = await db.get_all_quests_progress(user["id"])
    progress_map = {p["quest_id"]: p for p in progress}
    
    quests_with_progress = []
    for quest in QUESTS_CONFIG:
        prog = progress_map.get(quest["id"])
        quests_with_progress.append({
            **quest,
            "progress_minutes": prog["progress_minutes"] if prog else 0,
            "completed": prog["completed"] if prog else False,
        })
    
    return web.json_response({"quests": quests_with_progress})


async def handle_update_quest(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    body = await request.json()
    quest_id = body.get("quest_id")
    minutes = body.get("minutes", 0)
    
    if not quest_id:
        return web.json_response({"error": "quest_id required"}, status=400)
    
    quest = next((q for q in QUESTS_CONFIG if q["id"] == quest_id), None)
    if not quest:
        return web.json_response({"error": "quest not found"}, status=404)
    
    # Update progress
    await db.update_quest_progress(user["id"], quest_id, minutes)
    
    # Check if completed
    prog = await db.get_quest_progress(user["id"], quest_id)
    if prog and prog["progress_minutes"] >= quest["minutes"] and not prog["completed"]:
        await db.complete_quest(user["id"], quest_id)
        await db.add_points(user["id"], quest["points"])
        await db.add_coins(user["id"], quest["coins"])
        return web.json_response({"ok": True, "completed": True, "points": quest["points"], "coins": quest["coins"]})
    
    return web.json_response({"ok": True, "completed": prog["completed"] if prog else False})


async def handle_leaderboard(request: web.Request):
    db: Database = request.app["db"]
    limit = int(request.query.get("limit", 10))
    leaderboard_data = await db.get_leaderboard(limit)
    
    # Format for frontend
    formatted = []
    for entry in leaderboard_data:
        formatted.append({
            "id": str(entry["user_id"]),
            "nick": entry["username"] or entry["first_name"] or f"User{entry['user_id']}",
            "avatar": "/placeholder-user.jpg",  # Default avatar
            "stars": entry["total_stars"],
            "coins": 0,  # Can be calculated from inventory if needed
            "premium": entry["is_premium"]
        })
    
    return web.json_response({"leaderboard": formatted})


def create_app(db: Database, settings: Settings, bot) -> web.Application:
    app = web.Application(middlewares=[auth_middleware])
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
    
    # Nexus API endpoints
    app.router.add_get("/api/currency", handle_currency)
    app.router.add_get("/api/cases", handle_cases)
    app.router.add_post("/api/cases/open", handle_open_case)
    app.router.add_get("/api/inventory", handle_inventory)
    app.router.add_post("/api/inventory/sell", handle_sell_item)
    app.router.add_get("/api/quests", handle_quests)
    app.router.add_post("/api/quests/update", handle_update_quest)
    app.router.add_get("/api/leaderboard", handle_leaderboard)

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
