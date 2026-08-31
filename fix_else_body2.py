#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix if and return inside else block at lines 1611, 1612 (0-indexed 1611, 1612)
# They should be at indent 36 (else is at 28, so body should be 36)

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