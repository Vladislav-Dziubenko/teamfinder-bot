from aiogram import Router, F
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from config import Settings
from database import Database
from keyboards.menus import main_menu

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, db: Database, settings: Settings):
    user = message.from_user
    await db.ensure_user(user.id, user.username, user.first_name, getattr(user, "photo_url", None))

    args = (command.args or "").strip()

    # Кнопка «Написать модерации» на бан-экране ведёт на ?start=appeal.
    # Забаненному не показываем обычное приветствие и меню — сразу просим
    # написать апелляцию текстом (её подхватит handlers/appeal.py).
    # Покрываем и голый /start без параметра — параметр может потеряться
    # в Telegram WebView, а юзер всё равно должен попасть в апелляцию.
    if await db.is_globally_banned(user.id) and args in ("appeal", ""):
        await message.answer(
            "📨 <b>Вы заблокированы.</b>\n\n"
            "Если вы считаете блокировку ошибочной — напишите апелляцию "
            "одним сообщением ниже. Она будет отправлена модерации.\n\n"
            "Ответ придёт сюда."
        )
        return

    webapp_url = settings.webapp_url
    if args and webapp_url:
        if args.startswith("profile_"):
            profile_id = args.replace("profile_", "")
            try:
                int(profile_id)
                sep = "&" if "?" in webapp_url else "?"
                webapp_url = webapp_url.rstrip("/") + f"{sep}show_profile={profile_id}"
            except ValueError:
                pass
        else:
            # referral code — передаём в Mini App через startattach
            pass  # Telegram сам передаёт start_param в initDataUnsafe

    text = (
        "👋 <b>TeamFinder</b> — бот для поиска команд в играх!\n\n"
        "🎮 <b>CS2, Roblox, WoT, War Thunder</b> и другие\n\n"
        "Анкета, поиск команды, гайды и премиум за ⭐ Stars — "
        "всё в одном окне приложения."
    )

    if settings.webapp_url:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🚀 Открыть TeamFinder", web_app=WebAppInfo(url=webapp_url))]
        ])
        await message.answer(text, reply_markup=kb)
    else:
        await message.answer(
            text + "\n\n⚠️ Mini App пока не подключено (нет WEBAPP_URL в .env).",
        )

    await message.answer(
        "Можно и через обычное меню 👇",
        reply_markup=main_menu(),
    )


@router.message(F.text == "ℹ️ Помощь")
async def help_msg(message: Message):
    await message.answer(
        "❓ <b>Как пользоваться</b>\n\n"
        "1️⃣ Создай анкету — укажи игру, ранг, роль, контакт\n"
        "2️⃣ Нажми «Найти команду» — бот покажет подходящих игроков\n"
        "3️⃣ Бесплатно: 3 анкеты без контактов\n"
        "4️⃣ За <b>5 ⭐ Stars</b> — топ-подбор с % совместимости и контактами\n"
        "5️⃣ В «Гайдах» — советы по играм, премиум за Stars\n\n"
        "💡 Stars покупаются в Telegram. Бот продаёт цифровые услуги.\n"
        "📩 Контакт в анкете: @username, Discord или ссылка"
    )


@router.message(F.text == "⭐ Премиум")
async def premium_info(message: Message, settings):
    from keyboards.menus import premium_menu
    await message.answer(
        "⭐ <b>Премиум TeamFinder</b>\n\n"
        f"🏆 <b>Лучший подбор</b> — {settings.price_best_team} Stars\n"
        "Топ-10 игроков, % совместимости, контакты, 3 поиска\n\n"
        f"🚀 <b>Поднять анкету</b> — {settings.price_highlight} Stars\n"
        "Твоя анкета выше в поиске 24 часа\n\n"
        "📚 Премиум-гайды и видео — от 5 Stars",
        reply_markup=premium_menu(settings.price_best_team, settings.price_highlight),
    )
