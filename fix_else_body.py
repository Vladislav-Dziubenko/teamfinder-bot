#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix else block body - lines 1610-1612 (0-indexed 1609-1611) should be indented 36
# Line 1609: else: at 28 (correct)
# Line 1610: total_cost = ... at 36 (correct)
# Line 1611: if not await... at 28 -> should be 36
# Line 1612: return at 28 -> should be 36

if len(lines) > 1610:
    # Line 1610: total_cost = ... at 36 (correct, already)
    pass

if len(lines) > 1611:
    line = lines[1611]
    indent = len(line) - len(line.lstrip())
    if indent == 28 and 'if not await db._adjust_currency_conn' in line:
        lines[1611] = ' ' * 36 + lines[1611].lstrip()
        print("Fixed if indent")

if len(lines) > 1612:
    line = lines[1612]
    indent = len(line) - len(line.lstrip())
    if indent == 28 and 'return web.json_response' in line:
        lines[1612] = ' ' * 36 + lines[1612].lstrip()
        print("Fixed return indent")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed else body indent")