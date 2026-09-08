import sys

with open('full_diff.txt', 'r', encoding='utf-16') as f:
    lines = f.readlines()

out = []
recording = False
for line in lines:
    if line.startswith('+/* DJ Settings Overlay & Modal */'):
        recording = True
    
    if recording:
        if line.startswith('+/* Fix platter shrinking on play by preserving transform during rotation */') or line.startswith('+/* Move up the record image'):
            break
        if line.startswith('+'):
            out.append(line[1:])

with open('dj_layout_recovered.css', 'w', encoding='utf-8') as f:
    f.writelines(out)
