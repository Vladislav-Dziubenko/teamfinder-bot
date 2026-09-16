"""Telegram sticker catalog. Only public pack links, never user-account sessions."""
import re
from urllib.parse import urlparse, parse_qs

def sticker_set_name(value: str) -> str:
    value = value.strip()
    if value.startswith(("https://", "http://", "tg://")):
        url = urlparse(value)
        if url.scheme == "tg" and url.netloc == "addstickers":
            value = parse_qs(url.query).get("set", [""])[0]
        elif url.scheme == "https" and url.netloc.lower() in {"t.me", "telegram.me"}:
            parts = url.path.strip("/").split("/")
            value = parts[1] if len(parts) == 2 and parts[0] == "addstickers" else ""
        else:
            value = ""
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", value):
        raise ValueError("Укажите ссылку t.me/addstickers/… или название набора")
    return value


def normalize_sticker_set(result: dict) -> dict:
    return {
        "name": result["name"],
        "title": result.get("title", result["name"]),
        "stickers": [
            {
                "file_id": s["file_id"],
                "thumb_file_id": (s.get("thumbnail") or s.get("thumb") or {}).get("file_id", ""),
                "emoji": s.get("emoji", ""),
                "type": s.get("type", "regular"),
                "is_animated": bool(s.get("is_animated")),
                "is_video": bool(s.get("is_video")),
            }
            for s in result.get("stickers", []) if s.get("file_id")
        ],
    }


def is_sticker_message(text: str) -> bool:
    # Telegram file IDs (and thumbnails) can make the message longer than the
    # ordinary 500-character chat limit. Never truncate a valid sticker token.
    return bool(re.fullmatch(
        r"tg_sticker:[A-Za-z][A-Za-z0-9_]{0,63}:[A-Za-z0-9_-]{10,512}"
        r"(?::[A-Za-z0-9_-]{0,512}:(?:static|animated|video))?", text,
    ))


async def fetch_sticker_set(token: str, name: str) -> dict:
    from aiohttp import ClientSession, ClientTimeout

    async with ClientSession(timeout=ClientTimeout(total=10)) as session:
        async with session.get(
            f"https://api.telegram.org/bot{token}/getStickerSet", params={"name": name},
        ) as response:
            data = await response.json()
            if response.status != 200 or not data.get("ok"):
                raise ValueError("Набор не найден в Telegram. Проверьте ссылку.")
            return normalize_sticker_set(data["result"])
