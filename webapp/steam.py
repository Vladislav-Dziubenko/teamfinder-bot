"""Steam OpenID 2.0 + Steam Web API для Nexus.

Steam использует OpenID 2.0 (legacy), а не OAuth2:
  - Юзер жмёт "Войти через Steam" -> открывается login.steampowered.com
  - После входа Steam редиректит на наш callback с параметром openid.identity
    (например http://steamcommunity.com/openid/id/76561198000000000).
  - Парсим steamid64 из identity, затем дёргаем Steam Web API за профилем
    и CS2-статой (часы в CS2, если игра есть в профиле).

Web API не требует client_secret — только STEAM_WEB_API_KEY (бесплатно
на https://steamcommunity.com/dev/apikey). Для поиска CS2-статы
используем ISteamUserStats.GetUserStatsForGame / GetSchemaForGame.
"""

import logging
from time import time
from urllib.parse import urlencode

import aiohttp

STEAM_LOGIN = "https://steamcommunity.com/openid/login"
STEAM_IDENTITY_PREFIX = "http://steamcommunity.com/openid/id/"
STEAM_PLAYER_SUMMARIES = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/"
STEAM_USER_STATS = "https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/"
STEAM_OWNED_GAMES = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/"

APPID_CS2 = 730
APPID_CSGO = 730


def build_auth_url(redirect_uri: str, state: str) -> str:
    """URL «Войти через Steam» (OpenID 2.0)."""
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": redirect_uri,
        "openid.realm": redirect_uri,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_LOGIN}?{urlencode(params)}"


def extract_steamid64(params: dict) -> str | None:
    """Достаёт steamid64 из openid.identity после callback."""
    identity = params.get("openid.identity", "") or params.get("openid.claimed_id", "")
    for prefix in (STEAM_IDENTITY_PREFIX, STEAM_IDENTITY_PREFIX.replace("http://", "https://")):
        if identity.startswith(prefix):
            return identity[len(prefix):]
    # fallback: последний сегмент URL
    if "steamcommunity.com/openid/id/" in identity:
        return identity.rstrip("/").split("/")[-1] or None
    return None


def parse_openid_params(parsed: dict) -> dict:
    """Приводит query-string параметры OpenID к dict (с поддержкой массивов)."""
    return parsed


async def verify_openid(params: dict) -> bool:
    """Официальная проверка OpenID: шлём mode=check_authentication в Steam.

    Steam возвращает 'is_valid:true' только если подпись совпадает —
    защита от подделки openid.identity (чужой steamid64).
    """
    check = {k: v for k, v in params.items() if k.startswith("openid.")}
    if not check:
        return False
    check["openid.mode"] = "check_authentication"
    async with aiohttp.ClientSession() as session:
        async with session.post(
            STEAM_LOGIN, data=check, timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            if resp.status != 200:
                logging.error(f"[steam] verify_openid HTTP {resp.status}")
                return False
            body = await resp.text()
            return "is_valid:true" in body


async def fetch_player_summary(api_key: str, steamid64: str) -> dict | None:
    """Профиль Steam: ник, аватар, реальное имя."""
    url = f"{STEAM_PLAYER_SUMMARIES}?key={api_key}&steamids={steamid64}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                logging.error(f"[steam] player summary failed: {resp.status}")
                return None
            data = await resp.json()
            players = (data.get("response") or {}).get("players") or []
            return players[0] if players else None


async def fetch_cs2_stats(api_key: str, steamid64: str) -> dict | None:
    """CS2-стата: общее время в игре (в минутах) и общий счёт (kill_count)."""
    url = f"{STEAM_USER_STATS}?key={api_key}&steamid={steamid64}&appid={APPID_CS2}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                return None
            try:
                data = await resp.json()
            except Exception as e:
                logging.warning(f"[steam] cs2 stats decode failed: {e}")
                return None
            stats = (data.get("playerstats") or {}).get("stats") or []
            result: dict = {}
            for item in stats:
                name = item.get("name")
                value = item.get("value")
                if name == "total_time_played":
                    result["minutes_played"] = int(value or 0)
                elif name == "total_kills":
                    result["kills"] = int(value or 0)
            return result or None


async def fetch_owned_games(api_key: str, steamid64: str) -> list[dict]:
    """Список игр юзера: играет ли он в CS2, общее число игр."""
    url = f"{STEAM_OWNED_GAMES}?key={api_key}&steamid={steamid64}&include_appinfo=1&format=json"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                return []
            try:
                data = await resp.json()
            except Exception:
                return []
            games = (data.get("response") or {}).get("games") or []
            return games