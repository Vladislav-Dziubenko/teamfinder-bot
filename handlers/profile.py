from aiogram import Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from data.games import GAMES
from database import Database
from keyboards.menus import (
    games_keyboard, ranks_keyboard, roles_keyboard,
    playtime_keyboard, looking_keyboard, mic_keyboard, profile_actions,
)
from services.matching import format_profile_card
from services.search_service import run_team_search
from states import ProfileForm

router = Router()


@router.message(F.text == "📝 Моя анкета")
async def my_profile(message: Message, db: Database, state: FSMContext):
    profile = await db.get_profile(message.from_user.id)
    if not profile:
        await message.answer("У тебя ещё нет анкеты. Создадим за минуту!", reply_markup=games_keyboard("profile"))
        await state.set_state(ProfileForm.game)
        return

    mini = await db.get_mini_app_profile(message.from_user.id)
    text = "📝 <b>Твоя анкета</b>\n\n" + format_profile_card(profile, show_contact=True)
    if mini.get("games"):
        from data.games import GAMES
        favs = []
        for gid in mini["games"]:
            gm = GAMES.get(gid)
            if gm:
                favs.append(f"{gm.get('emoji', '')} {gm.get('title', gid)}")
        if favs:
            text += f"\n\n🎮 Любимые игры: {', '.join(favs)}"
    await message.answer(text, reply_markup=profile_actions())


@router.callback_query(F.data == "profile:edit")
async def edit_profile(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Выбери игру:", reply_markup=games_keyboard("profile"))
    await state.set_state(ProfileForm.game)
    await callback.answer()


@router.callback_query(F.data == "profile:hide")
async def hide_profile(callback: CallbackQuery, db: Database):
    await db.deactivate_profile(callback.from_user.id)
    await callback.message.edit_text("🗑 Анкета скрыта. Создай новую через «📝 Моя анкета»")
    await callback.answer()


@router.callback_query(F.data == "profile:cancel")
async def profile_cancel(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("Отменено.")
    await callback.answer()


@router.callback_query(F.data.startswith("profile:game:"))
async def profile_pick_game(callback: CallbackQuery, state: FSMContext):
    game = callback.data.split(":")[-1]
    if game not in GAMES:
        await callback.answer("Неизвестная игра")
        return
    await state.update_data(game=game)
    await callback.message.edit_text(f"Игра: <b>{GAMES[game]['title']}</b>\n\nВведи ник в игре:")
    await state.set_state(ProfileForm.nickname)
    await callback.answer()


@router.message(ProfileForm.nickname)
async def profile_nickname(message: Message, state: FSMContext):
    nick = message.text.strip()[:32]
    if len(nick) < 2:
        await message.answer("Ник слишком короткий:")
        return
    data = await state.get_data()
    await state.update_data(nickname=nick)
    await state.set_state(ProfileForm.rank)
    await message.answer("Выбери ранг:", reply_markup=ranks_keyboard(data["game"], "profile"))


@router.callback_query(F.data.startswith("profile:rank:"), ProfileForm.rank)
async def profile_rank(callback: CallbackQuery, state: FSMContext):
    rank = callback.data.split("profile:rank:", 1)[1]
    data = await state.get_data()
    await state.update_data(rank=rank)
    await state.set_state(ProfileForm.role)
    await callback.message.edit_text("Выбери роль:", reply_markup=roles_keyboard(data["game"], "profile"))
    await callback.answer()


@router.callback_query(F.data.startswith("profile:role:"), ProfileForm.role)
async def profile_role(callback: CallbackQuery, state: FSMContext):
    role = callback.data.split("profile:role:", 1)[1]
    await state.update_data(role=role)
    await state.set_state(ProfileForm.playtime)
    await callback.message.edit_text("Сколько играешь?", reply_markup=playtime_keyboard("profile"))
    await callback.answer()


@router.callback_query(F.data.startswith("profile:playtime:"), ProfileForm.playtime)
async def profile_playtime(callback: CallbackQuery, state: FSMContext):
    pt = callback.data.split(":")[-1]
    await state.update_data(playtime=pt)
    await state.set_state(ProfileForm.looking_for)
    await callback.message.edit_text("Что ищешь?", reply_markup=looking_keyboard("profile"))
    await callback.answer()


@router.callback_query(F.data.startswith("profile:looking:"), ProfileForm.looking_for)
async def profile_looking(callback: CallbackQuery, state: FSMContext):
    looking = callback.data.split(":")[-1]
    await state.update_data(looking_for=looking)
    await state.set_state(ProfileForm.region)
    await callback.message.edit_text("Регион (EU, RU, CIS). Пропустить — напиши <code>-</code>")
    await callback.answer()


@router.message(ProfileForm.region)
async def profile_region(message: Message, state: FSMContext):
    region = message.text.strip()
    if region == "-":
        region = ""
    await state.update_data(region=region[:40])
    await state.set_state(ProfileForm.contact)
    await message.answer("Контакт: @username, Discord или ссылка")


@router.message(ProfileForm.contact)
async def profile_contact(message: Message, state: FSMContext):
    contact = message.text.strip()[:80]
    if len(contact) < 3:
        await message.answer("Контакт слишком короткий:")
        return
    await state.update_data(contact=contact)
    await state.set_state(ProfileForm.has_mic)
    await message.answer("Есть микрофон?", reply_markup=mic_keyboard("profile"))


@router.callback_query(F.data.startswith("profile:mic:"), ProfileForm.has_mic)
async def profile_mic(callback: CallbackQuery, state: FSMContext):
    has_mic = callback.data.endswith(":1")
    await state.update_data(has_mic=has_mic)
    await state.set_state(ProfileForm.description)
    await callback.message.edit_text("О себе (или <code>-</code> чтобы пропустить)")
    await callback.answer()


@router.message(ProfileForm.description)
async def profile_description(message: Message, state: FSMContext, db: Database):
    desc = message.text.strip()
    if desc == "-":
        desc = ""

    data = await state.get_data()
    data["user_id"] = message.from_user.id
    data["description"] = desc[:300]
    data["language"] = "RU"

    await db.save_profile(data)
    await state.clear()

    profile = await db.get_profile(message.from_user.id)
    text = "✅ <b>Анкета сохранена!</b>\n\n" + format_profile_card(profile, show_contact=True)
    await message.answer(text, reply_markup=profile_actions())


@router.message(Command("deleteanketa"))
async def delete_anketa(message: Message, db: Database):
    profile = await db.get_profile(message.from_user.id)
    if not profile:
        await message.answer("❌ У тебя нет анкеты.")
        return

    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="🗑 Да, удалить", callback_data="deleteanketa:confirm")
    keyboard.button(text="❌ Отмена", callback_data="deleteanketa:cancel")
    keyboard.adjust(1)
    await message.answer("🗑 <b>Удалить анкету?</b>", reply_markup=keyboard.as_markup())


@router.callback_query(F.data.startswith("deleteanketa:"))
async def delete_anketa_confirm(callback: CallbackQuery, db: Database):
    action = callback.data.split(":", 1)[1]
    if action == "cancel":
        await callback.message.edit_text("❌ Отменено.")
        await callback.answer()
        return

    ok = await db.delete_profile(callback.from_user.id)
    if not ok:
        await callback.answer("❌ Анкета не найдена.", show_alert=True)
        return

    await callback.message.edit_text("✅ Анкета удалена.")
    await callback.answer()


@router.callback_query(F.data == "profile:search")
async def profile_search(callback: CallbackQuery, db: Database):
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Сначала создай анкету", show_alert=True)
        return
    await run_team_search(callback.message, db, profile, callback.from_user.id, edit=True)
    await callback.answer()


@router.message(Command("balance"))
async def cmd_balance(message: Message, db: Database):
    user = message.from_user
    currency = await db.get_currency(user.id)
    is_beta = await db.get_beta(user.id)
    beta_state = await db.get_beta_state(user.id) if is_beta else None
    premium = await db.is_pro(user.id)

    lines = [
        "💰 <b>Твой баланс</b>\n",
        f"🪙 Nexus Coin: <b>{currency['coins']}</b>",
        f"⭐ Nexus Stars: <b>{currency['stars']}</b>",
        f"💎 Очки: <b>{currency['points']}</b>",
    ]
    if premium:
        lines.append("👑 <b>Премиум активен</b>")
    if is_beta:
        cases = beta_state["case_balance"] if beta_state else 0
        lines.append(f"🧪 Бета-тестер: <b>{cases}</b> бесплатных кейсов")
    await message.answer("\n".join(lines))
