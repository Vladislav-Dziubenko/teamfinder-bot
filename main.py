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
from handlers import start, profile, search, guides, payments, admin, discord, appeal
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
        # Кэшируем username бота (нужен для ссылок t.me/<bot> на бан-экране,
        # реферальных ссылок и direct_app_url). Без get_me() username = None.
        # Таймаут 8с: если Telegram API висит, не затягиваем старт контейнера
        # (Render отдаёт 502, пока порт не открыт).
        try:
            await asyncio.wait_for(bot.me(), timeout=8)
        except Exception as e:
            logging.warning("bot.me() failed: %s", e)
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
        # Последний: апелляции забаненных (без фильтров — только «неизвестный» текст)
        dp.include_router(appeal.router)

        # ---- Шаг 3: создаём приложение, регистрируем роуты ----
        web_app = create_app(db, settings, bot)
        web_app["db_ready"] = False

        # Генерируем секретный путь для webhook (зависит только от токена бота)
        webhook_secret = hashlib.sha256(settings.bot_token.encode()).hexdigest()
        web_app["dp"] = dp
        web_app["webhook_secret"] = webhook_secret

        # ---- Discord бот (gateway): авто-роль + пуш в канал ----
        from webapp.discord_bot import start_discord_bot
        discord_bot = await start_discord_bot(
            token=settings.discord_bot_token,
            guild_id=settings.discord_guild_id,
            verified_role_id=settings.discord_verified_role_id,
            channel_id=settings.discord_channel_id,
        )
        web_app["discord_bot"] = discord_bot

        # Фоновые push-уведомления (тир пасса готов, возврат за бонусом)
        from handlers.notifier import notifier_loop
        asyncio.create_task(notifier_loop(bot, db, interval_seconds=1800, discord_bot=discord_bot))

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
            # Ретраи: при деплое Render поднимает контейнер и БД одновременно,
            # первый connect часто падает (БД ещё не готова). Без ретраев
            # db_ready навсегда остаётся False и все /api/* отдают 503/502.
            for attempt in range(1, 31):
                try:
                    await db.connect()
                    web_app["db_ready"] = True
                    logging.info("TIMING db.connect() done  +%.2fs (attempt %d)", time.monotonic() - _PROCESS_START, attempt)
                    return
                except Exception as e:
                    logging.warning("DB init attempt %d/30 failed: %s", attempt, e)
                    await asyncio.sleep(5)

        asyncio.create_task(_init_db())

        # ---- Шаг 6: удаляем старый webhook (если был) и регистрируем новый ----
        # Хардкодим правильный URL чтобы не прыгал между -1 и -9pol из-за старого WEBAPP_URL/кэша
        _hardcoded = "https://teamfinder-bot-1-9pol.onrender.com"
        public_url = (os.environ.get("RENDER_EXTERNAL_URL") or "").strip()
        if not public_url:
            public_url = (settings.webapp_url or "").strip()
        # Если Render отдал старый -1 без -9pol — форсим -9pol
        if public_url == "https://teamfinder-bot-1.onrender.com":
            public_url = _hardcoded
        if not public_url:
            public_url = _hardcoded
        logging.info("WEBHOOK public_url resolved: '%s' (RENDER_EXTERNAL_URL='%s' webapp_url='%s')",
                     public_url, os.environ.get("RENDER_EXTERNAL_URL", ""), settings.webapp_url)
        webhook_url = ""
        if public_url:
            try:
                await bot.delete_webhook(drop_pending_updates=True)
            except Exception:
                logging.exception("delete_webhook перед set_webhook")
            webhook_url = f"{public_url.rstrip('/')}/webhook/{webhook_secret}"
            for attempt in range(3):
                try:
                    await bot.set_webhook(
                        url=webhook_url,
                        allowed_updates=dp.resolve_used_update_types(),
                        drop_pending_updates=True,
                        secret_token=webhook_secret,
                    )
                    logging.info("Webhook установлен: %s", webhook_url)
                    break
                except Exception as e:
                    logging.warning("set_webhook attempt %d/3 failed: %s", attempt + 1, e)
                    if attempt < 2:
                        await asyncio.sleep(3)
        else:
            logging.warning("WEBAPP_URL / RENDER_EXTERNAL_URL не задан — webhook не зарегистрирован")

        # ---- Шаг 6b: watchdog — каждые 10 мин сверяет webhook, чинит если слетел на старый -1 ----
        async def _webhook_watchdog():
            await asyncio.sleep(60)  # первый чек через минуту после старта
            while True:
                try:
                    if not webhook_url:
                        await asyncio.sleep(600)
                        continue
                    info = await bot.get_webhook_info()
                    if info.url != webhook_url:
                        logging.warning("Webhook mismatch: got '%s' expected '%s' -> fixing", info.url, webhook_url)
                        await bot.set_webhook(
                            url=webhook_url,
                            allowed_updates=dp.resolve_used_update_types(),
                            drop_pending_updates=True,
                            secret_token=webhook_secret,
                        )
                        logging.info("Webhook watchdog fixed: %s", webhook_url)
                except Exception as e:
                    logging.warning("webhook watchdog failed: %s", e)
                await asyncio.sleep(600)

        if webhook_url:
            asyncio.create_task(_webhook_watchdog())

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