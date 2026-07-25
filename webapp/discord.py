import hashlib
import hmac
import json
import logging
from time import time
from urllib.parse import urlencode

import aiohttp

DISCORD_API = "https://discord.com/api/v10"
AUTHORIZE_URL = f"{DISCORD_API}/oauth2/authorize"
TOKEN_URL = f"{DISCORD_API}/oauth2/token"
USER_URL = f"{DISCORD_API}/users/@me"
CONNECTIONS_URL = f"{DISCORD_API}/users/@me/connections"
REVOKE_URL = f"{DISCORD_API}/oauth2/token/revoke"

SCOPES = ["identify", "connections"]


def _make_state(secret: str, user_id: int) -> str:
    ts = int(time())
    raw = f"{user_id}:{ts}"
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{sig}.{raw}"


def _verify_state(secret: str, state: str) -> int | None:
    try:
        parts = state.split(".")
        if len(parts) != 3:
            return None
        sig, user_id, ts = parts
        expected = hmac.new(secret.encode(), f"{user_id}:{ts}".encode(), hashlib.sha256).hexdigest()[:16]
        if sig != expected:
            return None
        if time() - int(ts) > 600:
            return None
        return int(user_id)
    except (ValueError, IndexError):
        return None


def build_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(client_id: str, client_secret: str, redirect_uri: str, code: str) -> dict | None:
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(TOKEN_URL, data=data) as resp:
            if resp.status != 200:
                logging.error(f"Discord token exchange failed: {resp.status}")
                return None
            return await resp.json()


async def refresh_token(client_id: str, client_secret: str, refresh: str) -> dict | None:
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(TOKEN_URL, data=data) as resp:
            if resp.status != 200:
                logging.error(f"Discord token refresh failed: {resp.status}")
                return None
            return await resp.json()


async def fetch_discord_user(access_token: str) -> dict | None:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(USER_URL, headers=headers) as resp:
            if resp.status != 200:
                logging.error(f"Discord user fetch failed: {resp.status}")
                return None
            return await resp.json()


async def fetch_discord_connections(access_token: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(CONNECTIONS_URL, headers=headers) as resp:
            if resp.status != 200:
                logging.error(f"Discord connections fetch failed: {resp.status}")
                return []
            return await resp.json()


async def revoke_token(client_id: str, client_secret: str, access_token: str) -> None:
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "token": access_token,
        "token_type_hint": "access_token",
    }
    async with aiohttp.ClientSession() as session:
        try:
            await session.post(REVOKE_URL, data=data)
        except Exception as e:
            logging.error(f"Discord token revoke failed: {e}")
