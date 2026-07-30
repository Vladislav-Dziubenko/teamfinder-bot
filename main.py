import asyncio
import hashlib
import logging
import os
import signal
import sys
import time

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiohttp import web

from config import load_settings
from database import Database
from handlers import start, profile, search, guides, payments, admin, discord
from middleware import InjectMiddleware, RateLimitMiddleware
from webapp.server import create_app

_PROCESS_START = time.monotonic()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger("aiogram.dispatcher").setLevel(logging.WARNING)

logging.info("INIT PORT_ENV=%s  WEBAPP_PORT_ENV=%s  RENDER_EXTERNAL_URL=%s",
             os.environ.get("PORT"), os.environ.get("WEBAPP_PORT"), os.environ.get("RENDER_EXTERNAL_URL"))


async def main():
    try:
        settings = load_settings()

        # ---- Шаг 1: создаём db-объект (пул НЕ подключён) ----
        db = Database(settings.database_url, bot_token=settings.bot_token, fernet_key=settings.fernet_key)

        # ---- Шаг 2: Telegram bot setup (быстро, без БД) ----
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

        # ---- Шаг 3: создаём приложение, регистрируем роуты ----
        web_app = create_app(db, settings, bot)
        web_app["db_ready"] = False

        # Генерируем секретный путь для webhook (зависит только от токена бота)
        webhook_secret = hashlib.sha256(settings.bot_token.encode()).hexdigest()
        web_app["dp"] = dp
        web_app["webhook_secret"] = webhook_secret

        # ---- Шаг 4: открываем порт МГНОВЕННО (без БД) ----
        port = int(os.getenv("PORT", settings.webapp_port))
        logging.info("PORT=%s  WEBAPP_PORT=%s → resolved port=%d", os.getenv("PORT"), settings.webapp_port, port)
        runner = web.AppRunner(web_app)
        await runner.setup()
        site = web.TCPSite(runner, settings.webapp_host, port)
        await site.start()
        logging.info("TIMING site.start() done  +%.2fs  port=%d", time.monotonic() - _PROCESS_START, port)
        logging.info(f"WebApp сервер запущен на http://{settings.webapp_host}:{port}")

        # ---- Шаг 5: инициализация БД в фоне (не блокирует порт) ----
        async def _init_db():
            try:
                await db.connect()
                web_app["db_ready"] = True
                logging.info("TIMING db.connect() done  +%.2fs", time.monotonic() - _PROCESS_START)
            except Exception as e:
                logging.exception("DB init failed: %s", e)

        asyncio.create_task(_init_db())

        # ---- Шаг 6: удаляем старый webhook (если был) и регистрируем новый ----
        public_url = (os.environ.get("RENDER_EXTERNAL_URL") or "").strip()
        if not public_url:
            public_url = (settings.webapp_url or "").strip()
        logging.info("WEBHOOK public_url resolved: '%s' (RENDER_EXTERNAL_URL='%s' webapp_url='%s')",
                     public_url, os.environ.get("RENDER_EXTERNAL_URL", ""), settings.webapp_url)
        if public_url:
            try:
                await bot.delete_webhook(drop_pending_updates=True)
            except Exception:
                logging.exception("delete_webhook перед set_webhook")
            webhook_url = f"{public_url.rstrip('/')}/webhook/{webhook_secret}"
            await bot.set_webhook(
                url=webhook_url,
                allowed_updates=dp.resolve_used_update_types(),
                drop_pending_updates=True,
                secret_token=webhook_secret,
            )
            logging.info("Webhook установлен: %s", webhook_url)
        else:
            logging.warning("WEBAPP_URL / RENDER_EXTERNAL_URL не задан — webhook не зарегистрирован")

        # ---- Graceful shutdown ----
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
                await bot.delete_webhook(drop_pending_updates=True)
                logging.info("Webhook удалён")
            except Exception as e:
                logging.warning(f"Не удалось удалить webhook: {e}")
            await runner.cleanup()
            await db.close()
            await bot.session.close()
            if "session" in web_app:
                await web_app["session"].close()
            logging.info("Shutdown complete")

    except Exception as e:
        logging.exception(f"Fatal error during startup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())