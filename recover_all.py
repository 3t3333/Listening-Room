import sys

with open('full_diff.txt', 'r', encoding='utf-16') as f:
    lines = f.readlines()

out = []
recording = False
for line in lines:
    if line.startswith('+/* Visualizer Stand Theme (Page 3) */'):
        recording = True
    
    if recording:
        if line.startswith('+/* Fix platter shrinking on play by preserving transform during rotation */') or line.startswith('+/* Move up the record image'):
            break
        if line.startswith('+'):
            out.append(line[1:])

with open('all_missing_css.css', 'w', encoding='utf-8') as f:
    f.writelines(out)
