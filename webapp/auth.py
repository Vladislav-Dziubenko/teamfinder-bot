import hashlib
import hmac
import json
import logging
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
    if not init_data:
        logging.warning("[HMAC] init_data is empty")
        return None

    parsed = dict(parse_qsl(init_data))

    hash_val = parsed.pop("hash", None)
    if not hash_val:
        logging.warning("[HMAC] no hash parameter in init_data")
        return None

    items = sorted(parsed.items())
    data_check_string = "\n".join(f"{k}={v}" for k, v in items)

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, hash_val):
        logging.warning("[HMAC] computed_hash=%s != hash_val=%s", computed_hash[:16], hash_val[:16])
        return None

    auth_date_str = parsed.pop("auth_date", None)
    if not auth_date_str:
        logging.warning("[HMAC] no auth_date in init_data")
        return None

    try:
        auth_date = int(auth_date_str)
    except (ValueError, TypeError):
        logging.warning("[HMAC] auth_date is not an integer: %r", auth_date_str)
        return None

    if max_age_seconds is None:
        max_age_seconds = 86400
    if max_age_seconds > 0 and time.time() - auth_date > max_age_seconds:
        logging.warning("[HMAC] init_data expired: auth_date=%s max_age=%s age=%s", auth_date, max_age_seconds, time.time() - auth_date)
        return None

    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except (json.JSONDecodeError, TypeError):
            logging.warning("[HMAC] user field is not valid JSON: %r", parsed["user"][:200])
            return None

    return parsed
