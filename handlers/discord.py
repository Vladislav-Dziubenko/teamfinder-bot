from aiogram import Router, F
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from config import Settings
from database import Database

router = Router()


@router.message(Command("discord"))
async def cmd_discord(message: Message, db: Database, settings: Settings):
    user_id = message.from_user.id
    conn = await db.get_discord_connection(user_id)

    if conn:
        name = conn["discord_global_name"] or conn["discord_username"] or "—"
        discord_id = conn["discord_id"]
        text = (
            "🔗 <b>Discord привязан</b>\n\n"
            f"👤 <b>{name}</b>\n"
            f"🆔 <code>{discord_id}</code>\n\n"
            "Твой Discord аккаунт связан с профилем TeamFinder."
        )
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отвязать Discord", callback_data="discord:unlink")],
        ])
    else:
        if not settings.discord_client_id:
            text = "❌ Discord интеграция пока не настроена администратором."
            kb = None
        else:
            text = (
                "🔗 <b>Привяжи Discord к профилю</b>\n\n"
                "Это позволит другим игрокам видеть твой Discord "
                "и покажет твои игровые аккаунты (Steam и др.)."
            )
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🔗 Привязать Discord",
                                      url=f"{settings.webapp_url}?discord_auth=1")],
            ])

    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data == "discord:unlink")
async def discord_unlink(callback: CallbackQuery, db: Database):
    await db.remove_discord_connection(callback.from_user.id)
    await callback.message.edit_text("✅ Discord отвязан от твоего профиля.")
    await callback.answer()