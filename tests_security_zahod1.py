"""Security regression tests for заход 1 fixes (no DB needed)."""
import sys

sys.path.insert(0, r"C:\Users\Admin\OneDrive\Документы\Default Project\teamfinder-bot")

from webapp.server import validate_promo_reward, ACHIEVEMENTS_CONFIG

failures = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        failures.append(name)


# --- C1: promo reward validation ---
check("mint 1M stars rejected", validate_promo_reward({"coins": 0, "stars": 1000000, "xp": 0}) is None)
check("negative rejected", validate_promo_reward({"coins": -5, "stars": 0, "xp": 0}) is None)
check("bool rejected", validate_promo_reward({"coins": True, "stars": 0, "xp": 0}) is None)
check("float rejected", validate_promo_reward({"coins": 10.5, "stars": 0, "xp": 0}) is None)
check("unknown key ignored, valid rest ok",
      validate_promo_reward({"coins": 10, "stars": 0, "xp": 0, "admin": True}) == {"coins": 10, "stars": 0, "xp": 0})
check("empty reward rejected", validate_promo_reward({"coins": 0, "stars": 0, "xp": 0}) is None)
check("non-dict rejected", validate_promo_reward("give me stars") is None)
check("caps enforced (coins 501)", validate_promo_reward({"coins": 501, "stars": 0, "xp": 0}) is None)
check("caps enforced (stars 51)", validate_promo_reward({"coins": 0, "stars": 51, "xp": 0}) is None)
check("caps enforced (xp 101)", validate_promo_reward({"coins": 0, "stars": 0, "xp": 101}) is None)
check("legit max passes", validate_promo_reward({"coins": 500, "stars": 50, "xp": 100}) == {"coins": 500, "stars": 50, "xp": 100})
check("legit small passes", validate_promo_reward({"coins": 50}) == {"coins": 50, "stars": 0, "xp": 0})

# --- C2: achievements config sane (server-side source of truth) ---
check("7 achievements defined", len(ACHIEVEMENTS_CONFIG) == 7)
ids = [a["id"] for a in ACHIEVEMENTS_CONFIG]
for aid, pts, cns, tgt in [("a1", 100, 15, 35), ("a4", 150, 40, 50), ("a7", 200, 50, 10)]:
    a = next(x for x in ACHIEVEMENTS_CONFIG if x["id"] == aid)
    check(f"{aid} rewards fixed ({pts}/{cns}) target {tgt}",
          a["points"] == pts and a["coins"] == cns and a["target"] == tgt)
check("unknown id lookup fails", next((a for a in ACHIEVEMENTS_CONFIG if a["id"] == "nope"), None) is None)

# --- H1: exact-match public paths (no prefix bleed) ---
from webapp.server import PUBLIC_API_PATHS, PUBLIC_API_GET_PATHS


def is_public(path, method):
    return path in PUBLIC_API_PATHS or (method == "GET" and path in PUBLIC_API_GET_PATHS)


check("GET /api/teams public", is_public("/api/teams", "GET"))
check("POST /api/teams NOT public", not is_public("/api/teams", "POST"))
check("POST /api/teams/5/apply NOT public", not is_public("/api/teams/5/apply", "POST"))
check("GET /api/teams/5/applications NOT public", not is_public("/api/teams/5/applications", "GET"))
check("GET /api/nexus/shop public", is_public("/api/nexus/shop", "GET"))
check("POST /api/nexus/shop/buy NOT public", not is_public("/api/nexus/shop/buy", "POST"))
check("diag NOT public", not is_public("/api/diag/env", "GET"))
check("client-error still public", is_public("/api/client-error", "POST"))

# --- C6: payment amount verification (pure function, no DB) ---
from types import SimpleNamespace
from handlers.payments import _expected_payment_amount

_s = SimpleNamespace(
    price_best_team=5, price_highlight=7, price_pro_subscription=15,
    price_single_contact=2, price_premium_application=3,
)
check("best_team price", _expected_payment_amount("best_team:cs2", _s) == 5)
check("highlight price", _expected_payment_amount("highlight:profile", _s) == 7)
check("pro price", _expected_payment_amount("pro:subscription", _s) == 15)
check("contact price", _expected_payment_amount("contact:123", _s) == 2)
check("premium_application price", _expected_payment_amount("premium:application", _s) == 3)
check("star_pack p1 price", _expected_payment_amount("star_pack:p1", _s) == 75)
check("star_pack unknown -> None", _expected_payment_amount("star_pack:px", _s) is None)
check("buy_stars amount", _expected_payment_amount("buy_stars:100", _s) == 100)
check("buy_stars garbage -> None", _expected_payment_amount("buy_stars:abc", _s) is None)
check("buy_stars negative -> None", _expected_payment_amount("buy_stars:-5", _s) is None)
check("tip amount", _expected_payment_amount("tip:50", _s) == 50)
check("unknown payload -> None", _expected_payment_amount("hack:free", _s) is None)
check("empty payload -> None", _expected_payment_amount("", _s) is None)

# --- Заход 3: avatar allowlist ---
from webapp.server import _valid_avatar, KNOWN_DECOS

check("avatar relative ok", _valid_avatar("/ak47.webp"))
check("avatar traversal rejected", not _valid_avatar("/../../etc/passwd"))
check("avatar protocol-relative rejected", not _valid_avatar("//evil.com/x.png"))
check("avatar javascript rejected", not _valid_avatar("javascript:alert(1)"))
check("avatar data-text rejected", not _valid_avatar("data:text/html,<h1>x</h1>"))
check("avatar data-png ok", _valid_avatar("data:image/png;base64,iVBORw0KGgo="))
check("avatar t.me ok", _valid_avatar("https://t.me/i/userpic/320/abc.svg"))
check("avatar evil host rejected", not _valid_avatar("https://evil.com/a.png"))
check("avatar subdomain spoof rejected", not _valid_avatar("https://t.me.evil.com/a.png"))
check("avatar empty rejected", not _valid_avatar(""))
check("avatar non-string rejected", not _valid_avatar(None))
check("deco set exact", KNOWN_DECOS == {"orange", "cyan", "crimson", "gold"})

# --- Заход 4: PvP mapping (who is who, votes) ---
from webapp.server import _pvp_public

_base = {
    "id": 7, "creator_id": 100, "creator_nick": "A",
    "opponent_id": 200, "opponent_nick": "B",
    "condition": "x", "stake": 50, "status": "active",
    "winner_id": None, "creator_vote": None, "opponent_vote": None,
    "created_at": "2026-09-01T00:00:00", "expires_at": "2026-09-03T00:00:00",
}
m = _pvp_public(dict(_base), 100)
check("creator sees self as me", m["creatorId"] == "me" and m["opponentId"] == "200")
m2 = _pvp_public(dict(_base), 200)
check("opponent sees self as me", m2["opponentId"] == "me" and m2["creatorId"] == "100")
mv = _pvp_public(dict(_base, creator_vote=100), 100)
check("myVote shown to voter", mv["myVote"] == "me" and mv["opponentVoted"] is False)
mv2 = _pvp_public(dict(_base, opponent_vote=200), 100)
check("opponentVoted visible", mv2["opponentVoted"] is True and mv2["myVote"] is None)
mw = _pvp_public(dict(_base, status="finished", winner_id=200), 200)
check("winner mapped to me", mw["winnerId"] == "me")
mnone = _pvp_public(dict(_base, opponent_id=None, opponent_nick=""), 999)
check("stranger sees raw ids", mnone["creatorId"] == "100" and mnone["opponentId"] is None)
check("expires mapped to ms", isinstance(m["expiresAt"], int) and m["expiresAt"] > 0)

print()
if failures:
    print(f"FAILURES: {len(failures)}")
    sys.exit(1)
print("ALL SECURITY TESTS PASSED")
