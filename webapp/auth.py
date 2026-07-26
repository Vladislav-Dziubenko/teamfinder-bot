import json
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
    if not init_data:
        return None

    parsed = dict(parse_qsl(init_data))

    parsed.pop("hash", None)
    parsed.pop("signature", None)

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
