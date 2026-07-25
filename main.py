import asyncio
import logging
import os
import signal
import sys

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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)


async def main():
    try:
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
        shutdown_event = asyncio.Event()
        polling_task: asyncio.Task | None = None

        def _signal_handler(sig, frame):
            logging.info(f"Received signal {sig}, shutting down...")
            shutdown_event.set()

        signal.signal(signal.SIGTERM, _signal_handler)
        signal.signal(signal.SIGINT, _signal_handler)

        # Удаляем старый webhook (мог остаться от предыдущего деплоя с webhook'ом)
        try:
            await bot.delete_webhook()
            logging.info("Старый webhook удалён")
        except Exception as e:
            logging.warning(f"Не удалось удалить webhook: {e}")

        # Polling в фоне — сервер запущен, порт открыт, Render видит порт
        async def polling_loop():
            while not shutdown_event.is_set():
                try:
                    await dp.start_polling(
                        bot,
                        allowed_updates=dp.resolve_used_update_types(),
                    )
                except TelegramConflictError:
                    if shutdown_event.is_set():
                        break
                    logging.warning("TelegramConflictError — другой инстанс поллит. Жду 30с...")
                    try:
                        await asyncio.wait_for(shutdown_event.wait(), timeout=30)
                    except asyncio.TimeoutError:
                        pass
                except Exception as e:
                    if shutdown_event.is_set():
                        break
                    logging.error(f"Polling error: {e}")
                    try:
                        await asyncio.wait_for(shutdown_event.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        pass

        polling_task = asyncio.create_task(polling_loop())
        logging.info("Polling запущен в фоне")

        try:
            await shutdown_event.wait()
        except asyncio.CancelledError:
            pass
        finally:
            logging.info("Shutting down...")
            if polling_task:
                polling_task.cancel()
                try:
                    await polling_task
                except (asyncio.CancelledError, Exception):
                    pass
            await runner.cleanup()
            await db.close()
            await bot.session.close()
            logging.info("Shutdown complete")

    except Exception as e:
        logging.exception(f"Fatal error during startup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
