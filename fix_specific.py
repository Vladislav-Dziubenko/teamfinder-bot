#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix specific lines by index
# Line 1602 (0-indexed): if not await db._adjust_currency_conn at indent 40 -> should be 36
# Line 1603: empty line
# Line 1603 (return): indent 32 -> should be 36

if len(lines) > 1602:
    # Line 1602 (0-indexed): if not await db._adjust_currency_conn at 40 -> 36
    if lines[1602].startswith('                                        if not await db._adjust_currency_conn('):
        lines[1602] = ' ' * 36 + lines[1602].lstrip()
    
    # Line 1604 (0-indexed) - return statement at 32 -> 36
    if len(lines) > 1604 and lines[1604].strip().startswith('return web.json_response({"error": "not enough stars"})'):
        lines[1604] = ' ' * 36 + lines[1604].lstrip()

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed specific lines")