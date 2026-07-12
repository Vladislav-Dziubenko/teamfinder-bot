from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()


@router.message(Command("stats"))
async def admin_stats(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    s = await db.stats()
    await message.answer(
        "📊 <b>Статистика TeamFinder</b>\n\n"
        f"👥 Пользователей: {s['users']}\n"
        f"📝 Анкет: {s['profiles']}\n"
        f"💳 Покупок: {s['purchases']}\n"
        f"⭐ Stars заработано: {s['stars']}"
    )
