from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery

from config import Settings
from database import Database
from webapp.redis_client import rate_limit_check


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
