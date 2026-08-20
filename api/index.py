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
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальные объекты
_app = None
_db = None
_bot = None

# Тяжёлые импорты отложены — чтобы ошибка импорта попадала в handler и
# возвращалась в теле ответа, а не роняла функцию до запуска handler.
def _imports():
    from aiohttp import web
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    from config import load_settings
    from database import Database
    from webapp.server import create_app
    return web, Bot, DefaultBotProperties, ParseMode, load_settings, Database, create_app


def get_app():
    """Ленивая инициализация aiohttp app"""
    global _app, _db, _bot
    if _app is None:
        web, Bot, DefaultBotProperties, ParseMode, load_settings, Database, create_app = _imports()
        # Создаём event loop ПЕРЕД инициализацией
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

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

        loop.run_until_complete(_init_db())
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


def _process_request(method, path, headers, body):
    """Основная логика: прогоняет запрос через aiohttp-приложение."""
    try:
        web_app = get_app()

        from aiohttp import web

        # Vercel редиректит "/api/games" → "/api/games/" (trailingSlash: true в
        # next.config.mjs). Роуты aiohttp зарегистрированы БЕЗ завершающего слэша,
        # поэтому убираем его у путей /api/* (кроме корневого "/"), иначе запрос
        # падает в статический catch-all и возвращает пустое тело.
        if path.startswith("/api/") and path != "/" and len(path) > 1 and path.endswith("/"):
            path = path.rstrip("/")

        # Создаём event loop для обработки
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

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

        result = loop.run_until_complete(_handle())
        loop.close()
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