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
        
        # Создаём event loop для обработки
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def _handle():
            from aiohttp import web
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
            
            # Читаем body
            response_body = b""
            if response.body:
                response_body = response.body
            elif hasattr(response, '_body'):
                response_body = response._body or b""
            
            return {
                "statusCode": response.status,
                "headers": {k: v for k, v in response.headers.items()},
                "body": response_body.decode('utf-8', errors='replace') if response_body else ""
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
