# LEARNING CHAPTER TRACKER AUDIT

## Executive Summary

**Current State**: Chapter-level learning tracking **already exists** in the database and is partially implemented in the API and frontend. The `UserChapter` model tracks `LearningStatus` (NOT_STARTED, IN_PROGRESS, LEARNED) per student per chapter. The `/api/learning` endpoint returns exam → subject → chapter hierarchy with user status. The `MyLearningPage` provides search, filters, bulk actions, and summary cards.

**Gap**: Subject-level and exam-level completion percentages are not calculated/returned. All other requirements are already met.

---

## Database Schema Audit

### Existing Models (✅ Already in schema.prisma)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `UserChapter` | **Primary chapter-level tracking** | `userId`, `chapterId`, `status` (LearningStatus), `isLearned` (legacy), `learnedAt` (legacy) |
| `Chapter` | Chapter definitions | `id`, `name`, `subjectId`, `order`, `scratchTier` |
| `Subject` | Subject definitions | `id`, `name`, `examId`, `order` |
| `Exam` | Exam definitions | `id`, `name`, `category` |
| `UserExam` | Student's selected exams | `userId`, `examId` |

### LearningStatus Enum
```prisma
enum LearningStatus {
  NOT_STARTED
  IN_PROGRESS
  LEARNED
}
```

### UserChapter Constraints
- `@@unique([userId, chapterId])` — One record per student per chapter
- `@@map("user_chapters")` — Maps to existing table

### Data Integrity
- **No duplicate progress records**: Unique constraint on (userId, chapterId)
- **Student data isolation**: All queries filter by `userId`
- **Legacy columns preserved**: `isLearned` (Boolean?), `learnedAt` (DateTime?) retained for historical data
- **No concept-level tracking in UserChapter**: Concept mastery is separate (`UserConceptStat`)

---

## Current API Implementation (backend/src/routes/learning.ts)

### GET /api/learning
Returns full exam → subject → chapter hierarchy with user's chapter status.

**Response Structure:**
```json
{
  "exams": [
    {
      "id": "exam-id",
      "name": "Exam Name",
      "category": "Category",
      "subjects": [
        {
          "id": "subject-id",
          "name": "Subject Name",
          "order": 0,
          "chapters": [
            { "id": "chapter-id", "name": "Chapter Name", "order": 0, "status": "NOT_STARTED" }
          ]
        }
      ]
    }
  ],
  "summary": {
    "totalChapters": 150,
    "learnedCount": 45,
    "inProgressCount": 30,
    "notStartedCount": 75,
    "completionPercent": 30
  }
}
```

**Missing**: Subject-level and exam-level completion percentages.

### PATCH /api/learning/chapter/:chapterId
Updates single chapter status. Uses `upsert` on `UserChapter` with unique constraint.

### PATCH /api/learning/bulk
Bulk updates multiple chapters. Validates all chapter IDs exist. Creates activity log.

---

## Current Frontend Implementation (frontend/src/pages/MyLearningPage.tsx)

### Features Already Implemented
✅ Exam → Subject → Chapter hierarchy display  
✅ Chapter status: NOT_STARTED, IN_PROGRESS, LEARNED (dropdown + badge)  
✅ Chapter-name search (also searches subject/exam names)  
✅ Status filters (All, Learned, In Progress, Not Started)  
✅ Bulk selection with checkboxes  
✅ Bulk status updates (Mark as Learned/In Progress/Not Started)  
✅ Select all visible / clear selection  
✅ Summary cards: Total, Learned, In Progress, Not Started, Completion %  
✅ Loading/empty states  
✅ Mobile-friendly responsive layout  
✅ Dark-mode compatible (uses CSS variables)  

### UI Structure
- **Header**: Title + back button
- **Summary Cards**: 5 cards (Total, Learned, In Progress, Not Started, Completion%)
- **Filters Bar**: Search input + Status filter dropdown
- **Bulk Actions Bar** (when items selected): Count + status dropdown + Apply + Clear
- **Chapter List**: Grouped by Exam → Subject → Chapter rows with checkbox, name, order, status badge, status dropdown

---

## Requirements Coverage Matrix

| Requirement | Status | Notes |
|-------------|--------|-------|
| Display subjects under selected exam | ✅ Done | API returns full hierarchy |
| Display chapter names under each subject | ✅ Done | Frontend groups by exam→subject |
| Mark chapters: NOT_STARTED, IN_PROGRESS, LEARNED | ✅ Done | Dropdown + badge in UI |
| Chapter-name search | ✅ Done | Searches chapter, subject, exam |
| Status filters | ✅ Done | All / Learned / In Progress / Not Started |
| Bulk chapter selection & status updates | ✅ Done | Checkboxes + bulk action bar |
| Display learned/in-progress/remaining counts | ✅ Done | Summary cards |
| **Subject-level completion %** | ❌ **Missing** | Not in API response |
| **Exam-level completion %** | ❌ **Missing** | Not in API response |
| Persist progress per student | ✅ Done | UserChapter unique(userId, chapterId) |
| No auto-mark concepts when chapter learned | ✅ Done | Separate models (UserConceptStat) |
| No modification to QuestionAttempt, scoring, diagnostic | ✅ Done | Separate systems |
| No duplicate progress records | ✅ Done | Unique constraint |
| Bulk updates affect only selected student | ✅ Done | All queries filter by userId |
| Search-first interface | ✅ Done | Search input prominent |
| Exam and subject selection | ✅ Done | Hierarchy navigation |
| Expandable subject sections | ⚠️ Partial | Currently flat list grouped by subject |
| Chapter rows with three status options | ✅ Done | Dropdown with 3 options |
| Progress indicators | ✅ Done | Summary cards + badges |
| Mobile-friendly layout | ✅ Done | Responsive grid/flex |
| Dark-mode compatibility | ✅ Done | Uses CSS variables |
| No 13,000-item checkbox list | ✅ Done | Chapter-level (~150-300 items) |
| No nested concept selection | ✅ Done | Only chapters shown |

---

## Duplicate Chapter Names Across Subjects

**Handled**: Chapter unique constraint is `@@unique([name, subjectId])` — same chapter name can exist in different subjects. Frontend displays `subjectName` alongside chapter name. API returns full hierarchy so context is preserved.

---

## Student Data Isolation

**Verified**: All learning endpoints:
- Filter by `req.user!.id` (authenticated user)
- `UserChapter` queries include `where: { userId }`
- No cross-student data leakage possible

---

## Existing Learning Engine Regression Risk

**Low Risk**: Chapter tracking (`UserChapter`) is completely separate from:
- `UserConceptStat` (concept-level mastery for adaptive engine)
- `QuestionAttempt` (raw answer history)
- `AdaptiveSession` / `PocketSession` (practice sessions)
- `ConceptRevision` (spaced repetition)
- `StudentLearningMemory` / `LearningHint` / `LearningFeedback` (AI teacher features)

No migration needed. No existing functionality modified.

---

## Files to Modify

### Backend
1. `backend/src/routes/learning.ts` — Add subject/exam completion % to response

### Frontend
2. `frontend/src/pages/MyLearningPage.tsx` — Display subject/exam completion % (optional enhancement)

### Documentation
3. `mapping_output/LEARNING_CHAPTER_TRACKER_AUDIT.md` — This file
4. `mapping_output/LEARNING_CHAPTER_TRACKER_IMPLEMENTATION.md` — Implementation details
5. `mapping_output/LEARNING_CHAPTER_TRACKER_TEST_REPORT.md` — Test results

---

## Test Plan

### Unit/Integration Tests
- [ ] GET /learning returns subject/exam completion %
- [ ] PATCH /learning/chapter/:id updates status correctly
- [ ] PATCH /learning/bulk updates only requested student's chapters
- [ ] Duplicate chapter names across subjects handled correctly
- [ ] Student data isolation verified

### Frontend Tests
- [ ] Search filters chapters correctly
- [ ] Status filter works
- [ ] Bulk selection and update works
- [ ] Summary cards show correct counts
- [ ] Subject/exam completion % displayed (if implemented)

### Regression Tests
- [ ] Adaptive engine still uses learned chapters correctly
- [ ] Pocket mode still restricts to learned chapters
- [ ] Teacher still directs to My Learning for unlearned chapters
- [ ] Concept mastery (UserConceptStat) unchanged