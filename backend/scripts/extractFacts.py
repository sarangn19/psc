import fitz, re, json

doc = fitz.open(r'C:\Users\saran\Documents\psc app\all_questions_answers.pdf')
pages = [doc[i].get_text() for i in range(doc.page_count)]
text = "\n".join(pages)

# Question marker: Q<num> | <year> | <category...>
marker = re.compile(r'Q(\d+)\s*\|\s*(\d{4})\s*\|\s*([^\n]*)')
blocks = []
for m in marker.finditer(text):
    start = m.end()
    nxt = marker.search(text, start)
    end = nxt.start() if nxt else len(text)
    blocks.append((m.group(1), m.group(2), m.group(3).strip(), text[start:end]))

def clean_q(b):
    # drop the answer line(s) and page footers
    b = re.sub(r'Page\s+\d+/\d+', '', b)
    b = re.sub(r'Answer:\s*.+$', '', b, flags=re.I|re.M)
    b = re.sub(r'^\s*:\s*.+$', '', b, flags=re.M)  # indented answer line
    b = re.sub(r'\[error\]', '', b)
    lines = [l.strip() for l in b.split('\n') if l.strip()]
    return ' '.join(lines).strip()

def get_answer(b):
    am = re.search(r'Answer:\s*(.+)$', b, flags=re.I|re.M)
    if am:
        a = am.group(1).strip()
        if re.fullmatch(r'[A-D]', a):  # key letter only -> no fact
            return None
        return a
    cm = re.search(r'^\s*:\s*(.+?)\s*$', b, flags=re.M)
    if cm:
        return cm.group(1).strip()
    return None

garbled = re.compile(r'[\uFFF0-\uFFFF]|fky~|ðL|ðL¢|RÕaO|ÞÿfV|¾]R£|q]xV')
facts = []
seen = set()
skipped_letter = 0
skipped_err = 0
for num, year, cat, body in blocks:
    q = clean_q(body)
    a = get_answer(body)
    if not q or not a:
        continue
    if garbled.search(q) or garbled.search(a):
        skipped_err += 1
        continue
    if len(q) < 4 or len(a) < 1:
        continue
    key = (q, a)
    if key in seen:
        continue
    seen.add(key)
    facts.append({'q': q, 'a': a, 'category': cat[:80], 'year': year})

with open(r'C:\Users\saran\AppData\Local\Temp\opencode\facts.json', 'w', encoding='utf-8') as f:
    json.dump(facts, f, ensure_ascii=False)

print('total blocks:', len(blocks))
print('facts extracted:', len(facts))
print('skipped garbled/error:', skipped_err)
# language heuristic
def has_ml(s): return any('\u0d00' <= c <= '\u0d7f' for c in s)
ml = sum(1 for x in facts if has_ml(x['q']))
print('malayalam questions:', ml, ' english:', len(facts)-ml)
print('sample:')
for x in facts[:3]:
    print('  Q:', x['q'][:80])
    print('  A:', x['a'][:60])
