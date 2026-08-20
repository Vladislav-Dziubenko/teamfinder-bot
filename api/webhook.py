"""
Vercel Serverless Function для обработки Telegram webhook
"""
import asyncio
import hashlib
import json
import logging
import os
import sys
import threading
from pathlib import Path

# Добавляем корневую папку в PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import Update

from config import load_settings
from database import Database
from handlers import start, profile, search, guides, payments, admin, discord
from middleware import InjectMiddleware, RateLimitMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальные объекты (переиспользуются между запросами)
_bot = None
_dp = None
_db = None
_settings = None
_webhook_secret = None
_loop = None
_loop_lock = threading.Lock()


def get_bot_and_dp():
    """Ленивая инициализация бота и диспетчера"""
    global _bot, _dp, _db, _settings, _webhook_secret
    
    if _bot is None:
        _settings = load_settings()
        
        _db = Database(
            _settings.database_url,
            bot_token=_settings.bot_token,
            fernet_key=_settings.fernet_key
        )
        
        _bot = Bot(
            token=_settings.bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        
        _dp = Dispatcher(storage=MemoryStorage())
        _dp.update.middleware(RateLimitMiddleware())
        _dp.update.middleware(InjectMiddleware(_db, _settings))
        
        _dp.include_router(start.router)
        _dp.include_router(profile.router)
        _dp.include_router(search.router)
        _dp.include_router(guides.router)
        _dp.include_router(payments.router)
        _dp.include_router(admin.router)
        _dp.include_router(discord.router)
        
        _webhook_secret = hashlib.sha256(_settings.bot_token.encode()).hexdigest()
        
        logger.info("Bot and Dispatcher initialized")
    
    return _bot, _dp, _db, _webhook_secret


async def handle_webhook(request_body: dict, secret_from_path: str):
    """Обработка webhook от Telegram"""
    bot, dp, db, webhook_secret = get_bot_and_dp()
    
    # Проверка secret token
    if secret_from_path != webhook_secret:
        logger.warning(f"Invalid webhook secret: {secret_from_path}")
        return {
            "statusCode": 403,
            "body": json.dumps({"error": "Invalid secret"})
        }
    
    # Подключаем БД если не подключена
    if db._pool is None:
        try:
            await db.connect()
        except Exception as e:
            logger.error(f"DB connection failed: {e}")
            return {
                "statusCode": 503,
                "body": json.dumps({"error": "Database not ready"})
            }
    
    # Обрабатываем Update
    try:
        update = Update(**request_body)
        await dp.feed_update(bot, update)
        return {
            "statusCode": 200,
            "body": json.dumps({"ok": True})
        }
    except Exception as e:
        logger.exception(f"Error processing update: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }


# Vercel entry point — WSGI-приложение (это то, что видит @vercel/python).
# Обычная функция `handler(request, context)` больше не поддерживается новым
# @vercel/python, поэтому `app` — полноценный WSGI-мост в handler-логику.
def app(environ, start_response):
    """WSGI application for Vercel — мост в handler."""
    try:
        request = {
            "method": environ.get("REQUEST_METHOD", "GET"),
            "path": environ.get("RAW_URI", "") or environ.get("PATH_INFO", "/"),
            "headers": environ,
            "body": b"",
        }
        try:
            content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
            if content_length > 0:
                request["body"] = environ["wsgi.input"].read(content_length)
        except Exception:
            pass

        result = handler(request, None)

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

        start_response(f"{status_code} OK", header_list)
        return [response_body.encode("utf-8")]
    except Exception:
        logger.exception("WSGI app error")
        import traceback
        start_response("500 Internal Server Error", [("Content-Type", "application/json; charset=utf-8")])
        return [json.dumps({"error": "internal server error", "trace": traceback.format_exc()[-2000:]}).encode("utf-8")]

def handler(request, context=None):
    """
    Vercel Serverless Function handler
    """
    try:
        # Для Vercel request это dict с полями:
        # - body: строка с JSON
        # - path: путь запроса
        # - method: HTTP метод
        
        if isinstance(request, dict):
            # Vercel format
            body_str = request.get("body", "{}")
            path = request.get("path", "")
            method = request.get("method", "POST")
        else:
            # AWS Lambda format (на всякий случай)
            body_str = request.body if hasattr(request, 'body') else "{}"
            path = request.path if hasattr(request, 'path') else ""
            method = request.method if hasattr(request, 'method') else "POST"
        
        if method != "POST":
            return {
                "statusCode": 405,
                "body": json.dumps({"error": "Method not allowed"})
            }
        
        # Извлекаем secret из пути /webhook/{secret}
        parts = path.strip("/").split("/")
        if len(parts) < 2 or parts[0] != "webhook":
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Not found"})
            }
        
        secret = parts[1]
        request_body = json.loads(body_str)
        
# Запускаем async handler на ОБЩЕМ event loop (переиспользуется между
        # запросами), чтобы pool/сессия бота не привязывались к закрытому loop.
        global _loop, _loop_lock
        with _loop_lock:
            if _loop is None:
                _loop = asyncio.new_event_loop()
                asyncio.set_event_loop(_loop)
            result = _loop.run_until_complete(handle_webhook(request_body, secret))

        return result
        
    except Exception as e:
        logger.exception(f"Handler error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
