from datetime import datetime

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()


@router.message(Command("stats"))
async def admin_stats(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    s = await db.stats()
    await message.answer(
        "📊 <b>Статистика TeamFinder</b>\n\n"
        f"👥 Пользователей: {s['users']}\n"
        f"📝 Анкет: {s['profiles']}\n"
        f"💳 Покупок: {s['purchases']}\n"
        f"⭐ Stars заработано: {s['stars']}"
    )


@router.message(Command("donatevidacha"))
async def admin_donate(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 4:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/donatevidacha &lt;user_id&gt; &lt;coins&gt; &lt;stars&gt;</code>\n\n"
            "Пример:\n"
            "<code>/donatevidacha 123456789 1000 50</code>"
        )
        return

    try:
        target_id = int(args[1])
        coins = int(args[2])
        stars = int(args[3])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id, coins и stars должны быть числами.")
        return

    if coins < 0 or stars < 0:
        await message.answer("❌ <b>Ошибка:</b> значения не могут быть отрицательными.")
        return

    if coins > 0:
        await db.adjust_currency(target_id, coins=coins)
    if stars > 0:
        await db.adjust_currency(target_id, stars=stars)

    await db.audit_log(message.from_user.id, "admin_donate", f"target={target_id} coins=+{coins} stars=+{stars}")

    await message.answer(
        "✅ <b>Выдача выполнена!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🪙 Nexus Coin: <b>+{coins}</b>\n"
        f"⭐ Nexus Stars: <b>+{stars}</b>"
    )


@router.message(Command("donatedelete"))
async def admin_donate_delete(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 4:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/donatedelete &lt;user_id&gt; &lt;coins&gt; &lt;stars&gt;</code>\n\n"
            "Пример:\n"
            "<code>/donatedelete 123456789 500 30</code>"
        )
        return

    try:
        target_id = int(args[1])
        coins = int(args[2])
        stars = int(args[3])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id, coins и stars должны быть числами.")
        return

    if coins < 0 or stars < 0:
        await message.answer("❌ <b>Ошибка:</b> значения не могут быть отрицательными.")
        return

    removed_coins = 0
    removed_stars = 0
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            if coins > 0:
                row = await conn.fetchrow(
                    "SELECT coins FROM user_currency WHERE user_id = $1 FOR UPDATE",
                    target_id,
                )
                current_coins = row["coins"] if row else 0
                removed_coins = min(coins, current_coins)
                await conn.execute(
                    "UPDATE user_currency SET coins = GREATEST(0, coins - $1), updated_at = $2 WHERE user_id = $3",
                    coins, datetime.utcnow().isoformat(), target_id,
                )
            if stars > 0:
                row = await conn.fetchrow(
                    "SELECT stars FROM user_currency WHERE user_id = $1 FOR UPDATE",
                    target_id,
                )
                current_stars = row["stars"] if row else 0
                removed_stars = min(stars, current_stars)
                await conn.execute(
                    "UPDATE user_currency SET stars = GREATEST(0, stars - $1), updated_at = $2 WHERE user_id = $3",
                    stars, datetime.utcnow().isoformat(), target_id,
                )

    await db.audit_log(message.from_user.id, "admin_donate_delete", f"target={target_id} coins=-{removed_coins} stars=-{removed_stars}")

    await message.answer(
        "✅ <b>Удаление выполнено!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🪙 Nexus Coin: <b>-{removed_coins}</b>\n"
        f"⭐ Nexus Stars: <b>-{removed_stars}</b>"
    )


@router.message(Command("giveitem"))
async def admin_give_item(message: Message, db: Database, settings: Settings):
    import logging
    logging.info("[GIVEITEM] user=%s admin_ids=%s text=%r", message.from_user.id, settings.admin_ids, message.text)
    if message.from_user.id not in settings.admin_ids:
        logging.info("[GIVEITEM] DENIED: user=%s not in admin_ids", message.from_user.id)
        return

    args = message.text.strip().split()
    if len(args) < 3:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/giveitem <user_id> <item_key> [count]</code>\n\n"
            "Примеры:\n"
            "<code>/giveitem 123456789 f16 1</code>\n"
            "<code>/giveitem 123456789 ak47 5</code>\n\n"
            "Популярные item_key:\n"
            "<code>f16, f15, f14, ak47, premium-card, premium-card-lite, premium-medium, "
            "stars-150, stars-400, stars-1200, nexus-model, icon-skull, icon-fire, "
            "icon-crown, icon-target, icon-bolt, icon-star</code>"
        )
        return

    try:
        target_id = int(args[1])
        item_key = args[2]
        count = int(args[3]) if len(args) > 3 else 1
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id и count должны быть числами.")
        return

    if count < 1 or count > 100:
        await message.answer("❌ <b>Ошибка:</b> count должен быть от 1 до 100.")
        return

    # Define item metadata (key -> name, rarity, sell_price, grants_premium)
    ITEMS = {
        "f16": ("F-16 Fighting Falcon", "legendary", 0, False),
        "f15": ("F-15 Eagle", "epic", 0, False),
        "f14": ("F-14 Tomcat", "legendary", 0, False),
        "ak47": ("AK-47", "rare", 15, False),
        "premium-card": ("Premium Card", "premium", 100, True),
        "premium-card-lite": ("Premium Card Lite", "epic", 45, True),
        "premium-medium": ("Premium 4 дня", "epic", 35, True),
        "stars-150": ("150 Stars", "common", 0, False),
        "stars-400": ("400 Stars", "rare", 0, False),
        "stars-1200": ("1200 Stars", "epic", 0, False),
        "nexus-model": ("Mini Boss bro", "legendary", 55000, False),
        "icon-skull": ("Skull Icon", "common", 10, False),
        "icon-fire": ("Fire Icon", "common", 10, False),
        "icon-crown": ("Crown Icon", "common", 10, False),
        "icon-target": ("Target Icon", "common", 10, False),
        "icon-bolt": ("Bolt Icon", "common", 10, False),
        "icon-star": ("Star Icon", "common", 10, False),
        "autumn-key": ("Autumn Key", "epic", 5000, False),
        "mossbyte-scout": ("Mossbyte Scout", "common", 10, False),
        "rustveil-kunoichi": ("Rustveil Kunoichi", "rare", 25, False),
        "cinderwing": ("Cinderwing MK-II", "epic", 100, False),
        "maple-warden": ("Maple Warden", "epic", 120, False),
        "stars-200": ("200 Stars", "common", 0, False),
        "stars-500": ("500 Stars", "rare", 0, False),
        "stars-1000": ("1000 Stars", "epic", 0, False),
        "stars-2000": ("2000 Stars", "epic", 0, False),
    }

    if item_key not in ITEMS:
        await message.answer(
            f"❌ <b>Неизвестный item_key:</b> <code>{item_key}</code>\n\n"
            "Доступные: " + ", ".join(f"<code>{k}</code>" for k in ITEMS.keys())
        )
        return

    name, rarity, sell, grants_premium = ITEMS[item_key]

    # nexus-model — лимитированная 3D-модель, живёт в limited_models, а не user_inventory
    if item_key == "nexus-model":
        granted = 0
        for _ in range(count):
            async with db.pool.acquire() as conn:
                token = await db.next_limited_token(conn)
                if token is None:
                    await message.answer("❌ <b>Тираж распродан</b> — все 20 моделей уже заняты.")
                    return
                await conn.execute(
                    "INSERT INTO limited_models (model_id, token_id, owner_id, acquired_at) VALUES ($1, $2, $3, $4)",
                    "nexus-model", token, target_id, datetime.utcnow().isoformat(),
                )
                await conn.execute(
                    "INSERT INTO limited_model_events (model_id, token_id, user_id, event_type, details, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
                    "nexus-model", token, target_id, "granted", f"Выдано админом #{message.from_user.id}", datetime.utcnow().isoformat(),
                )
            granted += 1
        await db.audit_log(message.from_user.id, "admin_give_item", f"target={target_id} item={item_key} count={count}")
        await message.answer(
            "✅ <b>3D-модель выдана!</b>\n\n"
            f"👤 Пользователь: <code>{target_id}</code>\n"
            f"🎁 Предмет: <b>{name}</b> (<code>{item_key}</code>)\n"
            f"🔢 Количество: <b>{granted}</b>"
        )
        return

    for _ in range(count):
        await db.add_to_inventory(target_id, item_key, name, rarity, sell, grants_premium)

    await db.audit_log(message.from_user.id, "admin_give_item", f"target={target_id} item={item_key} count={count}")

    await message.answer(
        "✅ <b>Предмет выдан!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🎁 Предмет: <b>{name}</b> (<code>{item_key}</code>)\n"
        f"🔢 Количество: <b>{count}</b>\n"
        f"🎨 Редкость: <b>{rarity}</b>"
    )


@router.message(Command("aiundo"))
async def admin_ai_undo(message: Message, db: Database, settings: Settings):
    """Отмена наказания Стража: снимает мут и бан. Только админы."""
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 2:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/aiundo &lt;user_id&gt;</code>\n\n"
            "Снимает мут и бан (например, ложное срабатывание Стража)."
        )
        return

    try:
        target_id = int(args[1])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id должен быть числом.")
        return

    await db.unmute_user(target_id)
    await db.unban_global(target_id)
    await db.audit_log(message.from_user.id, "admin_ai_undo", f"target={target_id}")
    await message.answer(
        "✅ <b>Наказание снято!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        "🔓 Мут и бан сняты."
    )


@router.message(Command("aistatus"))
async def admin_ai_status(message: Message, db: Database, settings: Settings):
    """Статус AI-модератора: включён ли, режим, провайдер, ключ, счётчик за сегодня."""
    if message.from_user.id not in settings.admin_ids:
        return

    enabled = bool(getattr(settings, "ai_mod_enabled", False))
    shadow = bool(getattr(settings, "ai_mod_shadow", True))
    provider = getattr(settings, "ai_provider", "gemini") or "gemini"
    key = (getattr(settings, "gemini_api_key", "") or "") if provider == "gemini" else (getattr(settings, "groq_api_key", "") or "")
    masked = (key[:4] + "…" + key[-4:]) if len(key) > 8 else ("задан" if key else "НЕ ЗАДАН")
    # Локальная проверка формата (бесплатно, без запросов): ловит вставку
    # ключа от другого сервиса или мусор при копипасте.
    import re as _re
    if not key:
        key_fmt = "✗ нет ключа"
    elif provider == "gemini" and _re.fullmatch(r"AIza[0-9A-Za-z_-]{35}", key):
        key_fmt = "✓ похож на Gemini (legacy)"
    elif provider == "gemini" and len(key) >= 20:
        key_fmt = "✓ задан (новый формат auth-ключа — достоверно проверит только живой /aiscore)"
    elif provider == "groq" and key.startswith("gsk_"):
        key_fmt = "✓ похож на Groq"
    else:
        key_fmt = "✗ НЕ похож на ключ провайдера (Groq ждёт gsk_..., длина ключа < 20)"
    try:
        today = await db.count_today_ai_actions()
    except Exception:
        today = "?"
    try:
        queued = await db.pool.fetchval(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'ai_queue' AND created_at >= $1",
            datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
        )
    except Exception:
        queued = "?"

    mode = "👻 SHADOW (только лог)" if shadow else "🛡️ АВТОПИЛОТ"
    chat_on = bool(getattr(settings, "ai_chat_enabled", False))
    import os as _os
    deployed = (_os.getenv("RENDER_GIT_COMMIT", "") or "")[:7] or "n/a"
    await message.answer(
        "🤖 <b>Страж: статус</b>\n\n"
        f"Деплой: <code>{deployed}</code>\n"
        f"Включён: <b>{'да' if enabled else 'нет'}</b>\n"
        f"Режим: <b>{mode}</b>\n"
        f"Провайдер: <code>{provider}</code>\n"
        f"Ключ: <code>{masked}</code> ({key_fmt})\n"
        f"Собеседник в чате: <b>{'да' if chat_on else 'нет'}</b>\n"
        f"Авто-действий сегодня: <b>{today}</b>\n"
        f"В очереди к утру: <b>{queued}</b>\n\n"
        f"Пороги: {getattr(settings, 'ai_mod_score_low', 0.3)}/{getattr(settings, 'ai_mod_score_high', 0.8)}, "
        f"кап: {getattr(settings, 'ai_mod_night_cap', 30)}/ночь\n"
        "Тест скоринга: <code>/aiscore текст сообщения</code>"
    )


@router.message(Command("aiscore"))
async def admin_ai_score(message: Message, db: Database, settings: Settings):
    """Прогнать произвольный текст через скоринг Стража (видно как он решит)."""
    if message.from_user.id not in settings.admin_ids:
        return

    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        await message.answer(
            "❌ <b>Неверный формат</b>\n\nИспользование:\n<code>/aiscore какой-то текст для проверки</code>"
        )
        return

    from services.ai_moderation import score_message
    try:
        try:
            corrections = await db.ai_corrections(5)
        except Exception:
            corrections = None
        verdict = await score_message(parts[1].strip()[:500], message.from_user.id, settings, corrections)
    except Exception as exc:
        await message.answer(f"❌ <b>Скоринг упал:</b> <code>{exc}</code>")
        return

    score = verdict.get("score", 0.0)
    category = verdict.get("category", "ok")
    reason = verdict.get("reason", "") or "—"
    source = verdict.get("source", "?")
    low = getattr(settings, "ai_mod_score_low", 0.3)
    high = getattr(settings, "ai_mod_score_high", 0.8)
    action = "ничего" if score < low else ("очередь человеку" if score < high else "авто-наказание по лестнице")
    await message.answer(
        "🤖 <b>Вердикт Стража</b>\n\n"
        f"Скор: <b>{score:.2f}</b> (источник: <code>{source}</code>)\n"
        f"Категория: <code>{category}</code>\n"
        f"Причина: {reason}\n"
        f"Решение: <b>{action}</b>"
    )


_AI_CATS = {"ok", "spam", "scam", "insult", "adult", "threat", "doxing", "links"}


@router.message(Command("ailearn"))
async def admin_ai_learn(message: Message, db: Database, settings: Settings):
    """Научить Стража факту: /ailearn Диму зовут Дима228, он играет в CS2."""
    if message.from_user.id not in settings.admin_ids:
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        await message.answer(
            "❌ <b>Неверный формат</b>\n\nИспользование:\n<code>/ailearn Диму зовут Дима228, играет в CS2</code>"
        )
        return
    fact = parts[1].strip()[:300]
    mem_id = await db.ai_learn("fact", fact, created_by=message.from_user.id)
    await db.audit_log(message.from_user.id, "ai_learn", f"id={mem_id} {fact[:120]}")
    await message.answer(f"🧠 <b>Запомнил</b> (id={mem_id}):\n{fact}")


@router.message(Command("aimemory"))
async def admin_ai_memory(message: Message, db: Database, settings: Settings):
    """Показать память Стража: факты и примеры-коррекции."""
    if message.from_user.id not in settings.admin_ids:
        return
    facts = await db.ai_memories("fact", 20)
    corrs = await db.ai_memories("correction", 10)
    lines = ["🧠 <b>Память Стража</b>"]
    lines.append(f"\n<b>Факты ({len(facts)}):</b>")
    for r in facts:
        lines.append(f"• <code>{r['id']}</code> {(r['text'] or '')[:120]}")
    if not facts:
        lines.append("— пусто —")
    lines.append(f"\n<b>Примеры ({len(corrs)}):</b>")
    for r in corrs:
        lines.append(f"• <code>{r['id']}</code> {(r['text'] or '')[:80]} → <code>{(r['extra'] or '')[:80]}</code>")
    if not corrs:
        lines.append("— пусто —")
    lines.append("\nУдалить: <code>/aiforget id</code>")
    await message.answer("\n".join(lines))


@router.message(Command("aiforget"))
async def admin_ai_forget(message: Message, db: Database, settings: Settings):
    """Забыть факт/пример: /aiforget 12."""
    if message.from_user.id not in settings.admin_ids:
        return
    parts = (message.text or "").split(maxsplit=1)
    try:
        mem_id = int((parts[1] if len(parts) > 1 else "").strip())
    except (ValueError, TypeError):
        mem_id = 0
    if mem_id <= 0:
        await message.answer("❌ Использование:\n<code>/aiforget id</code> (id видно в /aimemory)")
        return
    ok = await db.ai_forget(mem_id)
    await message.answer("🗑 <b>Забыто</b>." if ok else "❌ Нет записи с таким id.")


@router.message(Command("aiwrong"))
async def admin_ai_wrong(message: Message, db: Database, settings: Settings):
    """Поправить судью: реплаем на сообщение юзера — /aiwrong 0.9 insult.
    Текст берётся из цитируемого сообщения, вердикт уходит в few-shot примеры."""
    if message.from_user.id not in settings.admin_ids:
        return
    replied = message.reply_to_message
    target = ((replied.text or "") if replied else "").strip()[:500]
    if not target:
        await message.answer(
            "❌ Ответь этой командой <b>реплаем</b> на сообщение юзера:\n"
            "<code>/aiwrong 0.9 insult</code>\n\n"
            f"Категории: <code>{' '.join(sorted(_AI_CATS))}</code>"
        )
        return
    parts = (message.text or "").split()
    try:
        score = max(0.0, min(1.0, float(parts[1]) if len(parts) > 1 else -1.0))
    except (ValueError, TypeError, IndexError):
        score = -1.0
    category = (parts[2] if len(parts) > 2 else "").strip().lower()
    if score < 0 or category not in _AI_CATS:
        await message.answer(
            "❌ Использование (реплаем):\n<code>/aiwrong 0.9 insult</code>\n\n"
            f"Категории: <code>{' '.join(sorted(_AI_CATS))}</code>"
        )
        return
    import json as _json
    extra = _json.dumps({"score": score, "category": category, "reason": "пример от админа"}, ensure_ascii=False)
    mem_id = await db.ai_learn("correction", target, key=category, extra=extra, created_by=message.from_user.id, cap=20)
    await db.audit_log(message.from_user.id, "ai_correct", f"id={mem_id} cat={category} score={score}")
    await message.answer(
        f"🎓 <b>Принято</b> (id={mem_id}): судья будет учиться на этом примере.\n"
        f"Сообщение: {(target[:120])}\nВердикт: <code>{extra}</code>"
    )
