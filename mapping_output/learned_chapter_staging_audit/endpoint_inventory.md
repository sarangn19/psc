# Endpoint Inventory

| Path/Function | Eligibility Check | P0 Safety | Auth | Result |
|---|---|---|---|---|
| GET /api/questions/chapter/:chapterId | isChapterLearned | filterSafeQuestions in safety lib (not on this path but safety manifest separate) | JWT | Verified blocked for unlearned |
| Adaptive fetchNextQuestion | learned chapter scope | getBlockedQuestionIds | JWT | Verified |
| Pocket /start, /refill | resolveScopeChapterIds learned only | getBlockedQuestionIds | JWT | Verified |
| Teacher /session/:id/next | learnedChapterIds filter | getBlockedQuestionIds | JWT | Verified |
| Teacher conversation orchestration | learnedChapterIdsConv filter | getBlockedQuestionIds | JWT | Verified |
| Teacher active-question | isChapterLearned | getSafetyRecordSync | JWT | Verified |
| findConstrainedQuestion | learnedChapterIds filter | validatePracticeQuestion | server-side | Verified |
| Student learning profile | learnedChapterIds filter | N/A (no question delivery) | JWT | Verified |
