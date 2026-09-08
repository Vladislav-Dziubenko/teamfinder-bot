"""Фоновый ролловер клановых сезонов.

Раз в сутки сверяет закрывшиеся месяцы и запускает выплату наград
(db.rollover_clan_season — идемпотентно через rewards_paid).
Призёрам шлёт пуш в личку бота (best-effort).
"""

import asyncio
import logging
from datetime import datetime, timedelta

from aiogram import Bot

from config import Settings
from database import Database

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 24 * 3600


async def clan_season_tick(bot: Bot, db: Database, settings: Settings) -> None:
    del settings
    today = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        rows = await db.pool.fetch(
            "SELECT year_month FROM clan_seasons WHERE ends_at <= $1 AND rewards_paid = 0",
            today,
        )
    except Exception as e:
        logger.warning("clan rollover list failed: %s", e)
        return
    for r in rows:
        ym = r["year_month"]
        try:
            res = await db.rollover_clan_season(ym)
        except Exception:
            logging.exception("clan rollover %s failed", ym)
            continue
        if not res.get("ok") or res.get("already"):
            continue
        logger.info("clan rollover %s done: %d paid clans", ym, len(res.get("clans", [])))
        for clan in res.get("clans", []):
            if not clan.get("paid"):
                continue
            for prize in (clan.get("prizes") or []):
                try:
                    await bot.send_message(
                        prize["user_id"],
                        "🏆 <b>Итоги сезона кланов!</b>\n\n"
                        f"Твой клан — топ (ранг {clan.get('rank')}).\n"
                        f"Твоё место по вкладу: {prize.get('place')}.\n"
                        f"Награда: +{prize.get('stars')} ⭐, +{prize.get('keys')} ключей"
                        + (" + чемпионский предмет!" if prize.get("place") == 1 else ""),
                    )
                    await asyncio.sleep(0.05)
                except Exception:
                    pass


async def clan_season_loop(bot: Bot, db: Database, settings: Settings) -> None:
    # Небольшая задержка старта, чтобы БД успела подключиться.
    await asyncio.sleep(60)
    while True:
        try:
            await clan_season_tick(bot, db, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("clan season loop failed")
        await asyncio.sleep(CHECK_INTERVAL)


def prev_month_id(now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    first = now.replace(day=1)
    prev = first - timedelta(days=1)
    return prev.strftime("%Y-%m")
