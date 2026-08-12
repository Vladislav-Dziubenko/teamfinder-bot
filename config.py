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


def _parse_admin_ids(raw: str) -> set[int]:
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


def _normalize_database_url(raw: str) -> str:
    """Render отдаёт postgres:// — asyncpg ожидает postgresql://. URL-энкодит спецсимволы в пароле."""
    import re
    from urllib.parse import quote

    url = raw.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    # Ручной парсинг и кодирование пароля (urlparse может неправильно парсить пароли со спецсимволами)
    # Формат: postgresql://username:password@host:port/database
    match = re.match(r'^(postgresql://[^:]+):([^@]+)@(.+)$', url)
    if match:
        prefix = match.group(1)  # postgresql://username
        password = match.group(2)  # password (может содержать #, @, и т.д.)
        suffix = match.group(3)   # host:port/database

        # Кодируем пароль (заменяем спецсимволы на %XX)
        encoded_password = quote(password, safe='')
        url = f"{prefix}:{encoded_password}@{suffix}"

    return url


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
        price_highlight=int(os.getenv("PRICE_HIGHLIGHT", "4")),
        price_contact_pack=int(os.getenv("PRICE_CONTACT_PACK", "2")),
        price_pro_subscription=int(os.getenv("PRICE_PRO_SUBSCRIPTION", "8")),
        price_single_contact=int(os.getenv("PRICE_SINGLE_CONTACT", "1")),
        price_premium_application=int(os.getenv("PRICE_PREMIUM_APPLICATION", "2")),
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
    )
