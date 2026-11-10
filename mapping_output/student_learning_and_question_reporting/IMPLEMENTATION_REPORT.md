# Cognix — My Learning + Question Reporting Implementation Report

## 1. Summary

Implemented two student-facing features end-to-end:

1. **My Learning** — chapter status tracking (NOT_STARTED / IN_PROGRESS / LEARNED) with persistence, filtering, search, bulk updates, and counts.
2. **Report Question Issue** — student report submission with 11 categories, automated deterministic + Groq AI investigation, confidence-based routing, admin dashboard, and audit history.

AI provider remains Groq only (`openai/gpt-oss-20b`). No OpenRouter introduced.

## 2. Database / Schema Changes

File: `backend/prisma/schema.prisma`

- Added enums: `LearningStatus`, `QuestionReportStatus`, `QuestionReportCategory`, `AISeverity`, `QUESTION_REPORTED` to `ActivityType`.
- `UserChapter` now uses `status LearningStatus` (default NOT_STARTED) + `updatedAt`. Legacy `isLearned`/`learnedAt` retained as nullable for data preservation/backfill.
- `QuestionReport` expanded with category, description, suggestedCorrection, questionSnapshot, sessionContext, status/aiStatus, AI investigation fields, resolution fields, indexes.
- Legacy `reason`/`details`/`isResolved` retained as nullable to avoid destructive drops.

Drift check (`prisma migrate diff`) now contains no `DROP TABLE`/`DROP COLUMN`. Only a constraint drop on retired `ca_quiz_questions` (dead data) and nullability relaxations.

Backfill script: `backend/scripts/backfill-learning-status.sql`.

## 3. Backend APIs

### My Learning
- `GET /api/learning` — exams/subjects/chapters with per-chapter status + summary.
- `PATCH /api/learning/chapter/:chapterId` — update one chapter status.
- `PATCH /api/learning/bulk` — update multiple chapters.

### Report Issue
- `POST /api/reports/:questionId/report` — submit report (auth, rate-limited 10/hour, duplicate 409).
- `GET /api/reports` — student's reports.
- `GET /api/reports/:reportId` — report detail (owner only).

### Admin
- `GET /api/admin/reports` — paginated, filtered list.
- `GET /api/admin/reports/:reportId` — detail + related reports.
- `PATCH /api/admin/reports/:reportId/action` — admin actions.
- `POST /api/admin/reports/:reportId/reinvestigate` — re-run AI.
- `GET /api/admin/reports/stats` — dashboard stats.

## 4. AI Investigation Architecture

- Triggered asynchronously after report submission (non-blocking).
- Deterministic checks first (empty text, empty options, invalid answer index, duplicate options, HTML/OCR artifacts, promotional content, missing explanation, existing safety status).
- Reuses prior investigation when question version unchanged.
- Groq `openai/gpt-oss-20b` with JSON mode, strict schema validation, bounded timeout (30s).
- Confidence routing: >=90% + issue detected → AUTO_CONFIRMED; otherwise NEEDS_REVIEW. AI never auto-dismisses.
- Failures preserve report and mark NEEDS_REVIEW with error.

## 5. Frontend

- Bottom nav includes "My Learning".
- `MyLearningPage` implements filters, search, bulk selection, status changes, summary cards, loading/empty states.
- `ReportIssueModal` implements category selection, optional fields, confirmation, duplicate handling.
- Report button present on AdaptivePage, PocketPage, TeacherPage question cards.
- `AdminReports` dashboard implements stats, filters, detail view, actions, reinvestigation.

## 6. Security

- Student ID taken from JWT, never trusted from client.
- Report owner checks on student endpoints.
- Admin endpoints behind `authenticate` + `requireAdmin`.
- Rate limiting per user.
- No direct DB mutation by AI.

## 7. Tests

- Backend: 210 tests passing (vitest).
- Frontend: TypeScript compiles, Vite build succeeds.

## 8. Known Limitations

- Background processing is in-process (not durable queue); AI may not finish on serverless after response. Reports are still saved.
- Legacy `isLearned` backfill requires running `backfill-learning-status.sql` for pre-existing rows (code coalesces in the meantime).
- Screenshots not captured in this report; UI available at routes `/my-learning`, question cards, `/admin/reports`.
- No automated E2E tests added for the new flows beyond compilation.
