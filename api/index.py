"""
Vercel Serverless Function для Web API (Mini App endpoints)

Vercel Python runtime требует, чтобы entrypoint был либо `app` (ASGI/WSGI),
либо `application`, либо класс `handler` (BaseHTTPRequestHandler). Обычная
функция `handler(request, context)` больше НЕ поддерживается новым
@vercel/python — если её определить, билдер выбирает `app` как WSGI-приложение.
Поэтому здесь `app` — полноценное WSGI-приложение, которое мостит запрос в
aiohttp-приложение.
"""
import asyncio
import json
import logging
import os
import sys
import threading
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальные объекты
_app = None
_db = None
_bot = None
_loop = None
_loop_lock = threading.Lock()

import hashlib

_webhook_dp = None
_webhook_bot = None
_webhook_db = None
_webhook_secret = None


def _imports():
    from aiohttp import web
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    from config import load_settings
    from database import Database
    from webapp.server import create_app
    return web, Bot, DefaultBotProperties, ParseMode, load_settings, Database, create_app


def _init_webhook():
    """Ленивая инициализация бота/диспетчера для webhook."""
    global _webhook_dp, _webhook_bot, _webhook_db, _webhook_secret
    if _webhook_dp is None:
        from aiogram import Bot as WBot, Dispatcher
        from aiogram.client.default import DefaultBotProperties as WDP
        from aiogram.enums import ParseMode as WP
        from aiogram.fsm.storage.memory import MemoryStorage
        from config import load_settings
        from database import Database
        from handlers import start, profile, search, guides, payments, admin, discord
        from middleware import InjectMiddleware, RateLimitMiddleware

        settings = load_settings()
        _webhook_db = Database(settings.database_url, bot_token=settings.bot_token, fernet_key=settings.fernet_key)
        _webhook_bot = WBot(token=settings.bot_token, default=WDP(parse_mode=WP.HTML))
        _webhook_dp = Dispatcher(storage=MemoryStorage())
        _webhook_dp.update.middleware(RateLimitMiddleware())
        _webhook_dp.update.middleware(InjectMiddleware(_webhook_db, settings))
        _webhook_dp.include_router(start.router)
        _webhook_dp.include_router(profile.router)
        _webhook_dp.include_router(search.router)
        _webhook_dp.include_router(guides.router)
        _webhook_dp.include_router(payments.router)
        _webhook_dp.include_router(admin.router)
        _webhook_dp.include_router(discord.router)
        _webhook_secret = hashlib.sha256(settings.bot_token.encode()).hexdigest()
        logger.info("Webhook bot/dispatcher initialized")
    return _webhook_bot, _webhook_dp, _webhook_db, _webhook_secret


def get_app():
    """Ленивая инициализация aiohttp app"""
    global _app, _db, _bot, _loop
    if _app is None:
        web, Bot, DefaultBotProperties, ParseMode, load_settings, Database, create_app = _imports()
        # Один общий event loop на процесс: pool/сессия привязываются к нему
        # и переиспользуются между запросами (иначе cross-loop asyncpg ошибки).
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)

        settings = load_settings()

        _db = Database(
            settings.database_url,
            bot_token=settings.bot_token,
            fernet_key=settings.fernet_key
        )

        _bot = Bot(
            token=settings.bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )

        _app = create_app(_db, settings, _bot)
        # aiohttp >= 3.12 собирает middleware-цепочку только в pre_freeze(),
        # который обычно вызывается AppRunner.setup(). Мы вызываем _handle()
        # напрямую (WSGI-мост), поэтому без freeze() все middleware (auth,
        # ban, rate-limit) молча пропускаются. Замораживаем app вручную.
        try:
            _app.freeze()
        except Exception:
            logger.exception("app.freeze() failed")
        _app["db_ready"] = False
        _app["db_error"] = ""

        # Подключаем БД асинхронно
        async def _init_db():
            try:
                await _db.connect()
                _app["db_ready"] = True
                _app["db_error"] = ""
                logger.info("Database connected")
            except Exception as e:
                _app["db_error"] = str(e)
                logger.error(f"DB connection failed: {e}")

        _loop.run_until_complete(_init_db())
        logger.info("Web app initialized")

    return _app


def _wsgi_headers(environ: dict) -> dict:
    """Преобразует WSGI environ в словарь HTTP-заголовков."""
    headers = {}
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            header_name = key[5:].replace("_", "-").title()
            headers[header_name] = value
    if environ.get("CONTENT_TYPE"):
        headers["Content-Type"] = environ["CONTENT_TYPE"]
    if environ.get("CONTENT_LENGTH"):
        headers["Content-Length"] = environ["CONTENT_LENGTH"]
    return headers


# Vercel entry point — WSGI-приложение (это то, что видит @vercel/python)
def app(environ, start_response):
    """WSGI application for Vercel — мост в aiohttp-приложение."""
    try:
        method = environ.get("REQUEST_METHOD", "GET")
        # PATH_INFO уже декодирован; RAW_URI (если есть) содержит полный путь с query.
        raw_uri = environ.get("RAW_URI", "")
        if raw_uri:
            path = raw_uri
        else:
            path = environ.get("PATH_INFO", "/api/")
            query = environ.get("QUERY_STRING", "")
            if query:
                path = path + "?" + query

        headers = _wsgi_headers(environ)

        # Читаем тело запроса
        body = b""
        try:
            content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
            if content_length > 0:
                body = environ["wsgi.input"].read(content_length)
        except Exception:
            pass

        result = _process_request(method, path, headers, body)

        status_code = result.get("statusCode", 500)
        response_headers = result.get("headers", {})
        response_body = result.get("body", "")
        if not isinstance(response_body, str):
            response_body = str(response_body)

        header_list = []
        has_content_type = False
        for k, v in (response_headers or {}).items():
            if k.lower() == "content-type":
                has_content_type = True
            header_list.append((str(k), str(v)))
        if not has_content_type:
            header_list.append(("Content-Type", "application/json; charset=utf-8"))

        start_response(
            f"{status_code} " + _status_text(status_code),
            header_list,
        )
        return [response_body.encode("utf-8")]
    except Exception:
        logger.exception("WSGI app error")
        trace = traceback.format_exc()
        start_response("500 Internal Server Error", [("Content-Type", "application/json; charset=utf-8")])
        return [json.dumps({"error": "internal server error", "trace": trace[-2000:]}).encode("utf-8")]


def _status_text(code: int) -> str:
    mapping = {
        200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently",
        302: "Found", 304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
        405: "Method Not Allowed", 408: "Request Timeout", 409: "Conflict",
        413: "Payload Too Large", 429: "Too Many Requests", 499: "Client Closed Request",
        500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
        504: "Gateway Timeout",
    }
    return mapping.get(code, "Error")


def _handle_webhook(path, body):
    """Обработка Telegram webhook напрямую из WSGI."""
    global _loop, _loop_lock
    try:
        from aiogram.types import Update as TGUpdate

        bot, dp, db, webhook_secret = _init_webhook()
        parts = path.strip("/").split("/")
        if len(parts) < 2:
            return {"statusCode": 404, "headers": {}, "body": '{"error":"not found"}'}
        secret = parts[1]
        if secret != webhook_secret:
            return {"statusCode": 403, "headers": {}, "body": '{"error":"invalid secret"}'}
        if db._pool is None:
            _loop.run_until_complete(db.connect())
        body_str = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
        request_body = json.loads(body_str)
        update = TGUpdate(**request_body)
        _loop.run_until_complete(dp.feed_update(bot, update))
        return {"statusCode": 200, "headers": {}, "body": '{"ok":true}'}
    except Exception as e:
        logger.exception(f"Webhook error: {e}")
        return {"statusCode": 500, "headers": {}, "body": json.dumps({"error": str(e)})}


def _process_request(method, path, headers, body):
    """Основная логика: прогоняет запрос через aiohttp-приложение."""
    global _loop, _loop_lock
    try:
        with _loop_lock:
            web_app = get_app()

            from aiohttp import web

            if path.startswith("/webhook/") and method == "POST":
                return _handle_webhook(path, body)

            if path.startswith("/api/") and path != "/" and len(path) > 1 and path.endswith("/"):
                path = path.rstrip("/")

            # Запросы выполняются на ОБЩЕМ event loop (см. get_app), чтобы pool и
            # ClientSession не привязывались к новому/закрытому loop.
            async def _handle():
                from aiohttp.test_utils import make_mocked_request
                from io import BytesIO

                payload = BytesIO(body.encode() if isinstance(body, str) else body)

                req = make_mocked_request(
                    method=method,
                    path=path,
                    headers=headers,
                    app=web_app,
                )

                response = await web_app._handle(req)

                response_body = b""

                if hasattr(response, '_body') and response._body:
                    response_body = response._body
                elif hasattr(response, 'body') and response.body:
                    response_body = response.body
                elif hasattr(response, 'text') and response.text:
                    response_body = response.text.encode('utf-8')

                return {
                    "statusCode": response.status,
                    "headers": {k: v for k, v in response.headers.items()},
                    "body": response_body.decode('utf-8', errors='replace') if response_body else ""
                }

            result = _loop.run_until_complete(_handle())
            return result

    except BaseException as e:
        logger.exception(f"Handler error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json; charset=utf-8"},
            "body": json.dumps({"error": str(e), "type": type(e).__name__, "trace": traceback.format_exc()[-3000:]})
        }


# Для локального тестирования и обратной совместимости.
def handler(request, context=None):
    """
    Принимает Vercel-совместимый request (dict или объект с атрибутами).
    """
    if isinstance(request, dict):
        method = request.get("method", "GET")
        path = request.get("path", "/api/")
        headers = request.get("headers", {})
        body = request.get("body", "")
    else:
        method = getattr(request, 'method', 'GET')
        path = getattr(request, 'path', '/api/')
        headers = getattr(request, 'headers', {})
        body = getattr(request, 'body', '')
    return _process_request(method, path, headers, body)