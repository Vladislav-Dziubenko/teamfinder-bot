from typing import Any, Awaitable, Callable, Dict
from collections import defaultdict
from time import time

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery

from config import Settings
from database import Database


class RateLimitMiddleware(BaseMiddleware):
    def __init__(self, limit: int = 10, window: int = 60):
        self.limit = limit
        self.window = window
        self.user_requests: Dict[int, list[float]] = defaultdict(list)

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
            now = time()
            self.user_requests[user_id] = [
                t for t in self.user_requests[user_id] if now - t < self.window
            ]

            if len(self.user_requests[user_id]) >= self.limit:
                return None  # Игнорируем запросы, превышающие лимит

            self.user_requests[user_id].append(now)

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
