import pathlib
p = pathlib.Path(r"C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py")
t = p.read_text(encoding="utf-8")

# 1. add asyncpg import if missing
if "import asyncpg" not in t:
    t = t.replace("import asyncio\n", "import asyncio\nimport asyncpg\n", 1)

# 2. fix the broken costCoins / costStars block
# The broken snippet is from "elif case_config.get(\"costCoins\"):" to the else that follows incorrectly
old = """                            elif case_config.get("costCoins"):
                                total_cost = case_config["costCoins"] * count

                            if not await db._adjust_currency_conn(conn, user["id"], coins=-total_cost):
                                return web.json_response({"error": "not enough coins"}, status=400)
                            else:
                                    total_cost = case_config["costStars"] * count
                                    if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                        return web.json_response({"error": "not enough stars"}, status=400)"""

new = """                            elif case_config.get("costCoins"):
                                total_cost = case_config["costCoins"] * count
                                if not await db._adjust_currency_conn(conn, user["id"], coins=-total_cost):
                                    return web.json_response({"error": "not enough coins"}, status=400)
                            else:
                                total_cost = case_config["costStars"] * count
                                if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                    return web.json_response({"error": "not enough stars"}, status=400)"""

if old in t:
    t = t.replace(old, new)
    print("fixed cost block")
else:
    print("old block NOT found")
    # debug: find nearby
    idx = t.find('costCoins')
    print(t[idx-500:idx+800][:2000])

p.write_text(t, encoding="utf-8")
print("done")
