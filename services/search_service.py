from data.games import GAMES
from database import Database
from keyboards.menus import search_results_keyboard
from services.matching import find_matches, format_profile_card


async def run_team_search(target, db: Database, profile: dict, user_id: int, *, edit: bool = False, answer_method=None):
    premium = await db.has_search_boost(user_id, profile["game"])
    candidates = await db.list_profiles_by_game(profile["game"], exclude_user_id=user_id)
    matches = find_matches(profile, candidates, limit=10 if premium else 3)

    game_title = GAMES[profile["game"]]["title"]

    if not matches:
        text = f"😔 По <b>{game_title}</b> пока никого нет.\n\nСоздай анкету — другие тебя найдут!"
        if edit:
            await target.edit_text(text)
        elif answer_method:
            await answer_method(text)
        else:
            await target.answer(text)
        return

    lines = [f"🔍 <b>Поиск: {game_title}</b>\n"]
    if premium:
        lines.append("⭐ <b>Премиум-подбор</b> — топ совместимости:\n")
    else:
        lines.append("Бесплатно: 3 анкеты (контакты скрыты)\n")

    match_ids = []
    for i, (p, score) in enumerate(matches, 1):
        medal = "🥇" if i == 1 and premium else f"{i}."
        lines.append(f"\n{medal}")
        lines.append(format_profile_card(p, score if premium else None, show_contact=premium))
        match_ids.append((p["user_id"], score))

    if premium:
        best = matches[0]
        lines.append(f"\n🏆 <b>Лучший матч:</b> {best[0]['nickname']} ({best[1]}%)")
    else:
        lines.append("\n⭐ <b>5 Stars</b> — лучший подбор + контакты + 3 поиска")

    kb = search_results_keyboard(match_ids, premium)
    text = "\n".join(lines)[:4000]

    if edit:
        await target.edit_text(text, reply_markup=kb)
    elif answer_method:
        await answer_method(text, reply_markup=kb)
    else:
        await target.answer(text, reply_markup=kb)
