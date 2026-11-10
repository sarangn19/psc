# Learned Chapter Practice Restriction — Architecture

## Source of Truth
`UserChapter.status` (LearningStatus: NOT_STARTED / IN_PROGRESS / LEARNED). Legacy `isLearned=true` treated as LEARNED.

## Central Eligibility Service
`backend/src/lib/learningEligibility.ts`
- `getEligibleLearnedChapterIds(studentId, examId?, subjectId?)`
- `isChapterLearned(studentId, chapterId)`

Uses authenticated student ID only. Filters by exam/subject hierarchy when provided.

## Enforcement Points
- `GET /api/questions/chapter/:chapterId` — 403 if chapter not learned.
- Adaptive `fetchNextQuestion` — scope restricted to learned chapters; no fallback to full bank.
- Pocket `/start`, `/refill` — scope restricted; no widening to unlearned chapters.
- Teacher next-question + conversation orchestration — learned filter + My Learning instruction for unlearned topics.
- Teacher active-question — returns null if chapter no longer learned.
- `findConstrainedQuestion` — filters candidates by learned chapter IDs and returns null if requested chapter not learned.

## Safety
P0 safety filter (`questionSafety`) remains applied in all paths. Questions must pass both learned eligibility and safety.

## Empty State
No learned chapters → message directing to `/my-learning`. No silent fallback.
