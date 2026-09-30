import logging
import os
from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery

from config import Settings
from database import Database
from webapp.redis_client import rate_limit_check

logger = logging.getLogger(__name__)


def build_fsm_storage():
    """FSM-хранилище: Redis (Upstash) если задан REDIS_URL, иначе память.
    На serverless (Vercel) инстансы не делят память — многошаговые сценарии
    (создание анкеты, оплаты) разваливались бы между запросами. Redis общий
    для всех инстансов. Fail-open в MemoryStorage при любой ошибке."""
    try:
        from aiogram.fsm.storage.memory import MemoryStorage
        url = (os.environ.get("REDIS_URL", "") or "").strip()
        if not url:
            return MemoryStorage()
        try:
            from aiogram.fsm.storage.redis import RedisStorage
            from redis.asyncio import Redis as AsyncRedis
        except Exception as e:
            logger.warning("FSM Redis deps missing, using memory: %s", e)
            return MemoryStorage()
        try:
            client = AsyncRedis.from_url(url, decode_responses=False)
            storage = RedisStorage(client)
            logger.info("FSM storage: Redis")
            return storage
        except Exception as e:
            logger.warning("FSM Redis init failed, using memory: %s", e)
            return MemoryStorage()
    except Exception as e:
        logger.warning("FSM storage fallback to memory: %s", e)
        from aiogram.fsm.storage.memory import MemoryStorage
        return MemoryStorage()


class RateLimitMiddleware(BaseMiddleware):
    """Ограничение частоты апдейтов Telegram (сообщений/кнопок) на пользователя.

    Счётчик хранится в Redis (sliding window, ключ tg:{user_id}) — лимит общий
    для всех инстансов процесса (готов к горизонтальному масштабированию).
    Если Redis недоступен — rate_limit_check сам переключается на in-memory
    fallback, поэтому поведение остаётся прежним.
    """

    def __init__(self, limit: int = 10, window: int = 60):
        self.limit = limit
        self.window = window

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any],
    ) -> Any:
        user_id = None
        if isinstance(event, Message) and event.from_user:
            user_id = event.from_user.id
        elif isinstance(event, CallbackQuery) and event.from_user:
            user_id = event.from_user.id

        if user_id:
            blocked = await rate_limit_check(f"tg:{user_id}", self.limit, self.window)
            if blocked:
                return None  # Игнорируем запросы, превышающие лимит

        return await handler(event, data)


class InjectMiddleware(BaseMiddleware):
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any],
    ) -> Any:
        data["db"] = self.db
        data["settings"] = self.settings
        return await handler(event, data)
