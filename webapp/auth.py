import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
    if not init_data:
        return None

    parsed = dict(parse_qsl(init_data))

    hash_val = parsed.pop("hash", None)
    if not hash_val:
        return None

    # data_check_string включает ВСЕ поля, кроме hash.
    # Telegram docs: сортируем alphabetically, формат key=value с \n как разделитель.
    items = sorted(parsed.items())
    data_check_string = "\n".join(f"{k}={v}" for k, v in items)

    # Telegram: secret_key = HMAC-SHA256(bot_token, "WebAppData")
    secret_key = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, hash_val):
        return None

    # auth_date теперь можно извлечь (он был в parsed при построении check_string)
    auth_date_str = parsed.pop("auth_date", None)
    if not auth_date_str:
        return None

    try:
        auth_date = int(auth_date_str)
    except (ValueError, TypeError):
        return None

    if max_age_seconds is None:
        max_age_seconds = 86400
    if max_age_seconds > 0 and time.time() - auth_date > max_age_seconds:
        return None

    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except (json.JSONDecodeError, TypeError):
            return None

    return parsed
