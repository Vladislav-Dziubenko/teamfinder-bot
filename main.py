import asyncio
import logging
import os
import signal

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramConflictError
from aiogram.fsm.storage.memory import MemoryStorage
from aiohttp import web

from config import load_settings
from database import Database
from handlers import start, profile, search, guides, payments, admin, discord
from middleware import InjectMiddleware, RateLimitMiddleware
from webapp.server import create_app

logging.basicConfig(level=logging.INFO)


async def main():
    settings = load_settings()
    db = Database(settings.database_url)
    await db.connect()

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())

    dp.update.middleware(RateLimitMiddleware())
    dp.update.middleware(InjectMiddleware(db, settings))

    dp.include_router(start.router)
    dp.include_router(profile.router)
    dp.include_router(search.router)
    dp.include_router(guides.router)
    dp.include_router(payments.router)
    dp.include_router(admin.router)
    dp.include_router(discord.router)

    # Веб-сервер для Telegram Mini App (открывается кнопкой в /start)
    # Render и большинство хостингов сами назначают порт через переменную PORT —
    # если она задана, используем её, иначе берём WEBAPP_PORT из .env (для локальной разработки)
    port = int(os.getenv("PORT", settings.webapp_port))
    web_app = create_app(db, settings, bot)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, settings.webapp_host, port)
    await site.start()
    logging.info(f"WebApp сервер запущен на http://{settings.webapp_host}:{port}")
    if settings.webapp_url:
        logging.info(f"Mini App URL: {settings.webapp_url}")
    else:
        logging.warning("WEBAPP_URL не задан — кнопка Mini App в /start не появится")

    # Graceful shutdown
    stop_event = asyncio.Event()

    def signal_handler(sig, frame):
        logging.info(f"Received signal {sig}, shutting down...")
        stop_event.set()

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Ждём 15 секунд — Render даёт старому контейнеру время получить SIGTERM
    # и закрыть polling, чтобы новый не поймал TelegramConflictError
    await asyncio.sleep(15)

    async def start_polling_with_retry():
        for attempt in range(5):
            try:
                await dp.start_polling(bot)
                return
            except TelegramConflictError as e:
                logging.warning(f"Polling conflict (attempt {attempt+1}/5): {e}. Waiting 10s…")
                await asyncio.sleep(10)
            except Exception as e:
                logging.error(f"Polling error (attempt {attempt+1}/5): {e}. Waiting 10s…")
                await asyncio.sleep(10)
        logging.error("Failed to start polling after 5 attempts")

    polling_task = asyncio.create_task(start_polling_with_retry())
    try:
        await stop_event.wait()
    finally:
        logging.info("Stopping bot...")
        polling_task.cancel()
        try:
            await polling_task
        except (asyncio.CancelledError, Exception):
            pass
        try:
            await dp.stop_polling()
        except Exception:
            pass
        await runner.cleanup()
        await db.close()
        await bot.session.close()
        logging.info("Shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
