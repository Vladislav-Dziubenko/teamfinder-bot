from aiogram import Router, F
from aiogram.types import Message, CallbackQuery

from data.games import GAMES
from data.guides import GUIDES
from database import Database
from keyboards.menus import guides_menu, guides_list, guide_actions

router = Router()


def _guide_by_id(guide_id: str) -> dict | None:
    for g in GUIDES:
        if g["id"] == guide_id:
            return g
    return None


async def _unlocked_ids(db: Database, user_id: int) -> set[str]:
    result = set()
    for g in GUIDES:
        if g["type"] == "free":
            result.add(g["id"])
        elif await db.has_unlocked(user_id, g["id"]):
            result.add(g["id"])
    return result


@router.message(F.text == "📚 Гайды")
async def guides_main(message: Message):
    await message.answer(
        "📚 <b>Гайды по играм</b>\n\n"
        "🆓 Бесплатные советы\n"
        "⭐ Премиум и видео — за Telegram Stars",
        reply_markup=guides_menu(),
    )


@router.callback_query(F.data == "guides:back")
async def guides_back(callback: CallbackQuery):
    await callback.message.edit_text(
        "📚 <b>Гайды по играм</b>\n\nВыбери игру:",
        reply_markup=guides_menu(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("guides:game:"))
async def guides_game(callback: CallbackQuery, db: Database):
    game = callback.data.split(":")[-1]
    unlocked = await _unlocked_ids(db, callback.from_user.id)
    title = GAMES.get(game, {}).get("title", game)
    await callback.message.edit_text(
        f"📚 Гайды: <b>{title}</b>",
        reply_markup=guides_list(game, unlocked),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("guides:view:"))
async def guides_view(callback: CallbackQuery, db: Database):
    guide_id = callback.data.split(":")[-1]
    guide = _guide_by_id(guide_id)
    if not guide:
        await callback.answer("Гайд не найден", show_alert=True)
        return

    unlocked = guide["type"] == "free" or await db.has_unlocked(callback.from_user.id, guide_id)

    if unlocked:
        text = guide["text"]
        if guide["type"] == "video" and guide.get("video_url"):
            text += f"\n\n▶️ Видео доступно по кнопке ниже"
    else:
        text = (
            f"🔒 <b>{guide['title']}</b>\n\n"
            f"{guide['text'][:200]}...\n\n"
            f"⭐ Полная версия — <b>{guide['stars']} Stars</b>"
        )

    await callback.message.edit_text(
        text,
        reply_markup=guide_actions(guide_id, guide, unlocked),
    )
    await callback.answer()
