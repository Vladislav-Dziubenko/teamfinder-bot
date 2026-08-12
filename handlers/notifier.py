"""Фоновый отправитель push-уведомлений.

Запускается из main.py циклом раз в N минут. Отправляет в личку бота:
- "bp-ready": тир батл-пасса готов к забору (кулдаун 48ч прошёл, XP хватает);
- "return-bonus": юзер не заходил 3+ дня и у него есть активная Discord-связь
  с готовым ежедневным бонусом (вернись за +10 ⭐).

Антиспам: каждое уведомление шлётся не чаще 1 раза в сутки (по kind).
"""

import asyncio
import logging
from datetime import datetime, timedelta

from aiogram import Bot

from database import Database

logger = logging.getLogger(__name__)

MIN_SEND_INTERVAL = timedelta(hours=24)

# Для возврата: не заходил дольше этого времени
RETURN_INACTIVE = timedelta(days=3)
# Напоминаем о возврате максимум раз в 3 дня
RETURN_COOLDOWN = timedelta(days=3)


async def _send(bot: Bot, user_id: int, text: str) -> bool:
    try:
        await bot.send_message(user_id, text)
        return True
    except Exception as e:
        logger.warning("notify send failed user=%s: %s", user_id, e)
        return False


async def _can_send(db: Database, user_id: int, kind: str) -> bool:
    last = await db.get_last_notification(user_id, kind)
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last)
    except (ValueError, TypeError):
        return True
    return datetime.utcnow() - last_dt >= MIN_SEND_INTERVAL


async def _notify_battlepass_ready(bot: Bot, db: Database, discord_bot=None) -> None:
    """Юзер с XP хватающим на следующий тир и прошедшим кулдауном."""
    from data.games import BATTLE_PASS_TIERS

    now = datetime.utcnow()
    rows = await db.pool.fetch(
        """
        SELECT b.user_id, b.bp_xp, b.claimed_tiers, b.last_claim_at
        FROM user_battlepass b
        JOIN users u ON u.user_id = b.user_id
        WHERE b.bp_xp > 0
        """
    )
    for r in rows:
        import json

        try:
            tiers_claimed = json.loads(r["claimed_tiers"]) if r["claimed_tiers"] else []
        except Exception:
            tiers_claimed = []
        claimed_count = len(tiers_claimed)
        if claimed_count >= len(BATTLE_PASS_TIERS):
            continue
        tier = BATTLE_PASS_TIERS[claimed_count]
        if r["bp_xp"] < tier["xp"]:
            continue
        # кулдаун 48ч между заборами
        if r["last_claim_at"]:
            try:
                last = datetime.fromisoformat(r["last_claim_at"])
            except (ValueError, TypeError):
                last = None
            if last and (now - last).total_seconds() < 48 * 3600:
                continue
        if not await _can_send(db, r["user_id"], "bp-ready"):
            continue
        reward = tier["premium"] or tier["free"]
        reward_name = reward["name"] if reward else "награда"
        ok = await _send(
            bot,
            r["user_id"],
            f"🎮 <b>Твой батл-пасс готов!</b>\n\n"
            f"Уровень {tier['level']}: {reward_name}\n"
            f"Забери награду в Mini App, пока сезон не закончился!",
        )
        if ok:
            await db.mark_notification_sent(r["user_id"], "bp-ready")


async def _notify_return_bonus(bot: Bot, db: Database, discord_bot=None) -> None:
    """Не заходил 3+ дня + активная Discord-связь → вернись за +10 ⭐."""
    now = datetime.utcnow()
    cutoff = (now - RETURN_INACTIVE).isoformat()
    rows = await db.pool.fetch(
        """
        SELECT dc.user_id
        FROM discord_connections dc
        JOIN users u ON u.user_id = dc.user_id
        WHERE COALESCE(u.last_active_at, '') < $1
        """,
        cutoff,
    )
    for r in rows:
        if not await _can_send(db, r["user_id"], "return-bonus"):
            continue
        last_sent = await db.get_last_notification(r["user_id"], "return-bonus")
        if last_sent:
            try:
                last_dt = datetime.fromisoformat(last_sent)
                if now - last_dt < RETURN_COOLDOWN:
                    continue
            except (ValueError, TypeError):
                pass
        ok = await _send(
            bot,
            r["user_id"],
            "🔥 <b>Вернись в TeamFinder!</b>\n\n"
            "Твой Discord-бонус ждёт: +10 ⭐ за активную связь.\n"
            "А ещё — ежедневный бесплатный кейс и награды батл-пасса!",
        )
        if ok:
            await db.mark_notification_sent(r["user_id"], "return-bonus")


async def notifier_loop(bot: Bot, db: Database, interval_seconds: int = 1800, discord_bot=None) -> None:
    """Цикл фоновых уведомлений. Запускать как asyncio.create_task.
    discord_bot — опциональный TeamFinderDiscordBot для пуша в Discord-канал."""
    while True:
        try:
            await _notify_battlepass_ready(bot, db, discord_bot)
        except Exception as e:
            logger.warning("notify battlepass pass failed: %s", e)
        try:
            await _notify_return_bonus(bot, db, discord_bot)
        except Exception as e:
            logger.warning("notify return pass failed: %s", e)
        await asyncio.sleep(interval_seconds)
