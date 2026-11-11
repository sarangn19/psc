p = r"C:\Users\saran\Documents\psc app\backend\src\routes\teacher.ts"
lines = open(p, encoding='utf-8').read().splitlines()
lines[282] = '    "Always answer the student\'s actual question directly first, then add helpful context if needed.",'
open(p, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print("done")
