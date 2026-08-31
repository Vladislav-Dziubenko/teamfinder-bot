#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the entire gold case block (from "elif case_id == \"gold\":" to before "elif case_config.get(\"costCoins\")")
# with a properly indented version

old_block = '''                            elif case_id == "gold":
                                # Обычная оплата звездами (для всех, включая бету) — free_gold_opens → звезды
                                free_opens = await conn.fetchval(
                                    "SELECT free_gold_opens FROM users WHERE user_id = $1", user["id"],
                                ) or 0
                                if free_opens >= count:
                                    await conn.execute(
                                    "UPDATE users SET free_gold_opens = free_gold_opens - $1 WHERE user_id = $2",
                                    count, user["id"],
                                )
                            else:
                                remaining = count - free_opens
                                if free_opens > 0:
                                    await conn.execute(
                                    "UPDATE users SET free_gold_opens = 0 WHERE user_id = $1", user["id"],
                                )
                                total_cost = case_config["costStars"] * remaining
                                if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                    return web.json_response({"error": "not enough stars"}, status=400)'''

new_block = '''                            elif case_id == "gold":
                                # Обычная оплата звездами (для всех, включая бету) — free_gold_opens → звезды
                                free_opens = await conn.fetchval(
                                    "SELECT free_gold_opens FROM users WHERE user_id = $1", user["id"],
                                ) or 0
                                if free_opens >= count:
                                    await conn.execute(
                                        "UPDATE users SET free_gold_opens = free_gold_opens - $1 WHERE user_id = $2",
                                        count, user["id"],
                                    )
                                else:
                                    remaining = count - free_opens
                                    if free_opens > 0:
                                        await conn.execute(
                                            "UPDATE users SET free_gold_opens = 0 WHERE user_id = $1", user["id"],
                                        )
                                    total_cost = case_config["costStars"] * remaining
                                    if not await db._adjust_currency_conn(conn, user["id"], stars=-total_cost):
                                        return web.json_response({"error": "not enough stars"}, status=400)'''

content = content.replace(old_block, new_block)

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Rewrote gold case block")