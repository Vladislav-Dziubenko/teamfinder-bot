#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 1604 (0-indexed): return statement at indent 32 -> should be 36
if len(lines) > 1604:
    line = lines[1604]
    stripped = line.lstrip()
    if stripped.startswith('return web.json_response({"error": "not enough stars"})'):
        indent = len(line) - len(line.lstrip())
        if indent == 32:
            lines[1604] = ' ' * 36 + line.lstrip() + '\n'

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed return indent")