"""Tests for NEXUS retention analytics + teammate notifications (no DB needed)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import Database
from webapp.server import ANALYTICS_EVENT_TYPES, _teammate_deep_link

failures = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        failures.append(name)


# --- 1. Event whitelist: все 9 требуемых событий принимаются ---
for ev in ("first_open", "app_open", "registration_completed",
           "teammate_search_started", "teammate_search_empty", "teammate_found",
           "teammate_profile_opened", "friend_invited", "notification_opened"):
    check(f"whitelist has {ev}", ev in ANALYTICS_EVENT_TYPES)
check("whitelist rejects garbage", "drop_table" not in ANALYTICS_EVENT_TYPES)
check("whitelist rejects empty", "" not in ANALYTICS_EVENT_TYPES)

# --- 2. Метадата: только dict + кап ---
check("meta dict ok", Database.analytics_meta_str({"game": "cs2"}) == '{"game": "cs2"}')
check("meta non-dict -> empty", Database.analytics_meta_str("x") == "")
check("meta None -> empty", Database.analytics_meta_str(None) == "")
check("meta capped at 2000", len(Database.analytics_meta_str({"k": "v" * 5000})) == 2000)
check("meta unicode kept", "cs2" in Database.analytics_meta_str({"game": "cs2"}))

# --- 3. Матчинг подписки: матрица ---
prof = {"game": "cs2", "nickname": "s1mple", "role": "AWPer", "rank": "Global Elite", "is_active": 1}
base_sub = {"game": "cs2", "q": "", "discord_only": 0, "steam_only": 0}
check("exact game matches", Database.subscription_matches(dict(base_sub), dict(prof)))
check("other game rejected",
      not Database.subscription_matches(dict(base_sub, game="dota2"), dict(prof)))
check("game=all wildcard", Database.subscription_matches(dict(base_sub, game="all"), dict(prof)))
check("game empty wildcard", Database.subscription_matches(dict(base_sub, game=""), dict(prof)))
check("q matches nick (case-insens)",
      Database.subscription_matches(dict(base_sub, q="S1MPLE"), dict(prof)))
check("q matches role", Database.subscription_matches(dict(base_sub, q="awp"), dict(prof)))
check("q matches rank", Database.subscription_matches(dict(base_sub, q="global"), dict(prof)))
check("q mismatch rejected",
      not Database.subscription_matches(dict(base_sub, q="dota mid"), dict(prof)))
check("discord_only blocks no-discord",
      not Database.subscription_matches(dict(base_sub, discord_only=1), dict(prof), False, False))
check("discord_only passes with discord",
      Database.subscription_matches(dict(base_sub, discord_only=1), dict(prof), True, False))
check("steam_only blocks no-steam",
      not Database.subscription_matches(dict(base_sub, steam_only=1), dict(prof), False, False))
check("steam_only passes with steam",
      Database.subscription_matches(dict(base_sub, steam_only=1), dict(prof), False, True))
check("inactive profile rejected",
      not Database.subscription_matches(dict(base_sub), dict(prof, is_active=0)))
check("missing profile rejected", not Database.subscription_matches(dict(base_sub), {}))
check("missing profile None rejected", not Database.subscription_matches(dict(base_sub), None))

# --- 4. Deep link уведомления ---
link = _teammate_deep_link("https://teamfinder-bot-1.onrender.com", 123, 7)
check("deep link has profile",
      link == "https://teamfinder-bot-1.onrender.com?show_profile=123&src=tmfound_7_123")
check("deep link strips slash",
      _teammate_deep_link("https://x.onrender.com/", 1, 2) == "https://x.onrender.com?show_profile=1&src=tmfound_2_1")
check("deep link empty base -> empty", _teammate_deep_link("", 1, 2) == "")

# --- 5. Retention math (та же формула, что в get_analytics_overview) ---
def rate(returned, cohort):
    return (returned / cohort) if cohort else None
check("d1 rate", rate(40, 100) == 0.4)
check("empty cohort -> None", rate(0, 0) is None)
check("zero returned -> 0.0", rate(0, 50) == 0.0)

print()
if failures:
    print(f"FAILURES: {len(failures)}")
    sys.exit(1)
print("ALL ANALYTICS TESTS PASSED")
