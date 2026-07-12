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

    app_id = await db.apply_to_team(team_id, user["id"], message)
    return web.json_response({"application_id": app_id})


async def handle_user_applications(request: web.Request):
    db: Database = request.app["db"]
    user = _get_user(request)
    applications = await db.get_user_applications(user["id"])
    return web.json_response({"applications": applications})


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

    app.router.add_static("/", STATIC_DIR, show_index=False)
    return app
