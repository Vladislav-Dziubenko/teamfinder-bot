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

    text = "📝 <b>Твоя анкета</b>\n\n" + format_profile_card(profile, show_contact=True)
    await message.answer(text, reply_markup=profile_actions())


@router.callback_query(F.data == "profile:edit")
async def edit_profile(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Выбери игру:", reply_markup=games_keyboard("profile"))
    await state.set_state(ProfileForm.game)
    await callback.answer()


@router.callback_query(F.data == "profile:hide")
async def hide_profile(callback: CallbackQuery, db: Database):
    profiles = await db.get_user_profiles(callback.from_user.id)
    if len(profiles) <= 1:
        await db.deactivate_profile(callback.from_user.id)
        await callback.message.edit_text("🗑 Анкета скрыта. Создай новую через «📝 Моя анкета»")
    else:
        await callback.answer("У тебя несколько анкет. Удали их через /deleteanketa", show_alert=True)
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

    # Set as active if first profile
    existing = await db.get_user_profiles(message.from_user.id)
    if len(existing) <= 1:
        await db.set_active_game_profile(message.from_user.id, data["game"])

    profile = await db.get_profile(message.from_user.id, data["game"])
    text = "✅ <b>Анкета сохранена!</b>\n\n" + format_profile_card(profile, show_contact=True)
    await message.answer(text, reply_markup=profile_actions())


@router.message(Command("deleteanketa"))
async def delete_anketa(message: Message, db: Database):
    profiles = await db.get_user_profiles(message.from_user.id)
    if not profiles:
        await message.answer("❌ У тебя нет анкет.")
        return

    keyboard = InlineKeyboardBuilder()
    from data.games import GAMES
    for p in profiles:
        title = GAMES.get(p["game"], {}).get("title", p["game"])
        keyboard.button(text=f"{title} — {p['nickname']}", callback_data=f"deleteanketa:{p['game']}")
    keyboard.button(text="❌ Отмена", callback_data="deleteanketa:cancel")
    keyboard.adjust(1)
    await message.answer("🗑 <b>Выбери анкету для удаления:</b>", reply_markup=keyboard.as_markup())


@router.callback_query(F.data.startswith("deleteanketa:"))
async def delete_anketa_confirm(callback: CallbackQuery, db: Database):
    game = callback.data.split(":", 1)[1]
    if game == "cancel":
        await callback.message.edit_text("❌ Отменено.")
        await callback.answer()
        return

    # Check if this profile is the active one in mini app
    mini = await db.get_mini_app_profile(callback.from_user.id)
    was_active = mini.get("active_game") == game

    ok = await db.delete_profile(callback.from_user.id, game)
    if not ok:
        await callback.answer("❌ Анкета не найдена.", show_alert=True)
        return

    # If it was the active profile, switch to another or clear
    if was_active:
        remaining = await db.get_user_profiles(callback.from_user.id)
        if remaining:
            await db.set_active_game_profile(callback.from_user.id, remaining[0]["game"])
            msg = f"✅ Анкета для <b>{game}</b> удалена. Активная анкета переключена на <b>{remaining[0]['game']}</b>."
        else:
            msg = f"✅ Анкета для <b>{game}</b> удалена. У тебя больше нет анкет."
    else:
        msg = f"✅ Анкета для <b>{game}</b> удалена."

    await callback.message.edit_text(msg)
    await callback.answer()


@router.message(F.text == "📝 Моя анкета")
async def my_profile(message: Message, db: Database, state: FSMContext):
    profiles = await db.get_user_profiles(message.from_user.id)
    if not profiles:
        await message.answer("У тебя ещё нет анкеты. Создадим за минуту!", reply_markup=games_keyboard("profile"))
        await state.set_state(ProfileForm.game)
        return

    from data.games import GAMES
    mini = await db.get_mini_app_profile(message.from_user.id)
    active_game = mini.get("active_game")

    if len(profiles) == 1:
        p = profiles[0]
        text = "📝 <b>Твоя анкета</b>\n\n" + format_profile_card(p, show_contact=True)
        await message.answer(text, reply_markup=profile_actions())
        return

    lines = ["📝 <b>Твои анкеты</b>\n"]
    for p in profiles:
        title = GAMES.get(p["game"], {}).get("emoji", "") + " " + GAMES.get(p["game"], {}).get("title", p["game"])
        star = "⭐ " if p["game"] == active_game else ""
        lines.append(f"{star}{title} — {p['nickname']}")
    lines.append("\nНажми на нужную, чтобы управлять:")

    keyboard = InlineKeyboardBuilder()
    for p in profiles:
        title = GAMES.get(p["game"], {}).get("title", p["game"])
        keyboard.button(text=f"{title} — {p['nickname']}", callback_data=f"profile_view:{p['game']}")
    keyboard.adjust(1)
    await message.answer("\n".join(lines), reply_markup=keyboard.as_markup())


@router.callback_query(F.data.startswith("profile_view:"))
async def profile_view(callback: CallbackQuery, db: Database):
    game = callback.data.split(":", 1)[1]
    profile = await db.get_profile(callback.from_user.id, game)
    if not profile:
        await callback.answer("Анкета не найдена", show_alert=True)
        return

    mini = await db.get_mini_app_profile(callback.from_user.id)
    is_active = mini.get("active_game") == game

    text = f"📝 <b>Анкета — {game}</b>\n\n" + format_profile_card(profile, show_contact=True)
    if is_active:
        text += "\n\n⭐ <b>Эта анкета активна в Mini App</b>"

    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="✏️ Изменить", callback_data=f"profile_edit:{game}")
    keyboard.button(text="⭐ Сделать активной", callback_data=f"profile_set_active:{game}")
    if not is_active:
        pass
    keyboard.button(text="🗑 Удалить", callback_data=f"deleteanketa:{game}")
    keyboard.button(text="⬅ Назад", callback_data="profile_list")
    keyboard.adjust(1)
    await callback.message.edit_text(text, reply_markup=keyboard.as_markup())
    await callback.answer()


@router.callback_query(F.data == "profile_list")
async def profile_list(callback: CallbackQuery, db: Database):
    profiles = await db.get_user_profiles(callback.from_user.id)
    if not profiles:
        await callback.message.edit_text("У тебя нет анкет.")
        await callback.answer()
        return
    from data.games import GAMES
    mini = await db.get_mini_app_profile(callback.from_user.id)
    active_game = mini.get("active_game")

    lines = ["📝 <b>Твои анкеты</b>\n"]
    for p in profiles:
        title = GAMES.get(p["game"], {}).get("emoji", "") + " " + GAMES.get(p["game"], {}).get("title", p["game"])
        star = "⭐ " if p["game"] == active_game else ""
        lines.append(f"{star}{title} — {p['nickname']}")
    keyboard = InlineKeyboardBuilder()
    for p in profiles:
        title = GAMES.get(p["game"], {}).get("title", p["game"])
        keyboard.button(text=f"{title} — {p['nickname']}", callback_data=f"profile_view:{p['game']}")
    keyboard.adjust(1)
    await callback.message.edit_text("\n".join(lines), reply_markup=keyboard.as_markup())
    await callback.answer()


@router.callback_query(F.data.startswith("profile_set_active:"))
async def profile_set_active(callback: CallbackQuery, db: Database):
    game = callback.data.split(":", 1)[1]
    await db.set_active_game_profile(callback.from_user.id, game)
    await callback.answer(f"✅ Анкета {game} теперь активна в Mini App", show_alert=True)
    # Refresh the view
    profile = await db.get_profile(callback.from_user.id, game)
    text = f"📝 <b>Анкета — {game}</b>\n\n" + format_profile_card(profile, show_contact=True)
    text += "\n\n⭐ <b>Эта анкета активна в Mini App</b>"
    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="✏️ Изменить", callback_data=f"profile_edit:{game}")
    keyboard.button(text="🗑 Удалить", callback_data=f"deleteanketa:{game}")
    keyboard.button(text="⬅ Назад", callback_data="profile_list")
    keyboard.adjust(1)
    await callback.message.edit_text(text, reply_markup=keyboard.as_markup())


@router.callback_query(F.data.startswith("profile_edit:"))
async def profile_edit_game(callback: CallbackQuery, state: FSMContext, db: Database):
    game = callback.data.split(":", 1)[1]
    await state.update_data(game=game)
    await callback.message.edit_text(f"Редактирование анкеты для <b>{game}</b>\n\nВведи ник в игре:")
    await state.set_state(ProfileForm.nickname)
    await callback.answer()


@router.callback_query(F.data == "profile:search")
async def profile_search(callback: CallbackQuery, db: Database):
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Сначала создай анкету", show_alert=True)
        return
    await run_team_search(callback.message, db, profile, callback.from_user.id, edit=True)
    await callback.answer()
