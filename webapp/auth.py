"""Проверка подписи initData, которую Telegram WebApp передаёт фронтенду.

Это обязательная защита: без неё любой человек мог бы дёргать API от чужого
имени, просто подставив нужный user_id в запрос. Алгоритм — официальный,
описан в https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import json
import logging
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


def _debug_log(msg: str) -> None:
    logging.warning(f"[auth_debug] {msg}")


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
    """Возвращает распарсенные данные пользователя, если подпись верна, иначе None."""
    if not init_data:
        _debug_log("пустой init_data")
        return None

    try:
        parsed = dict(parse_qsl(init_data))
        _debug_log(f"распарсено ключей: {len(parsed)}")
    except ValueError as e:
        _debug_log(f"parse_qsl ошибка: {e}")
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        _debug_log("нет hash")
        return None

    #     # Telegram может добавить signature уже после вычисления hash
    parsed.pop("signature", None)

    # auth_date тоже не входит в data_check_string
    auth_date_str = parsed.pop("auth_date", None)
    if not auth_date_str:
        _debug_log("нет auth_date")
        return None
    try:
        auth_date = int(auth_date_str)
    except (ValueError, TypeError):
        _debug_log(f"auth_date не число: {auth_date_str!r}")
        return None

    if max_age_seconds is None:
        max_age_seconds = _default_max_age()
    if max_age_seconds > 0 and time.time() - auth_date > max_age_seconds:
        _debug_log(f"auth_date просрочен: {time.time() - auth_date} > {max_age_seconds} сек")
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    _debug_log(f"ключи в data_check_string: {sorted(parsed.keys())}")
    _debug_log(f"data_check_string ПОЛНОСТЬЮ ({len(data_check_string)} chars): {data_check_string!r}")

    # Telegram Python-пример:  secret = HMAC(key=bot_token, msg="WebAppData")
    secret_py = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
    hash_py = hmac.new(secret_py, data_check_string.encode(), hashlib.sha256).hexdigest()

    # Telegram Node.js пример: secret = HMAC(key="WebAppData", msg=bot_token)  (аргументы переставлены)
    secret_js = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    hash_js = hmac.new(secret_js, data_check_string.encode(), hashlib.sha256).hexdigest()

    _debug_log(f"BOT_TOKEN начало={bot_token[:8]}... конец=...{bot_token[-4:]}")
    _debug_log(f"hash received={received_hash}")
    _debug_log(f"hash Python={hash_py} JS={hash_js}")

    if hmac.compare_digest(hash_py, received_hash):
        _debug_log("HMAC совпал (Python)")
    elif hmac.compare_digest(hash_js, received_hash):
        _debug_log("HMAC совпал (JS)")
    else:
        _debug_log("HMAC не совпал ни с одним вариантом")
        return None

    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except json.JSONDecodeError:
            _debug_log("user не JSON")
            return None

    return parsed
