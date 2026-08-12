"""Discord bot gateway: подключается к Discord и слушает события сервера.

Запускается как asyncio-задача из main.py. Доступен через request.app["discord_bot"]
в хендлерах (напр., для выдачи роли при привязке аккаунта).

Функционал:
- on_member_join: авто-роль на новый вход (если задан DISCORD_VERIFIED_ROLE_ID).
- post_to_channel(text): пуш-уведомления в канал (напр., новые тиммейты).
- assign_verified_role(discord_id): выдать роль «верифицирован» по Discord ID.
"""

import asyncio
import logging

import discord

logger = logging.getLogger(__name__)


class TeamFinderDiscordBot(discord.Client):
    """Лёгкий Discord-клиент: gateway + утилиты для пуша и ролей."""

    def __init__(
        self,
        guild_id: int = 0,
        verified_role_id: int = 0,
        channel_id: int = 0,
    ):
        intents = discord.Intents.default()
        intents.members = True  # Server Members Intent (нужен для on_member_join)
        super().__init__(intents=intents)
        self.guild_id = guild_id
        self.verified_role_id = verified_role_id
        self.channel_id = channel_id
        self._ready_event = asyncio.Event()

    # ---- Lifecycle ----

    async def on_ready(self):
        logger.info("Discord bot connected as %s (guild=%s)", self.user, self.guild_id)
        self._ready_event.set()

    async def wait_until_ready(self):
        await self._ready_event.wait()

    # ---- Events ----

    async def on_member_join(self, member: discord.Member):
        """Автоматически выдать роль при входе на сервер."""
        if member.guild.id != self.guild_id:
            return
        if not self.verified_role_id:
            return
        role = member.guild.get_role(self.verified_role_id)
        if not role:
            logger.warning("Role %s not found in guild %s", self.verified_role_id, self.guild_id)
            return
        try:
            await member.add_roles(role, reason="Auto-role on join (TeamFinder)")
            logger.info("Assigned role to %s on join", member)
        except discord.Forbidden:
            logger.warning("Bot lacks permission to assign role to %s", member)
        except Exception as e:
            logger.warning("Failed to assign role to %s: %s", member, e)

    # ---- Utilities ----

    async def post_to_channel(self, text: str):
        """Отправить сообщение в сконфигурированный канал (пуш-уведомления)."""
        if not self.channel_id:
            return
        await self.wait_until_ready()
        channel = self.get_channel(self.channel_id)
        if not channel:
            logger.warning("Channel %s not found", self.channel_id)
            return
        try:
            await channel.send(text)
        except Exception as e:
            logger.warning("Failed to post to channel %s: %s", self.channel_id, e)

    async def assign_verified_role(self, discord_id: int):
        """Выдать роль «верифицирован» участнику по его Discord ID.
        Вызывается при привязке аккаунта в мини-аппе."""
        if not self.guild_id or not self.verified_role_id:
            return
        await self.wait_until_ready()
        guild = self.get_guild(self.guild_id)
        if not guild:
            logger.warning("Guild %s not found", self.guild_id)
            return
        member = guild.get_member(discord_id)
        if not member:
            logger.info("Member %s not in guild %s (maybe not joined yet)", discord_id, self.guild_id)
            return
        role = guild.get_role(self.verified_role_id)
        if not role:
            logger.warning("Verified role %s not found", self.verified_role_id)
            return
        try:
            await member.add_roles(role, reason="Discord linked in Nexus")
            logger.info("Assigned verified role to %s", member)
        except discord.Forbidden:
            logger.warning("Bot lacks permission to assign role to %s", member)
        except Exception as e:
            logger.warning("Failed to assign verified role to %s: %s", member, e)


async def start_discord_bot(
    token: str,
    guild_id: int = 0,
    verified_role_id: int = 0,
    channel_id: int = 0,
) -> TeamFinderDiscordBot | None:
    """Запустить Discord-бота как фоновую задачу. Возвращает клиент
    (или None, если токен не задан / бот не смог стартовать)."""
    if not token:
        logger.info("DISCORD_BOT_TOKEN не задан — Discord-бот пропущен")
        return None
    bot = TeamFinderDiscordBot(
        guild_id=guild_id,
        verified_role_id=verified_role_id,
        channel_id=channel_id,
    )
    asyncio.create_task(_run_bot(bot, token))
    return bot


async def _run_bot(bot: TeamFinderDiscordBot, token: str):
    try:
        await bot.start(token)
    except Exception as e:
        logger.error("Discord bot failed to start: %s", e)
