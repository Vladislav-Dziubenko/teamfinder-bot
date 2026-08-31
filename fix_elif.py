#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix elif case_config.get("costCoins"): at line 1604 (0-indexed 1604) from indent 20 to 28
# Fix elif case_id == "gold": at line 1575 from 28 to 28 (already correct)
# The issue is that elif case_config.get("costCoins"): is at indent 20 but should be at 28

for i, line in enumerate(lines):
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    
    # Fix elif case_config.get("costCoins"): at indent 20 -> 28
    if stripped.startswith('elif case_config.get("costCoins"):') and indent == 20:
        lines[i] = ' ' * 28 + lines[i].lstrip()
        print(f"Fixed line {i}: elif case_config.get('costCoins'):")
    
    # Fix else: at line 1608 (0-indexed 1608) from 20 to 28
    elif stripped == 'else:' and indent == 20:
        # Check if this is the else for the costCoins block
        lines[i] = ' ' * 28 + stripped + '\n'
        print(f"Fixed line {i}: else:")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed elif/else indentation")