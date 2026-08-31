#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 1604 (0-indexed): return statement at 32 -> should be 36
if len(lines) > 1604:
    if lines[1604].strip().startswith('return web.json_response({"error": "not enough stars"})'):
        lines[1604] = ' ' * 36 + lines[1604].lstrip()

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed return statement indent")