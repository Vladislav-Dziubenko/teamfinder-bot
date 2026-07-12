import asyncio
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiohttp import web

from config import load_settings
from database import Database
from handlers import start, profile, search, guides, payments, admin
from middleware import InjectMiddleware
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

    dp.update.middleware(InjectMiddleware(db, settings))

    dp.include_router(start.router)
    dp.include_router(profile.router)
    dp.include_router(search.router)
    dp.include_router(guides.router)
    dp.include_router(payments.router)
    dp.include_router(admin.router)

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

    try:
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()
        await db.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
