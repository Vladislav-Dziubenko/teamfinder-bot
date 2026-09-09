"""Команда /help — что умеет бот и Страж, простым языком."""

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()


@router.message(Command("help"))
async def cmd_help(message: Message, db: Database, settings: Settings):
    del db, settings
    await message.answer(
        "🤖 <b>Что я умею</b>\n\n"
        "💬 <b>Болтаю</b> — позови Стража в общем чате мини-аппа, поболтаем.\n"
        "🔎 <b>Ищу свежее</b> — спроси про новости, счёт, курс, погоду: "
        "схожу в интернет (увидишь «🔎 Сейчас гляну…», это занимает секунды).\n"
        "🛡️ <b>Слежу за порядком</b> — оскорбления, скам и спам в общем чате "
        "могу предупредить, удалить или забанить.\n"
        "🤖 <b>/ask вопрос</b> — развёрнутый ответ в личке.\n\n"
        "Команды: /start /ask /help /discord /balance /deleteanketa"
    )
