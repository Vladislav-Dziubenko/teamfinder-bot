"""Фоновые недельные гранты Super+.

Запускается из main.py. Каждые 6 часов сверяет активных подписчиков
и выдаёт недополученное (идемпотентно по календарной неделе).
"""

import asyncio
import logging

from aiogram import Bot

from config import Settings
from database import Database

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 6 * 3600


async def super_weekly_tick(bot: Bot, db: Database, settings: Settings) -> None:
    try:
        active = await db.list_super_active()
    except Exception as e:
        logger.warning("super weekly list failed: %s", e)
        return
    paid = 0
    for uid in active:
        try:
            grant = await db.grant_super_weekly(
                uid,
                settings.super_weekly_coins,
                settings.super_weekly_stars,
                settings.super_weekly_keys,
            )
        except Exception as e:
            logger.warning("super weekly grant failed user=%s: %s", uid, e)
            continue
        if grant and grant.get("granted"):
            paid += 1
            await db.audit_log(uid, "super_weekly",
                               f"+{settings.super_weekly_coins}c +{settings.super_weekly_stars}s +{settings.super_weekly_keys}k")
            try:
                await bot.send_message(
                    uid,
                    "👑 <b>Super+ · недельная выдача</b>\n\n"
                    f"💰 +{settings.super_weekly_coins} монет\n"
                    f"⭐ +{settings.super_weekly_stars} звёзд\n"
                    f"🔑 +{settings.super_weekly_keys} ключей Autumn\n\n"
                    "Спасибо, что с нами!",
                )
                await asyncio.sleep(0.05)
            except Exception:
                pass
    if paid:
        logger.info("super weekly paid to %d user(s)", paid)


async def super_weekly_loop(bot: Bot, db: Database, settings: Settings) -> None:
    while True:
        try:
            await super_weekly_tick(bot, db, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("super weekly loop failed")
        await asyncio.sleep(CHECK_INTERVAL)
