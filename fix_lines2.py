#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix specific lines by index (0-indexed)
# Lines are 0-indexed
# Line 1575: elif case_id == "gold": at 28
# Line 1578: free_opens = ... at 32
# Line 1586: if free_opens >= count: at 36 -> should be 32
# Line 1587: await conn.execute at 24 -> should be 36
# Line 1592: else: at 72 -> should be 32
# Line 1593: remaining = ... at 36 (ok)
# Line 1595: if free_opens > 0: at 32 -> should be 36
# Line 1596: await at 24 -> should be 40
# Line 1597: UPDATE at 44 (ok)
# Line 1599: total_cost at 36 (ok)
# Line 1601: if not await at 36 (ok)
# Line 1603: return at 40 (ok)

# Fix specific lines
fixes = {
    1586: 32,  # if free_opens >= count:
    1587: 36,  # await conn.execute
    1592: 32,  # else:
    1595: 36,  # if free_opens > 0:
    1596: 40,  # await conn.execute
}

for i, line in enumerate(lines):
    if i in fixes:
        stripped = lines[i].lstrip()
        lines[i] = ' ' * fixes[i] + stripped

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed specific lines")