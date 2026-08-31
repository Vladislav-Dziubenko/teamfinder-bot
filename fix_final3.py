#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    
    # Fix: if not await db._adjust_currency_conn at 40 -> should be 36
    if stripped.startswith('if not await db._adjust_currency_conn(') and indent == 40:
        new_lines.append(' ' * 36 + stripped + '\n')
        i += 1
        continue
    
    # Fix: return web.json_response at 32 after if not await... should be 36
    elif stripped.startswith('return web.json_response({"error": "not enough stars"})') and indent == 32:
        # Check if previous line was if not await...
        if new_lines and 'if not await db._adjust_currency_conn(' in new_lines[-1]:
            new_lines.append(' ' * 36 + stripped + '\n')
            i += 1
            continue
    
    # Fix: elif case_config.get("costCoins"): at 20 -> next at 24
    # Fix if not await at 24 -> should be 28
    elif stripped.startswith('if not await db._adjust_currency_conn(') and indent == 24:
        new_lines.append(' ' * 28 + stripped + '\n')
        i += 1
        continue
    
    # Fix return at 28 under if at 24
    elif stripped.startswith('return web.json_response({"error": "not enough coins"})') and indent == 28:
        new_lines.append(' ' * 32 + stripped + '\n')
        i += 1
        continue
    
    # Fix if not await at 24 under else
    elif stripped.startswith('if not await db._adjust_currency_conn(') and indent == 24:
        new_lines.append(' ' * 28 + stripped + '\n')
        i += 1
        continue
    
    # Fix return at 28 under else
    elif stripped.startswith('return web.json_response({"error": "not enough stars"})') and indent == 28:
        new_lines.append(' ' * 32 + stripped + '\n')
        i += 1
        continue
    
    else:
        new_lines.append(line)
        i += 1

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed indentation")