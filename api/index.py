"""
Vercel Serverless Function для Web API (Mini App endpoints)
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

        # Подключаем БД асинхронно
        async def _init_db():
            try:
                await _db.connect()
                _app["db_ready"] = True
                logger.info("Database connected")
            except Exception as e:
                logger.error(f"DB connection failed: {e}")

        loop.run_until_complete(_init_db())
        logger.info("Web app initialized")

    return _app


# Vercel entry point - must be named 'app' or 'handler'
def app(environ, start_response):
    """WSGI application for Vercel"""
    return handler(environ, start_response)

def handler(request, context=None):
    """
    Vercel Serverless Function handler для API
    """
    try:
        web_app = get_app()

        # Парсим Vercel request
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

        from aiohttp import web

        # Создаём event loop для обработки
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _handle():
            from aiohttp.test_utils import make_mocked_request
            from io import BytesIO

            # Создаём mock запрос для aiohttp
            payload = BytesIO(body.encode() if isinstance(body, str) else body)

            req = make_mocked_request(
                method=method,
                path=path,
                headers=headers,
                app=web_app,
            )

            # Обрабатываем через aiohttp app
            response = await web_app._handle(req)

            # Читаем body в зависимости от типа ответа
            response_body = b""

            # FileResponse, StreamResponse и другие
            if hasattr(response, '_body') and response._body:
                response_body = response._body
            elif hasattr(response, 'body') and response.body:
                response_body = response.body
            elif hasattr(response, 'text') and response.text:
                response_body = response.text.encode('utf-8')

            # Если тело всё ещё пустое, пробуем прочитать как stream
            if not response_body and hasattr(response, 'body_length') and response.body_length:
                try:
                    # Для StreamResponse читаем через prepare/write
                    response_body = b""
                except:
                    pass

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