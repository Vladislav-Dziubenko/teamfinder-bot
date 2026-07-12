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
    webapp_host: str
    webapp_port: int


def _parse_admin_ids(raw: str) -> set[int]:
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


def _normalize_database_url(raw: str) -> str:
    """Render отдаёт postgres:// — asyncpg ожидает postgresql://."""
    url = raw.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
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

    return Settings(
        bot_token=token,
        admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS", "")),
        price_best_team=int(os.getenv("PRICE_BEST_TEAM", "5")),
        price_highlight=int(os.getenv("PRICE_HIGHLIGHT", "7")),
        price_contact_pack=int(os.getenv("PRICE_CONTACT_PACK", "3")),
        price_pro_subscription=int(os.getenv("PRICE_PRO_SUBSCRIPTION", "15")),
        price_single_contact=int(os.getenv("PRICE_SINGLE_CONTACT", "2")),
        price_premium_application=int(os.getenv("PRICE_PREMIUM_APPLICATION", "3")),
        database_url=database_url,
        webapp_url=_resolve_webapp_url(),
        webapp_host=os.getenv("WEBAPP_HOST", "0.0.0.0"),
        webapp_port=int(os.getenv("WEBAPP_PORT", "8080")),
    )
