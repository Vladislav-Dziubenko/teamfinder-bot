"""Прямые команды бота для игровых сессий.

Покрывает запрос "прямое взаимодействие командами с игрой и ботом":
- /sessions — список активных сессий (игра, слоты, приватность, войс)
- /create <игра> [минуты] [слоты] — создать сессию прямо из чата
- /join <id> [пароль] — вступить
- /leave — покинуть свою сессию
- /voice — открыть войс своей сессии (deep link в Mini App)

Всё то же, что умеет Mini App, но текстом — для тех, кто сидит в чате,
а не в приложении.
"""

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database
from data.games import GAMES

router = Router()


def _fmt_session(s: dict) -> str:
    gm = GAMES.get(s.get("game", ""), {})
    emoji = gm.get("emoji", "🎮")
    name = gm.get("title", s.get("game", "?"))
    priv = " 🔒" if s.get("is_private") else ""
    voice = " 🎤" if s.get("voice_enabled") else ""
    return (
        f"{emoji} <b>#{s['id']} {name}</b>{priv}{voice}\n"
        f"👥 {s.get('players_count', 0)}/{s.get('max_players', '?')} · "
        f"⏳ до {str(s.get('expires_at', ''))[:16]}"
    )


@router.message(Command("sessions"))
async def cmd_sessions(message: Message, db: Database):
    sessions = await db.get_active_game_sessions()
    if not sessions:
        await message.answer("📭 Активных сессий нет. Создай: <code>/create cs2 30</code>")
        return
    lines = [_fmt_session(s) for s in sessions[:15]]
    await message.answer(
        "🎮 <b>Активные сессии:</b>\n\n" + "\n\n".join(lines) +
        "\n\nВступить: <code>/join 123</code> (с паролем: <code>/join 123 пароль</code>)"
    )


@router.message(Command("create"))
async def cmd_create(message: Message, db: Database, settings: Settings):
    user = message.from_user
    await db.ensure_user(user.id, user.username, user.first_name, None)
    parts = (message.text or "").split()
    if len(parts) < 2 or parts[1].lower() not in GAMES:
        avail = ", ".join(sorted(GAMES.keys()))
        await message.answer(
            f"Использование: <code>/create &lt;игра&gt; [минуты] [слоты]</code>\nИгры: {avail}\n"
            f"Пример: <code>/create cs2 30 6</code>"
        )
        return
    game = parts[1].lower()
    try:
        minutes = int(parts[2]) if len(parts) > 2 else 30
    except ValueError:
        minutes = 30
    try:
        max_players = int(parts[3]) if len(parts) > 3 else 6
    except ValueError:
        max_players = 6
    minutes = max(15, min(minutes, 120))
    max_players = max(2, min(max_players, 20))
    session = await db.create_game_session(user.id, game, minutes, max_players, None, False)
    if not session:
        await message.answer("❌ Не вышло создать сессию.")
        return
    await message.answer(
        f"✅ Сессия <b>#{session['id']}</b> ({GAMES[game]['emoji']} {GAMES[game]['title']}) создана!\n"
        f"👥 до {max_players} · ⏳ {minutes} мин\n"
        f"Другие вступают через <code>/join {session['id']}</code>"
    )


@router.message(Command("join"))
async def cmd_join(message: Message, db: Database):
    user = message.from_user
    parts = (message.text or "").split(maxsplit=2)
    if len(parts) < 2 or not parts[1].isdigit():
        await message.answer("Использование: <code>/join &lt;id&gt; [пароль]</code>")
        return
    sid = int(parts[1])
    pwd = parts[2] if len(parts) > 2 else None
    ok, err, _session = await db.join_game_session(sid, user.id, pwd)
    if not ok:
        hint = {
            "full": "😞 Сессия полная.",
            "password_required": "🔒 Нужен пароль: <code>/join {} пароль</code>".format(sid),
            "wrong_password": "❌ Неверный пароль.",
            "not found": "❌ Сессия не найдена.",
            "not_found": "❌ Сессия не найдена.",
        }.get(err, f"❌ {err}")
        await message.answer(hint)
        return
    await message.answer(f"✅ Ты в сессии <b>#{sid}</b>! Удачи! 🎮")


@router.message(Command("leave"))
async def cmd_leave(message: Message, db: Database):
    user = message.from_user
    sessions = await db.get_active_game_sessions()
    mine = [s for s in sessions if any(p.get("user_id") == user.id for p in s.get("players", []))]
    if not mine:
        await message.answer("Ты ни в одной сессии.")
        return
    for s in mine:
        await db.leave_game_session(s["id"], user.id)
    await message.answer("👋 Вышел из сессии.")


@router.message(Command("voice"))
async def cmd_voice(message: Message, db: Database, settings: Settings):
    user = message.from_user
    sessions = await db.get_active_game_sessions()
    mine = [s for s in sessions if any(p.get("user_id") == user.id for p in s.get("players", []))]
    if not mine:
        await message.answer("Сначала вступи в сессию: <code>/sessions</code>")
        return
    s = mine[0]
    if not s.get("voice_enabled"):
        await message.answer(f"В сессии #{s['id']} войс выключен. Включи его в Mini App (создатель).")
        return
    base = (settings.webapp_url or "").rstrip("/")
    if base:
        await message.answer(f"🎤 Войс сессии #{s['id']}: открой Mini App → Сессии → 🎤\n{base}")
    else:
        await message.answer(f"🎤 Войс сессии #{s['id']} включён — заходи в Mini App → Сессии.")
