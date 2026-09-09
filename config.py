import base64
import hashlib
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_ids: set[int]
    price_best_team: int
    price_highlight: int
    price_contact_pack: int
    price_pro_subscription: int
    price_single_contact: int
    price_premium_application: int
    # --- Super+ подписка ($15/мес, рекуррентные Stars) ---
    super_price_stars: int
    super_duration_days: int
    super_weekly_coins: int
    super_weekly_stars: int
    super_weekly_keys: int
    # --- Кланы: веса очков, дневной кап, доля в банк ---
    clan_points_case: int
    clan_points_quest: int
    clan_points_active_day: int
    clan_points_invite: int
    clan_daily_cap: int
    clan_bank_share: float
    clan_max_members: int
    database_url: str
    webapp_url: str
    public_app_url: str
    webapp_host: str
    webapp_port: int
    fernet_key: str
    discord_client_id: str
    discord_client_secret: str
    discord_redirect_uri: str
    discord_bot_token: str
    discord_invite_url: str
    discord_guild_id: int
    discord_channel_id: int
    discord_verified_role_id: int
    steam_web_api_key: str
    steam_redirect_uri: str
    # --- AI-модератор «Страж» (free: Gemini Flash / Groq) ---
    ai_mod_enabled: bool
    ai_mod_shadow: bool
    ai_provider: str
    gemini_api_key: str
    groq_api_key: str
    ai_mod_score_low: float
    ai_mod_score_high: float
    ai_mod_night_cap: int
    # --- Страж-собеседник в общем чате ---
    ai_chat_enabled: bool
    ai_chat_cooldown_s: int
    ai_chat_max_per_hour: int
    ai_chat_persona: str


def _parse_admin_ids(raw: str) -> set[int]:
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


def _normalize_database_url(raw: str) -> str:
    """Render отдаёт postgres:// — asyncpg ожидает postgresql://.
    URL-энкодит спецсимволы в пароле. Пароль ищем по ПОСЛЕДНЕМУ @
    (rpartition), чтобы пароль, содержащий сам символ @, не ломал
    парсинг asyncpg (он режет netloc по первому @)."""
    from urllib.parse import quote

    url = raw.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    if not url.startswith("postgresql://"):
        return url

    rest = url[len("postgresql://"):]
    if "@" not in rest:
        return url

    auth, _, hostport = rest.rpartition("@")
    user, _, password = auth.partition(":")
    if not user or not hostport:
        return url

    # Кодируем пароль целиком (urllib quote). Это делает URL безопасным для
    # любого парсера: urlsplit режет netloc по / ? #, asyncpg — по первому @.
    # connect() декодирует обратно через urllib.parse.unquote, поэтому round-trip
    # точен даже для уже percent-encoded паролей (%40 и т.п.).
    if password:
        password = quote(password, safe="")

    return f"postgresql://{user}:{password}@{hostport}"


def _resolve_webapp_url() -> str:
    """WEBAPP_URL вручную, иначе публичный URL Render (RENDER_EXTERNAL_URL)."""
    explicit = os.getenv("WEBAPP_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if render_url:
        return render_url.rstrip("/")
    return ""


def load_settings() -> Settings:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("Укажи BOT_TOKEN в .env")

    database_url = _normalize_database_url(os.getenv("DATABASE_URL", ""))
    if not database_url:
        raise RuntimeError("Укажи DATABASE_URL в .env (PostgreSQL connection string)")

    fernet_key = os.getenv("FERNET_KEY", "").strip()
    if not fernet_key:
        fernet_key = base64.urlsafe_b64encode(hashlib.sha256(token.encode()).digest()).decode()
    return Settings(
        bot_token=token,
        fernet_key=fernet_key,
        admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS", "")),
        price_best_team=int(os.getenv("PRICE_BEST_TEAM", "3")),
        price_highlight=int(os.getenv("PRICE_HIGHLIGHT", "7")),
        price_contact_pack=int(os.getenv("PRICE_CONTACT_PACK", "2")),
        price_pro_subscription=int(os.getenv("PRICE_PRO_SUBSCRIPTION", "8")),
        price_single_contact=int(os.getenv("PRICE_SINGLE_CONTACT", "1")),
        price_premium_application=int(os.getenv("PRICE_PREMIUM_APPLICATION", "2")),
        super_price_stars=int(os.getenv("SUPER_PRICE_STARS", "999")),
        super_duration_days=int(os.getenv("SUPER_DURATION_DAYS", "30")),
        super_weekly_coins=int(os.getenv("SUPER_WEEKLY_COINS", "75000")),
        super_weekly_stars=int(os.getenv("SUPER_WEEKLY_STARS", "100")),
        super_weekly_keys=int(os.getenv("SUPER_WEEKLY_KEYS", "10")),
        clan_points_case=int(os.getenv("CLAN_POINTS_CASE", "10")),
        clan_points_quest=int(os.getenv("CLAN_POINTS_QUEST", "15")),
        clan_points_active_day=int(os.getenv("CLAN_POINTS_ACTIVE_DAY", "5")),
        clan_points_invite=int(os.getenv("CLAN_POINTS_INVITE", "25")),
        clan_daily_cap=int(os.getenv("CLAN_DAILY_CAP", "300")),
        clan_bank_share=float(os.getenv("CLAN_BANK_SHARE", "") or "0.2"),
        clan_max_members=int(os.getenv("CLAN_MAX_MEMBERS", "15")),
        database_url=database_url,
        webapp_url=_resolve_webapp_url(),
        public_app_url=os.getenv("PUBLIC_APP_URL", _resolve_webapp_url()),
        webapp_host=os.getenv("WEBAPP_HOST", "0.0.0.0"),
        webapp_port=int(os.getenv("WEBAPP_PORT", "8080")),
        discord_client_id=os.getenv("DISCORD_CLIENT_ID", "").strip(),
        discord_client_secret=os.getenv("DISCORD_CLIENT_SECRET", "").strip(),
        discord_redirect_uri=os.getenv("DISCORD_REDIRECT_URI", "").strip(),
        discord_bot_token=os.getenv("DISCORD_BOT_TOKEN", "").strip(),
        discord_invite_url=os.getenv("DISCORD_INVITE_URL", "").strip(),
        discord_guild_id=int(os.getenv("DISCORD_GUILD_ID", "0")),
        discord_channel_id=int(os.getenv("DISCORD_CHANNEL_ID", "0")),
        discord_verified_role_id=int(os.getenv("DISCORD_VERIFIED_ROLE_ID", "0")),
        steam_web_api_key=os.getenv("STEAM_WEB_API_KEY", "").strip(),
        steam_redirect_uri=os.getenv("STEAM_REDIRECT_URI", "").strip(),
        ai_mod_enabled=os.getenv("AI_MOD_ENABLED", "0").strip() == "1",
        ai_mod_shadow=os.getenv("AI_MOD_SHADOW", "1").strip() == "1",
        ai_provider=os.getenv("AI_PROVIDER", "gemini").strip().lower() or "gemini",
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        groq_api_key=os.getenv("GROQ_API_KEY", "").strip(),
        ai_mod_score_low=float(os.getenv("AI_MOD_SCORE_LOW", "0.3") or 0.3),
        ai_mod_score_high=float(os.getenv("AI_MOD_SCORE_HIGH", "0.8") or 0.8),
        ai_mod_night_cap=int(os.getenv("AI_MOD_NIGHT_CAP", "30") or 30),
        ai_chat_enabled=os.getenv("AI_CHAT_ENABLED", "0").strip() == "1",
        ai_chat_cooldown_s=int(os.getenv("AI_CHAT_COOLDOWN_S", "60") or 60),
        ai_chat_max_per_hour=int(os.getenv("AI_CHAT_MAX_PER_HOUR", "15") or 15),
        ai_chat_persona=os.getenv("AI_CHAT_PERSONA", "").strip(),
    )
