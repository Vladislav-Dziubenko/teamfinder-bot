"""Проверка подписи initData, которую Telegram WebApp передаёт фронтенду.

Это обязательная защита: без неё любой человек мог бы дёргать API от чужого
имени, просто подставив нужный user_id в запрос. Алгоритм — официальный,
описан в https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> dict | None:
    """Возвращает распарсенные данные пользователя, если подпись верна, иначе None."""
    if not init_data:
        return None

    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None

    # Проверка времени авторизации
    auth_date_str = parsed.get("auth_date")
    if not auth_date_str:
        return None
    try:
        auth_date = int(auth_date_str)
        if time.time() - auth_date > max_age_seconds:
            return None
    except ValueError:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    # Официальный алгоритм Telegram: HMAC(key=bot_token, msg="WebAppData")
    # https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except json.JSONDecodeError:
            return None

    return parsed
