import asyncio
import logging
import os
import signal

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from config import load_settings
from database import Database
from handlers import start, profile, search, guides, payments, admin, discord
from middleware import InjectMiddleware, RateLimitMiddleware
from webapp.server import create_app

logging.basicConfig(level=logging.INFO)

WEBHOOK_PATH = "/webhook"


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

    port = int(os.getenv("PORT", settings.webapp_port))
    web_app = create_app(db, settings, bot)

    # Webhook handler (вместо polling) — избегаем TelegramConflictError при деплое
    webhook_handler = SimpleRequestHandler(dispatcher=dp, bot=bot)
    webhook_handler.register(web_app, path=WEBHOOK_PATH)
    setup_application(web_app, dp, bot=bot)

    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, settings.webapp_host, port)
    await site.start()
    logging.info(f"WebApp сервер запущен на http://{settings.webapp_host}:{port}")
    if settings.webapp_url:
        logging.info(f"Mini App URL: {settings.webapp_url}")
    else:
        logging.warning("WEBAPP_URL не задан — кнопка Mini App в /start не появится")

    # Set webhook
    webhook_url = f"{settings.webapp_url}{WEBHOOK_PATH}"
    await bot.set_webhook(url=webhook_url)
    logging.info(f"Webhook установлен на {webhook_url}")

    # Graceful shutdown
    shutdown_event = asyncio.Event()

    def _signal_handler(sig, frame):
        logging.info(f"Received signal {sig}, shutting down...")
        shutdown_event.set()

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    try:
        await shutdown_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        logging.info("Shutting down...")
        try:
            await bot.delete_webhook()
        except Exception:
            pass
        await runner.cleanup()
        await db.close()
        await bot.session.close()
        logging.info("Shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
