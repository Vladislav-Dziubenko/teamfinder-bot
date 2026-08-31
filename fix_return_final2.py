#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix the return at line 1612 (0-indexed) - should be at indent 40 (4 more than if at 36)
if len(lines) > 1612:
    line = lines[1612]
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    if indent == 36 and 'return web.json_response({"error": "not enough stars"})' in line:
        lines[1612] = ' ' * 40 + stripped + '\n'
        print("Fixed return indent to 40")
    else:
        print(f"Did not match: indent={len(line) - len(line.lstrip())}, stripped={repr(stripped[:50])}")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done")