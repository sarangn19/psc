# Question Delivery Endpoint Audit

| Endpoint / Path | Restriction Applied |
|---|---|
| GET /api/questions/chapter/:chapterId | isChapterLearned check → 403 if not learned |
| POST /api/adaptive/session/:id/next (fetchNextQuestion) | learned chapter scope; empty → done message |
| POST /api/pocket/start | resolveScopeChapterIds (learned only); no fallback |
| POST /api/pocket/session/:id/refill | learned scope; no widening |
| GET /api/teacher/session/:id/next | learnedChapterIds filter + My Learning instruction |
| Teacher conversation orchestration | learnedChapterIdsConv filter + instruction |
| GET /api/teacher/session/:id/active-question | null if chapter no longer learned |
| findConstrainedQuestion | learnedChapterIds filter; null if unlearned |

No endpoint falls back to unrestricted question bank.
