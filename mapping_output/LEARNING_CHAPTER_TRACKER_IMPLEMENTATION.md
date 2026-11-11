# LEARNING CHAPTER TRACKER IMPLEMENTATION

## Overview

This document describes the implementation of chapter-level learning tracking for the My Learning feature. The implementation leverages existing database models and extends the API to provide subject-level and exam-level completion percentages.

---

## Database Changes

**No schema changes required.** The existing `UserChapter` model already provides chapter-level tracking:

```prisma
model UserChapter {
  id        String         @id @default(cuid())
  userId    String
  chapterId String
  status    LearningStatus @default(NOT_STARTED)
  updatedAt DateTime       @updatedAt @default(now())

  // Legacy columns retained for data preservation / backfill
  isLearned Boolean?
  learnedAt DateTime?

  user    User    @relation(fields: [userId], references: [id])
  chapter Chapter @relation(fields: [chapterId], references: [id])

  @@unique([userId, chapterId])
  @@map("user_chapters")
}

enum LearningStatus {
  NOT_STARTED
  IN_PROGRESS
  LEARNED
}
```

### Data Integrity Guarantees
- **Unique constraint**: `@@unique([userId, chapterId])` prevents duplicate progress records
- **Student isolation**: All queries filter by `userId`
- **Legacy preservation**: `isLearned` and `learnedAt` columns retained for historical data
- **No concept auto-marking**: `UserConceptStat` remains separate for adaptive engine mastery calculations

---

## Backend Implementation

### File: `backend/src/routes/learning.ts`

#### GET /api/learning
Returns complete exam → subject → chapter hierarchy with **computed completion percentages at all three levels**.

**Response Structure:**
```typescript
interface LearningResponse {
  exams: ExamWithProgress[];
  summary: GlobalSummary;
}

interface ExamWithProgress {
  id: string;
  name: string;
  category: string;
  subjects: SubjectWithProgress[];
  summary: LevelSummary;  // Exam-level completion
}

interface SubjectWithProgress {
  id: string;
  name: string;
  order: number;
  chapters: ChapterWithStatus[];
  summary: LevelSummary;  // Subject-level completion
}

interface ChapterWithStatus {
  id: string;
  name: string;
  order: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED';
}

interface LevelSummary {
  totalChapters: number;
  learnedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  completionPercent: number;  // Rounded percentage of learned chapters
}

interface GlobalSummary {
  totalChapters: number;
  learnedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  completionPercent: number;
}
```

#### Computation Logic

```typescript
// Subject-level
const subjectTotal = chapters.length;
const subjectLearned = chapters.filter(c => c.status === 'LEARNED').length;
const subjectInProgress = chapters.filter(c => c.status === 'IN_PROGRESS').length;
const subjectCompletion = subjectTotal > 0 ? Math.round((subjectLearned / subjectTotal) * 100) : 0;

// Exam-level (aggregated from subjects)
const examTotal = subjects.reduce((sum, s) => sum + s.summary.totalChapters, 0);
const examLearned = subjects.reduce((sum, s) => sum + s.summary.learnedCount, 0);
const examInProgress = subjects.reduce((sum, s) => sum + s.summary.inProgressCount, 0);
const examCompletion = examTotal > 0 ? Math.round((examLearned / examTotal) * 100) : 0;

// Global (all exams)
const globalTotal = exams.reduce((sum, e) => sum + e.summary.totalChapters, 0);
const globalLearned = exams.reduce((sum, e) => sum + e.summary.learnedCount, 0);
```

#### PATCH /api/learning/chapter/:chapterId
Updates a single chapter's status. Uses `upsert` with unique constraint for idempotency.

```typescript
const userChapter = await prisma.userChapter.upsert({
  where: { userId_chapterId: { userId, chapterId } },
  update: { status },
  create: { userId, chapterId, status },
});
```

#### PATCH /api/learning/bulk
Bulk updates multiple chapters. Validates all chapter IDs exist before updating.

```typescript
const results = await Promise.all(
  chapterIds.map(chapterId =>
    prisma.userChapter.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: { status },
      create: { userId, chapterId, status },
    })
  )
);
```

### File: `backend/src/lib/learningEligibility.ts` (Unchanged)

Centralized eligibility service used by all practice endpoints:

```typescript
export async function getEligibleLearnedChapterIds(
  studentId: string,
  examId?: string,
  subjectId?: string
): Promise<string[]> {
  const userChapters = await prisma.userChapter.findMany({
    where: { userId: studentId, OR: [{ status: 'LEARNED' }, { isLearned: true }] },
    select: { chapterId: true },
  });
  // Optional hierarchy filtering...
}

export async function isChapterLearned(studentId: string, chapterId: string): Promise<boolean> {
  // Checks status === 'LEARNED' || isLearned === true
}
```

**Enforcement Points** (all use `learningEligibility`):
- `GET /api/questions/chapter/:chapterId` — 403 if not learned
- Adaptive `fetchNextQuestion` — scopes to learned chapters only
- Pocket `/start`, `/refill` — scopes to learned chapters only
- Teacher next-question + conversation — learned filter + My Learning redirect
- `findConstrainedQuestion` — filters by learned chapter IDs

---

## Frontend Implementation

### File: `frontend/src/pages/MyLearningPage.tsx`

#### Current Features (Already Implemented)
- ✅ Hierarchical display: Exam → Subject → Chapter rows
- ✅ Chapter status: NOT_STARTED, IN_PROGRESS, LEARNED (dropdown + color-coded badge)
- ✅ Search: Chapter name, subject name, exam name
- ✅ Status filters: All / Learned / In Progress / Not Started
- ✅ Bulk selection: Checkboxes per row + "Select all visible" + "Clear selection"
- ✅ Bulk updates: Mark selected as Learned/In Progress/Not Started
- ✅ Summary cards: Total, Learned, In Progress, Not Started, Global Completion%
- ✅ Loading/empty states
- ✅ Mobile-responsive (flex/grid layouts)
- ✅ Dark-mode compatible (CSS variables)

#### New: Subject/Exam Progress Display
The API now returns `summary` on each subject and exam. The frontend can display:

```tsx
// In subject header row
<span className="text-[12px] text-app-textMuted">
  {subject.summary.completionPercent}% complete
</span>

// In exam header row
<span className="text-[12px] text-app-textMuted">
  {exam.summary.completionPercent}% complete
</span>
```

#### Data Flow
```
User opens /my-learning
    → GET /api/learning
    → Response: exams[] with nested subjects[] with chapters[] + summaries
    → Frontend renders grouped list with progress indicators
    → User clicks chapter dropdown → PATCH /api/learning/chapter/:id
    → User selects multiple + bulk action → PATCH /api/learning/bulk
    → Optimistic UI update via re-fetch
```

---

## API Response Example

```json
{
  "exams": [
    {
      "id": "exam-1",
      "name": "Kerala PSC Degree Level",
      "category": "PSC",
      "summary": {
        "totalChapters": 45,
        "learnedCount": 12,
        "inProgressCount": 8,
        "notStartedCount": 25,
        "completionPercent": 26
      },
      "subjects": [
        {
          "id": "subj-1",
          "name": "General Knowledge",
          "order": 0,
          "summary": {
            "totalChapters": 15,
            "learnedCount": 5,
            "inProgressCount": 3,
            "notStartedCount": 7,
            "completionPercent": 33
          },
          "chapters": [
            { "id": "ch-1", "name": "Indian History", "order": 0, "status": "LEARNED" },
            { "id": "ch-2", "name": "Geography", "order": 1, "status": "IN_PROGRESS" },
            { "id": "ch-3", "name": "Polity", "order": 2, "status": "NOT_STARTED" }
          ]
        }
      ]
    }
  ],
  "summary": {
    "totalChapters": 120,
    "learnedCount": 35,
    "inProgressCount": 20,
    "notStartedCount": 65,
    "completionPercent": 29
  }
}
```

---

## Data Rules Compliance

| Rule | Implementation |
|------|----------------|
| Reuse existing learning-progress models | ✅ `UserChapter` model used |
| Safe chapter-level solution without destroying historical data | ✅ Legacy `isLearned`, `learnedAt` preserved |
| Do not auto-mark concepts when chapter learned | ✅ `UserConceptStat` separate, untouched |
| Do not modify QuestionAttempt, PocketItem, scoring, diagnostic | ✅ Separate systems, no changes |
| Do not duplicate progress records | ✅ `@@unique([userId, chapterId])` |
| Bulk updates affect only selected student's chapters | ✅ All queries filter by `userId` |

---

## Duplicate Chapter Names Handling

- **Database**: `@@unique([name, subjectId])` on `Chapter` model allows same name across subjects
- **API**: Returns full hierarchy (exam → subject → chapter) so context is preserved
- **Frontend**: Displays subject name alongside chapter name in list

---

## Student Data Isolation

All learning endpoints:
1. Extract `userId` from authenticated request (`req.user!.id`)
2. Filter `UserChapter` queries: `where: { userId }`
3. Validate chapter ownership in bulk update via `userId_chapterId` unique constraint
4. No cross-student data access possible

---

## Testing Checklist

### Backend Tests
- [ ] GET /learning returns subject/exam completion %
- [ ] PATCH /learning/chapter/:id creates/updates UserChapter
- [ ] PATCH /learning/bulk updates only requested user's chapters
- [ ] Invalid status returns 400
- [ ] Non-existent chapter returns 404
- [ ] Duplicate chapter names across subjects handled

### Frontend Tests
- [ ] Search filters by chapter/subject/exam name
- [ ] Status filter shows correct chapters
- [ ] Bulk selection counts update correctly
- [ ] Bulk update applies status to all selected
- [ ] Summary cards show correct numbers
- [ ] Subject/exam completion % displayed (if implemented)

### Regression Tests
- [ ] Adaptive engine eligibility unchanged
- [ ] Pocket mode eligibility unchanged
- [ ] Teacher redirects to My Learning for unlearned chapters
- [ ] UserConceptStat (concept mastery) unaffected

---

## Deployment Notes

- **No database migrations required** — uses existing schema
- **No breaking changes** — API response adds fields, doesn't remove
- **Backward compatible** — frontend works with or without new summary fields
- **Feature flag not needed** — additive change only

---

## Files Modified

1. `backend/src/routes/learning.ts` — Added subject/exam completion % computation
2. `frontend/src/pages/MyLearningPage.tsx` — (Optional) Display subject/exam progress
3. `mapping_output/LEARNING_CHAPTER_TRACKER_AUDIT.md` — Audit documentation
4. `mapping_output/LEARNING_CHAPTER_TRACKER_IMPLEMENTATION.md` — This file
5. `mapping_output/LEARNING_CHAPTER_TRACKER_TEST_REPORT.md` — Test results (to be created)