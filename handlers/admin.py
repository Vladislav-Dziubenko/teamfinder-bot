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


@router.message(Command("donatevidacha"))
async def admin_donate(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 4:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/donatevidacha &lt;user_id&gt; &lt;coins&gt; &lt;stars&gt;</code>\n\n"
            "Пример:\n"
            "<code>/donatevidacha 123456789 1000 50</code>"
        )
        return

    try:
        target_id = int(args[1])
        coins = int(args[2])
        stars = int(args[3])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id, coins и stars должны быть числами.")
        return

    if coins < 0 or stars < 0:
        await message.answer("❌ <b>Ошибка:</b> значения не могут быть отрицательными.")
        return

    if coins > 0:
        await db.adjust_currency(target_id, coins=coins)
    if stars > 0:
        await db.adjust_currency(target_id, stars=stars)

    await message.answer(
        "✅ <b>Выдача выполнена!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🪙 Nexus Coin: <b>+{coins}</b>\n"
        f"⭐ Nexus Stars: <b>+{stars}</b>"
    )
