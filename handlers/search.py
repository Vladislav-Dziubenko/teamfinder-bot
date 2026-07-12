from aiogram import Router, F
from aiogram.types import Message, CallbackQuery

from database import Database
from keyboards.menus import games_keyboard
from services.search_service import run_team_search

router = Router()


@router.message(F.text == "🎮 Найти команду")
async def search_start(message: Message, db: Database):
    profile = await db.get_profile(message.from_user.id)
    if profile:
        await run_team_search(message, db, profile, message.from_user.id, answer_method=message.answer)
        return
    await message.answer("Сначала создай анкету через «📝 Моя анкета»")


@router.callback_query(F.data.startswith("search:game:"))
async def search_by_game(callback: CallbackQuery, db: Database):
    game = callback.data.split(":")[-1]
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Сначала создай анкету", show_alert=True)
        return
    if profile["game"] != game:
        from data.games import GAMES
        await callback.answer(f"Твоя анкета в {GAMES[profile['game']]['title']}", show_alert=True)
        return
    await run_team_search(callback.message, db, profile, callback.from_user.id, edit=True)
    await callback.answer()


@router.callback_query(F.data == "search:refresh")
async def search_refresh(callback: CallbackQuery, db: Database):
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Нет анкеты", show_alert=True)
        return
    await run_team_search(callback.message, db, profile, callback.from_user.id, edit=True)
    await callback.answer("Обновлено")


@router.callback_query(F.data.startswith("contact:"))
async def show_contact(callback: CallbackQuery, db: Database):
    target_id = int(callback.data.split(":")[1])
    my_profile = await db.get_profile(callback.from_user.id)
    if not my_profile:
        await callback.answer("Создай анкету", show_alert=True)
        return

    premium = await db.has_search_boost(callback.from_user.id, my_profile["game"])
    target_profile = None
    for p in await db.list_profiles_by_game(my_profile["game"]):
        if p["user_id"] == target_id:
            target_profile = p
            break

    if not target_profile:
        await callback.answer("Анкета не найдена", show_alert=True)
        return

    if not premium:
        await callback.answer("Купи премиум-подбор за 5 ⭐", show_alert=True)
        return

    from services.matching import score_match, format_profile_card
    score = score_match(my_profile, target_profile)
    text = "📩 <b>Контакт игрока</b>\n\n" + format_profile_card(target_profile, score, show_contact=True)
    await callback.message.answer(text)
    await callback.answer()
