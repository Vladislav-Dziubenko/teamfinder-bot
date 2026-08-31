#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 1612 (0-indexed) - return statement should be at indent 40 (4 more than if at 36)
if len(lines) > 1612:
    line = lines[1612]
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    if indent == 36 and 'return web.json_response({"error": "not enough stars"})' in line:
        lines[1612] = ' ' * 40 + stripped + '\n'
        print("Fixed return indent to 40")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed return indent to 40")