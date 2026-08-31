#!/usr/bin/env python3
import re

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix the elif case_id == "gold": block indentation
# The elif should be at 28 spaces, and its block should be at 32 spaces
in_elif_block = False
elif_indent = 28
block_indent = 32

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    
    # Check if we're at the elif case_id == "gold":
    if stripped.startswith('elif case_id == "gold":'):
        # This line should be at 28 spaces
        new_lines.append(' ' * 28 + stripped + '\n')
        i += 1
        # Now fix the next lines until the next elif/else at same level
        while i < len(lines):
            next_line = lines[i]
            next_stripped = next_line.lstrip()
            next_indent = len(next_line) - len(next_stripped)
            
            # Check if we've reached the next elif/else at the same level (20 spaces)
            if next_indent == 20 and (next_stripped.startswith('elif ') or next_stripped.startswith('else:')):
                new_lines.append(next_line)
                i += 1
                break
            
            # Fix indentation for lines inside the elif block (should be 32 spaces)
            if next_indent == 24:
                # This line should be at 32 spaces
                new_lines.append(' ' * 32 + next_stripped + '\n')
                i += 1
            elif next_indent == 28 and not next_stripped.startswith('elif ') and not next_stripped.startswith('else:'):
                # This line should be at 32 spaces
                new_lines.append(' ' * 32 + next_stripped + '\n')
                i += 1
            else:
                new_lines.append(next_line)
                i += 1
        continue
    
    new_lines.append(line)
    i += 1

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed indentation")