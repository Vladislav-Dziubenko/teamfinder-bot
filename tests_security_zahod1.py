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

print()
if failures:
    print(f"FAILURES: {len(failures)}")
    sys.exit(1)
print("ALL SECURITY TESTS PASSED")
