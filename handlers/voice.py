"""Голосовые через нативный микрофон Telegram (запасной путь).

Если WebView мини-аппа режет захват микрофона на уровне хоста (getUserMedia
всегда NotAllowedError, что бы ни нажимал юзер), человек жмёт в личке кнопку
«🎤 через Telegram» → deep link t.me/<bot>?start=voice_<peerId> → бот ждёт
следующее голосовое → скачивает файл через getFile → кладёт в переписку
dm-{a}-{b} → получатель видит его в мини-аппе при следующем поллинге.
"""

import io
import logging
from datetime import datetime, timedelta

from aiogram import Bot, F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from database import Database
from webapp.redis_client import cache_delete, cache_delete_pattern, cache_get

router = Router()

VOICE_ROUTE_TTL = 600  # секунд живёт ожидание войса после deep link
VOICE_MAX_BYTES = 5 * 1024 * 1024


def _dm_chat_id(a: int, b: int) -> str:
    x, y = sorted([a, b])
    return f"dm-{x}-{y}"


@router.message(F.voice)
async def voice_relay(message: Message, db: Database, bot: Bot):
    if message.chat.type != "private" or not message.from_user or not message.voice:
        return
    sender = message.from_user
    logging.info(
        "[VOICE] got voice from=%s dur=%s size=%s",
        sender.id, message.voice.duration, message.voice.file_size,
    )

    if await db.is_globally_banned(sender.id):
        await message.answer("📨 <b>Вы заблокированы.</b> Голосовые недоступны.")
        return

    route = await cache_get(f"voice_route:{sender.id}")
    logging.info("[VOICE] route for %s: %s", sender.id, "found" if route else "missing")
    if not route or not route.get("peer"):
        # Войс без активного маршрута — тихо подсказываем правильный путь.
        await message.answer(
            "🎤 Чтобы отправить голосовое в лички NEXUS:\n\n"
            "1️⃣ Открой диалог в мини-аппе\n"
            "2️⃣ Нажми «🎤 через Telegram»\n"
            "3️⃣ Вернись сюда и пришли голосовое следующим сообщением"
        )
        return

    try:
        peer_id = int(route["peer"])
    except (TypeError, ValueError):
        await cache_delete(f"voice_route:{sender.id}")
        return
    if peer_id == sender.id:
        await cache_delete(f"voice_route:{sender.id}")
        return

    peer_exists = await db.pool.fetchval("SELECT 1 FROM users WHERE user_id = $1", peer_id)
    if not peer_exists:
        await cache_delete(f"voice_route:{sender.id}")
        await message.answer("❌ Получатель не найден. Открой диалог заново через мини-апп.")
        return

    file_size = message.voice.file_size or 0
    if file_size > VOICE_MAX_BYTES:
        await message.answer("❌ Голосовое слишком большое (макс. 5 МБ). Запиши покороче — маршрут сохранён, присылай снова.")
        return

    try:
        tg_file = await bot.get_file(message.voice.file_id)
        buf = io.BytesIO()
        await bot.download_file(tg_file.file_path, buf)
        data = buf.getvalue()
    except Exception as e:
        logging.warning("[VOICE] download failed user=%s: %s", sender.id, e)
        await message.answer("❌ Не смог скачать голосовое из Telegram. Попробуй ещё раз.")
        return
    if not data:
        await message.answer("❌ Пустое голосовое. Попробуй ещё раз.")
        return

    chat_id = _dm_chat_id(sender.id, peer_id)
    try:
        await db.send_voice_message(
            chat_id, sender.id, data,
            int(message.voice.duration or 0),
            message.voice.mime_type or "audio/ogg",
        )
    except Exception as e:
        logging.warning("[VOICE] save failed user=%s: %s", sender.id, e)
        await message.answer("❌ Не смог сохранить голосовое. Попробуй позже.")
        return

    await cache_delete(f"voice_route:{sender.id}")
    await cache_delete_pattern(f"chat_msgs:{chat_id}")

    try:
        peer_nick = (await db.get_mini_app_profile(peer_id)).get("nick") or f"User{peer_id}"
    except Exception:
        peer_nick = f"User{peer_id}"
    try:
        me = await bot.me()
        bot_username = me.username or ""
    except Exception:
        bot_username = ""
    a, b = sorted([sender.id, peer_id])
    kb = None
    if bot_username:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="💬 Открыть чат", url=f"https://t.me/{bot_username}?startapp=chat_{a}_{b}")]
        ])
    logging.info("[VOICE] delivered chat=%s from=%s to=%s", chat_id, sender.id, peer_id)
    from html import escape as _esc
    await message.answer(f"✅ Голосовое доставлено в лички с <b>{_esc(peer_nick)}</b>.", reply_markup=kb)


@router.message(F.video_note)
async def video_note_hint(message: Message):
    if message.chat.type != "private" or not message.from_user:
        return
    logging.info("[VOICE] got video_note from=%s (hint sent)", message.from_user.id)
    await message.answer(
        "🎥 Это видеокружок — в лички NEXUS уходят только обычные голосовые.\n\n"
        "Зажми микрофон (не камеру) и пришли голосовое следующим сообщением."
    )
    # Пуш получателю здесь невозможен: videonote не привязан к маршруту
    # (peer_id/chat_id/sender в скоупе нет — старый код падал с NameError).
    # Видеокружки в лички не уходят по дизайну, только подсказка выше.
