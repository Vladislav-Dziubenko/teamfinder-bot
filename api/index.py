"""
Vercel Serverless Function для Web API (Mini App endpoints)
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from aiohttp import web
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from config import load_settings
from database import Database
from webapp.server import create_app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальные объекты
_app = None
_db = None
_bot = None


def get_app():
    """Ленивая инициализация aiohttp app"""
    global _app, _db, _bot
    
    if _app is None:
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
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_init_db())
        loop.close()
        
        logger.info("Web app initialized")
    
    return _app


def handler(request, context=None):
    """
    Vercel Serverless Function handler для API
    """
    try:
        app = get_app()
        
        # Конвертируем Vercel request в aiohttp request
        if isinstance(request, dict):
            method = request.get("method", "GET")
            path = request.get("path", "/")
            headers = request.get("headers", {})
            body = request.get("body", "")
            query_string = request.get("query", "")
        else:
            method = getattr(request, 'method', 'GET')
            path = getattr(request, 'path', '/')
            headers = getattr(request, 'headers', {})
            body = getattr(request, 'body', '')
            query_string = getattr(request, 'query', '')
        
        # Создаём фейковый aiohttp request
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def _handle():
            # Находим нужный handler в app.router
            for route in app.router.routes():
                match = route.match(path)
                if match:
                    # Создаём запрос
                    req = web.Request(
                        method=method,
                        url=path + (f"?{query_string}" if query_string else ""),
                        headers=headers,
                        app=app,
                        payload=None,
                        protocol=None,
                        transport=None,
                        writer=None
                    )
                    
                    # Вызываем handler
                    response = await route.handle(req)
                    
                    return {
                        "statusCode": response.status,
                        "headers": dict(response.headers),
                        "body": response.body.decode() if response.body else ""
                    }
            
            # 404
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Not found"})
            }
        
        result = loop.run_until_complete(_handle())
        loop.close()
        
        return result
        
    except Exception as e:
        logger.exception(f"Handler error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
