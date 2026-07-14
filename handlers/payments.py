from aiogram import Router, F, Bot
from aiogram.types import CallbackQuery, Message, LabeledPrice, PreCheckoutQuery

from config import Settings
from data.guides import GUIDES
from database import Database

router = Router()


def _guide_by_id(guide_id: str) -> dict | None:
    for g in GUIDES:
        if g["id"] == guide_id:
            return g
    return None


async def _send_invoice(bot: Bot, chat_id: int, title: str, description: str, payload: str, stars: int):
    await bot.send_invoice(
        chat_id=chat_id,
        title=title,
        description=description,
        payload=payload,
        currency="XTR",
        prices=[LabeledPrice(label=title, amount=stars)],
    )


@router.callback_query(F.data == "pay:best_team")
async def pay_best_team(callback: CallbackQuery, bot: Bot, settings: Settings, db: Database):
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Сначала создай анкету", show_alert=True)
        return

    await _send_invoice(
        bot,
        callback.from_user.id,
        "Лучший подбор команд",
        f"Топ-10 игроков с % совместимости и контактами для {profile['game']}",
        f"best_team:{profile['game']}",
        settings.price_best_team,
    )
    await callback.answer()


@router.callback_query(F.data == "pay:highlight")
async def pay_highlight(callback: CallbackQuery, bot: Bot, settings: Settings, db: Database):
    profile = await db.get_profile(callback.from_user.id)
    if not profile:
        await callback.answer("Сначала создай анкету", show_alert=True)
        return

    await _send_invoice(
        bot,
        callback.from_user.id,
        "Поднять анкету в топ",
        "Твоя анкета выше в поиске 24 часа",
        "highlight:profile",
        settings.price_highlight,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("pay:guide:"))
async def pay_guide(callback: CallbackQuery, bot: Bot, db: Database):
    guide_id = callback.data.split(":")[-1]
    guide = _guide_by_id(guide_id)
    if not guide or guide["stars"] <= 0:
        await callback.answer("Гайд недоступен", show_alert=True)
        return

    if await db.has_unlocked(callback.from_user.id, guide_id):
        await callback.answer("Уже куплено", show_alert=True)
        return

    await _send_invoice(
        bot,
        callback.from_user.id,
        guide["title"],
        "Премиум-гайд TeamFinder",
        f"guide:{guide_id}",
        guide["stars"],
    )
    await callback.answer()


@router.callback_query(F.data == "pay:pro_subscription")
async def pay_pro_subscription(callback: CallbackQuery, bot: Bot, settings: Settings, db: Database):
    if await db.is_pro(callback.from_user.id):
        await callback.answer("У тебя уже есть PRO", show_alert=True)
        return

    await _send_invoice(
        bot,
        callback.from_user.id,
        "PRO-подписка на 30 дней",
        "Безлимитный поиск, мульти-анкеты, приоритет в заявках",
        "pro:subscription",
        settings.price_pro_subscription,
    )
    await callback.answer()


@router.callback_query(F.data.startswith("pay:contact:"))
async def pay_single_contact(callback: CallbackQuery, bot: Bot, settings: Settings, db: Database):
    try:
        profile_id = int(callback.data.split(":")[-1])
    except (ValueError, IndexError):
        await callback.answer("Неверный формат", show_alert=True)
        return

    if await db.has_unlocked_contact(callback.from_user.id, profile_id):
        await callback.answer("Контакт уже открыт", show_alert=True)
        return

    await _send_invoice(
        bot,
        callback.from_user.id,
        "Открыть контакт",
        "Просмотр контакта одного игрока",
        f"contact:{profile_id}",
        settings.price_single_contact,
    )
    await callback.answer()


@router.callback_query(F.data == "pay:premium_application")
async def pay_premium_application(callback: CallbackQuery, bot: Bot, settings: Settings, db: Database):
    await _send_invoice(
        bot,
        callback.from_user.id,
        "Премиум-заявка",
        "Твоя заявка в топе списка команд",
        "premium:application",
        settings.price_premium_application,
    )
    await callback.answer()


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery):
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def successful_payment(message: Message, db: Database, bot: Bot):
    payment = message.successful_payment
    payload = payment.invoice_payload
    stars = payment.total_amount
    charge_id = payment.telegram_payment_charge_id

    await db.record_purchase(message.from_user.id, payload, stars, charge_id)

    if payload.startswith("best_team:"):
        game = payload.split(":", 1)[1]
        await db.add_search_boost(message.from_user.id, game, uses=3)
        await message.answer(
            "✅ <b>Оплата прошла!</b>\n\n"
            "🏆 Премиум-подбор активирован на 3 поиска.\n"
            "Нажми «🎮 Найти команду» — увидишь топ с контактами!"
        )
        return

    if payload == "highlight:profile":
        await db.highlight_profile(message.from_user.id, hours=24)
        await message.answer(
            "✅ <b>Анкета поднята в топ на 24 часа!</b>\n"
            "Тебя чаще увидят в поиске."
        )
        return

    if payload.startswith("guide:"):
        guide_id = payload.split(":", 1)[1]
        guide = _guide_by_id(guide_id)
        await db.unlock_content(message.from_user.id, guide_id)
        text = guide["text"] if guide else "Гайд разблокирован!"
        if guide and guide.get("video_url"):
            text += f"\n\n▶️ Видео: {guide['video_url']}"
        await message.answer(f"✅ <b>Гайд куплен!</b>\n\n{text}")
        return

    if payload == "pro:subscription":
        await db.set_pro_status(message.from_user.id, days=30)
        await message.answer(
            "✅ <b>PRO-подписка активирована на 30 дней!</b>\n\n"
            "🔥 Безлимитный поиск\n"
            "🔥 Мульти-анкеты\n"
            "🔥 Приоритет в заявках"
        )
        return

    if payload.startswith("contact:"):
        try:
            profile_id = int(payload.split(":", 1)[1])
            await db.unlock_contact(message.from_user.id, profile_id)
            await message.answer("✅ <b>Контакт открыт!</b>\n\nТеперь ты можешь связаться с этим игроком.")
            return
        except (ValueError, IndexError):
            await message.answer("✅ Оплата получена.")
            return

    if payload == "premium:application":
        await db.add_premium_application_credit(message.from_user.id)
        await message.answer(
            "✅ <b>Премиум-заявка активирована!</b>\n\n"
            "Твоя следующая заявка в команду будет отмечена как премиум "
            "и покажется капитану первой."
        )
        return

    await message.answer("✅ Оплата получена. Спасибо!")
