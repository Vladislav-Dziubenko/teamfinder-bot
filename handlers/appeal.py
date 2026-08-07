"""Апелляции забаненных игроков.

Забаненный видит на экране блокировки кнопку «Написать модерации» —
ссылку на ЛС бота. Любое его текстовое сообщение боту пересылается
всем админам (settings.admin_ids) с пометкой-карточкой, чтобы модератор
мог ответить игроку напрямую.

Хендлер регистрируется ПОСЛЕДНИМ (main.py) — фильтров у него нет,
поэтому все команды/кнопки обрабатываются раньше, а сюда попадает
только «неизвестный» текст.
"""

import logging

from aiogram import Router
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()


@router.message()
async def ban_appeal_message(message: Message, db: Database, settings: Settings):
    if message.chat.type != "private" or not message.from_user or not message.text:
        return

    if not await db.is_globally_banned(message.from_user.id):
        return  # не забанен — оставляем поведение как было (без ответа)

    sender = message.from_user
    sender_ref = f"@{sender.username}" if sender.username else f"ID {sender.id}"
    forwarded = False
    for admin_id in settings.admin_ids:
        try:
            await message.forward(admin_id)
            await message.bot.send_message(
                admin_id,
                f"⚠️ <b>Апелляция о блокировке</b>\n\n"
                f"Игрок: {sender_ref} (<code>{sender.id}</code>)\n"
                f"Ответить напрямую: {sender_ref or 'нет username — ответ в пересланном сообщении'}",
            )
            forwarded = True
        except Exception as e:
            logging.warning("[APPEAL] forward to admin %s failed: %s", admin_id, e)

    if forwarded:
        await message.answer(
            "📨 <b>Апелляция отправлена модерации.</b>\n\n"
            "Ответ придёт сюда. Ожидайте, пожалуйста."
        )
    else:
        await message.answer("❌ Не удалось отправить апелляцию. Попробуйте позже.")
