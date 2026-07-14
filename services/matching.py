from datetime import datetime
from data.games import GAMES


def _rank_index(game: str, rank: str) -> int:
    ranks = GAMES.get(game, {}).get("ranks", [])
    try:
        return ranks.index(rank)
    except ValueError:
        return len(ranks) // 2


def _playtime_score(a: str, b: str) -> int:
    if a == b:
        return 20
    pairs = {("1-2", "3-4"), ("3-4", "5+"), ("weekend", "1-2"), ("weekend", "3-4")}
    if (a, b) in pairs or (b, a) in pairs:
        return 10
    return 5


def _is_highlighted(profile: dict) -> bool:
    until = profile.get("highlighted_until")
    if not until:
        return False
    try:
        return datetime.fromisoformat(until) > datetime.utcnow()
    except ValueError:
        return False


def score_match(my: dict, other: dict) -> int:
    if my["game"] != other["game"]:
        return 0
    score = 0
    my_rank = _rank_index(my["game"], my["rank"])
    other_rank = _rank_index(other["game"], other["rank"])
    diff = abs(my_rank - other_rank)
    if diff == 0:
        score += 30
    elif diff == 1:
        score += 22
    elif diff == 2:
        score += 12
    else:
        score += 4
    if my.get("looking_for") == other.get("looking_for"):
        score += 15
    if my.get("role") != other.get("role"):
        score += 12
    else:
        score += 6
    score += _playtime_score(my.get("playtime", ""), other.get("playtime", ""))
    if my.get("language", "RU").upper() == other.get("language", "RU").upper():
        score += 10
    if my.get("has_mic") == other.get("has_mic"):
        score += 8
    if _is_highlighted(other):
        score += 5
    if my.get("region") and other.get("region") and my["region"].lower() == other["region"].lower():
        score += 10
    return min(score, 100)


def find_matches(my_profile: dict, candidates: list[dict], limit: int = 10) -> list[tuple[dict, int]]:
    scored = []
    for c in candidates:
        if c["user_id"] == my_profile["user_id"]:
            continue
        s = score_match(my_profile, c)
        if s >= 25:
            scored.append((c, s))
    scored.sort(key=lambda x: (-x[1], not _is_highlighted(x[0])))
    return scored[:limit]


def format_profile_card(profile: dict, score: int | None = None, show_contact: bool = False) -> str:
    game = GAMES.get(profile["game"], {})
    title = game.get("title", profile["game"])
    emoji = game.get("emoji", "🎮")
    lines = [
        f"{emoji} <b>{profile['nickname']}</b> — {title}",
    ]
    if score is not None:
        bar = "🟩" * (score // 20) + "⬜" * (5 - score // 20)
        lines.append(f"Совместимость: <b>{score}%</b> {bar}")
    lines.extend([
        f"Ранг: {profile['rank']} | Роль: {profile['role']}",
        f"Ищет: {profile['looking_for']} | Онлайн: {profile['playtime']}",
    ])
    if profile.get("region"):
        lines.append(f"Регион: {profile['region']}")
    lines.append(f"Язык: {profile.get('language', 'RU')} | Микрофон: {'да' if profile.get('has_mic') else 'нет'}")
    if profile.get("description"):
        desc = profile["description"][:180]
        lines.append(f"\n💬 {desc}")
    if show_contact:
        lines.append(f"\n📩 Контакт: <code>{profile['contact']}</code>")
    else:
        lines.append("\n🔒 Контакт скрыт — купи подбор или премиум")
    return "\n".join(lines)
