"""Проверка подписи initData, которую Telegram WebApp передаёт фронтенду.

Это обязательная защита: без неё любой человек мог бы дёргать API от чужого
имени, просто подставив нужный user_id в запрос. Алгоритм — официальный,
описан в https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import json
import os
import time
from urllib.parse import parse_qsl


def _default_max_age() -> int:
    """Срок годности initData в секундах. Читается из env, по умолчанию 48 часов.

    Telegram ставит auth_date в момент открытия Mini App и НЕ обновляет
    initData, пока приложение открыто. 24 часа было мало — пользователь
    оставляет вкладку открытой на фоне, возвращается на следующий день и
    получает 401 на каждый запрос. 48 часов покрывает длинную сессию
    (ночь + следующий день) без излишнего расширения окна для replay-атак.
    Фронтенд при 401 показывает «Перезайдите в приложение» — повторное
    открытие даёт свежий auth_date.
    """
    try:
        val = int(os.getenv("WEBAPP_AUTH_MAX_AGE_SECONDS", "172800"))
        return val if val > 0 else 172800
    except (TypeError, ValueError):
        return 172800


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
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

    auth_date_str = parsed.get("auth_date")
    if not auth_date_str:
        return None
    try:
        auth_date = int(auth_date_str)
    except ValueError:
        return None

    if max_age_seconds is None:
        max_age_seconds = _default_max_age()
    if max_age_seconds > 0 and time.time() - auth_date > max_age_seconds:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
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
