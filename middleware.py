from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from config import Settings
from database import Database


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
