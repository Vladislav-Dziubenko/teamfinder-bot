"""Команда /ask — развёрнутые ответы ИИ в личке бота.

В отличие от собеседника в общем чате (1-2 предложения, общий кулдаун),
здесь длинные ответы и персональные лимиты: 120с между вопросами,
15 вопросов в сутки на юзера. Квота провайдера общая (брейкер _judge_paused).
"""

import logging
import time
from datetime import datetime

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()
logger = logging.getLogger(__name__)

_ASK_COOLDOWN_S = 120
_ASK_MAX_PER_DAY = 15

_last_ask: dict[int, float] = {}
_day_count: dict[tuple[int, str], int] = {}


@router.message(Command("ask"))
async def ask_ai(message: Message, db: Database, settings: Settings):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        await message.answer(
            "🤖 <b>Спроси ИИ</b>\n\nИспользование:\n<code>/ask как контрить AWP на Mirage?</code>\n\n"
            f"Лимиты: не чаще раза в {_ASK_COOLDOWN_S // 60} мин, {_ASK_MAX_PER_DAY} вопросов в сутки."
        )
        return
    user_id = message.from_user.id
    now = time.time()
    wait = _ASK_COOLDOWN_S - (now - _last_ask.get(user_id, 0))
    if wait > 0:
        await message.answer(f"⏳ Подожди {int(wait)} сек перед следующим вопросом.")
        return
    day = datetime.utcnow().strftime("%Y-%m-%d")
    used = _day_count.get((user_id, day), 0)
    if used >= _ASK_MAX_PER_DAY:
        await message.answer("🌙 Дневной лимит вопросов исчерпан, приходи завтра.")
        return
    _last_ask[user_id] = now
    _day_count[(user_id, day)] = used + 1
    try:
        await message.bot.send_chat_action(message.chat.id, "typing")
    except Exception:
        pass
    try:
        memory = await db.ai_memory_prompt()
    except Exception:
        memory = ""
    from services.ai_moderation import ai_answer
    try:
        answer = await ai_answer(parts[1].strip()[:800], settings, memory)
    except Exception as exc:
        logger.warning("[ai-mod] /ask failed: %s", exc)
        answer = None
    if not answer:
        await message.answer("😶 ИИ сейчас недоступен (квота/лимит). Попробуй позже.")
        return
    await db.audit_log(user_id, "ai_ask", f"len={len(answer)}")
    await message.answer(answer)
