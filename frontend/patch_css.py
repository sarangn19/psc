p = 'src/index.css'
s = open(p, encoding='utf-8').read()
start = s.index('/* AI Teacher overrides (scoped) */')
end = s.index('@layer base {')
new_block = r'''/* AI Teacher overrides (scoped) */
main.h-\[calc\(100vh-76px\)\] {
  height: 100vh !important;
  background: #17191D;
  color: #F3F4F6;
}

main.h-\[calc\(100vh-76px\)\] header {
  height: 72px;
  background: #17191D;
  border-bottom: 1px solid #343941;
  color: #F3F4F6;
}

main.h-\[calc\(100vh-76px\)\] .bg-white {
  background: #202329 !important;
  color: #F3F4F6;
  border: 1px solid #343941;
}

main.h-\[calc\(100vh-76px\)\] .text-\[\#1A1F36\] {
  color: #F3F4F6 !important;
}

main.h-\[calc\(100vh-76px\)\] .text-app-textMuted,
main.h-\[calc\(100vh-76px\)\] .text-app-textSecondary {
  color: #A1A7B3 !important;
}

main.h-\[calc\(100vh-76px\)\] button[role="radio"] {
  background: #25282D !important;
  color: #E5E7EB !important;
  border: 1px solid #41454D !important;
}

main.h-\[calc\(100vh-76px\)\] button[role="radio"]:hover {
  background: #2E3238 !important;
}

main.h-\[calc\(100vh-76px\)\] textarea,
main.h-\[calc\(100vh-76px\)\] input {
  background: #202329 !important;
  border: 1px solid #555D6B !important;
  color: #F3F4F6 !important;
}

main.h-\[calc\(100vh-76px\)\] textarea::placeholder {
  color: #A1A7B3 !important;
}

'''
s = s[:start] + new_block + s[end:]
open(p, 'w', encoding='utf-8').write(s)
print("done")
EOF