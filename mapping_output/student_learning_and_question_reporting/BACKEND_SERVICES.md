# Database Migration & Backend Services

## Prisma Migration

### Migration Command
```bash
cd backend
npx prisma migrate dev --name student_learning_question_reporting
```

### Generated SQL (Expected)
```sql
-- Create enums
CREATE TYPE "LearningStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'LEARNED');
CREATE TYPE "QuestionReportStatus" AS ENUM ('SUBMITTED', 'ANALYZING', 'AUTO_CONFIRMED', 'AUTO_REJECTED', 'NEEDS_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TYPE "QuestionReportCategory" AS ENUM ('INCORRECT_ANSWER', 'INCORRECT_QUESTION', 'WRONG_OR_MISSING_OPTIONS', 'DUPLICATE_QUESTION', 'TYPOGRAPHICAL_OR_GRAMMAR_ERROR', 'CONFUSING_EXPLANATION', 'OUTDATED_INFORMATION', 'IRRELEVANT_QUESTION', 'FORMATTING_OR_OCR_PROBLEM', 'PROMOTIONAL_OR_UNWANTED_CONTENT', 'OTHER');
CREATE TYPE "AISeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Add column to UserChapter
ALTER TABLE "UserChapter" ADD COLUMN "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- Add columns to QuestionReport
ALTER TABLE "QuestionReport" ADD COLUMN "aiStatus" "QuestionReportStatus" NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE "QuestionReport" ADD COLUMN "aiClassification" "QuestionReportCategory";
ALTER TABLE "QuestionReport" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "QuestionReport" ADD COLUMN "aiSeverity" "AISeverity";
ALTER TABLE "QuestionReport" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiEvidence" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiQuestionProblem" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiAnswerKeyProblem" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiExplanationProblem" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiSuggestedCorrection" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiRequiresHumanReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuestionReport" ADD COLUMN "aiRecommendedAction" TEXT;
ALTER TABLE "QuestionReport" ADD COLUMN "aiProcessedAt" TIMESTAMP(3);
ALTER TABLE "QuestionReport" ADD COLUMN "aiError" TEXT;

-- Indexes for common queries
CREATE INDEX "QuestionReport_userId_idx" ON "QuestionReport"("userId");
CREATE INDEX "QuestionReport_questionId_idx" ON "QuestionReport"("questionId");
CREATE INDEX "QuestionReport_status_idx" ON "QuestionReport"("status");
CREATE INDEX "QuestionReport_aiStatus_idx" ON "QuestionReport"("aiStatus");
CREATE INDEX "QuestionReport_createdAt_idx" ON "QuestionReport"("createdAt");
CREATE INDEX "UserChapter_userId_status_idx" ON "UserChapter"("userId", "status");
```

### Backfill Script (Run After Migration)
```typescript
// backend/prisma/backfill-learning-status.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // All existing UserChapter rows get NOT_STARTED (default handles this)
  // But if any NULLs exist:
  const updated = await prisma.userChapter.updateMany({
    where: { status: null },
    data: { status: 'NOT_STARTED' }
  });
  console.log(`Backfilled ${updated.count} UserChapter rows to NOT_STARTED`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Run: `npx ts-node backend/prisma/backfill-learning-status.ts`

---

## Backend Service: questionInvestigation.ts

**Location:** `backend/src/services/questionInvestigation.ts`

### Exported Functions

#### `runDeterministicChecks(question, report)`
Runs fast pattern-based checks before AI.

**Returns:**
```typescript
{
  flagged: boolean;
  category?: QuestionReportCategory;
  reason?: string;
}
```

**Checks (in order):**
1. **Promotional content** — Regex for URLs, contact info, promotional keywords
2. **Malformed question** — Missing text, options, correct answer
3. **OCR artifacts** — Replacement chars, repeated delimiters
4. **Duplicate detection** — Exact text match in same chapter (excludes current question)

#### `runAIInvestigation(question, report, snapshot)`
Calls Groq API with structured prompt.

**Returns:**
```typescript
{
  classification: QuestionReportCategory;
  confidence: number;        // 0-1
  severity: AISeverity;
  summary: string;
  evidence: string;
  questionProblem: string;
  answerKeyProblem: string;
  explanationProblem: string;
  suggestedCorrection: string;
  recommendedAction: string;
  requiresHumanReview: boolean;
}
```

**Groq Configuration:**
```typescript
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const completion = await groq.chat.completions.create({
  model: 'openai/gpt-oss-20b',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT }
  ],
  temperature: 0.1,
  max_tokens: 2000,
  response_format: { type: 'json_object' }
});
```

#### `investigateQuestion(reportId)`
Main orchestration function (called async after report submission).

**Flow:**
```
1. Fetch report + question + snapshot
2. Run deterministic checks
   ├─ If flagged → set aiStatus = AUTO_CONFIRMED, aiClassification = flagged category
   └─ If not flagged → proceed to AI
3. Run AI investigation
4. Determine aiStatus from confidence:
   ├─ confidence >= 0.90 → AUTO_CONFIRMED / AUTO_REJECTED
   ├─ confidence >= 0.70 → NEEDS_REVIEW (requiresHumanReview = true)
   └─ confidence < 0.70 → NEEDS_REVIEW (requiresHumanReview = true)
5. Update QuestionReport with all AI fields
6. If AUTO_CONFIRMED → also update QuestionReport.status = NEEDS_REVIEW
```

**Error Handling:**
- Groq API failure → aiStatus = SUBMITTED, aiError = error message
- JSON parse failure → aiStatus = SUBMITTED, aiError = "Invalid AI response"
- Database error → logged, report remains in SUBMITTED

---

## API Route Details

### learning.ts
**Location:** `backend/src/routes/learning.ts`

#### GET `/`
```typescript
// 1. Get all chapters with question counts
// 2. Get user's UserChapter statuses
// 3. Merge: chapter.status = userChapter?.status || NOT_STARTED
// 4. Group by exam → subject
// 5. Compute summary counts
```

#### PATCH `/:chapterId`
```typescript
// 1. Validate status enum
// 2. Upsert UserChapter { userId, chapterId, status }
// 3. Return updated status
```

#### PATCH `/bulk`
```typescript
// 1. Validate array of { chapterId, status }
// 2. Transaction: upsert each UserChapter
// 3. Return { updated: count }
```

### reports.ts
**Location:** `backend/src/routes/reports.ts`

#### POST `/`
```typescript
// 1. Validate body (category enum, description min 10 chars)
// 2. Verify question exists and is active
// 3. Create QuestionReport with snapshot (question text, options, correctOption, explanation, difficulty, tags, isActive, updatedAt)
// 4. Set status = SUBMITTED, aiStatus = SUBMITTED
// 5. Return report ID
// 6. FIRE_AND_FORGET: investigateQuestion(reportId) — no await
```

#### GET `/`
```typescript
// 1. Paginate user's reports (default page=1, pageSize=20)
// 2. Include question + chapter + subject + exam + concept
// 3. Return { items, total, page, pageSize }
```

### admin.ts (Report Endpoints)
**Location:** `backend/src/routes/admin.ts`

#### GET `/reports`
```typescript
// 1. Build where clause from query params
// 2. Apply pagination
// 3. Include user + question + chapter + subject + exam + concept
// 4. Return { items, total, page, pageSize }
```

#### GET `/reports/stats`
```typescript
// 1. Aggregate counts by status, aiStatus, category, severity
// 2. Top 10 reported questions with counts
// 3. Return stats object
```

#### GET `/reports/:reportId`
```typescript
// 1. Find by ID with all relations
// 2. Return full report object
```

#### PATCH `/reports/:reportId/action`
```typescript
// 1. Validate action enum
// 2. Map action → status/aiStatus updates
// 3. If CONFIRM_ISSUE: status = NEEDS_REVIEW
// 4. If REJECT_REPORT: status = DISMISSED
// 5. If REQUEST_FURTHER_INVESTIGATION: aiRequiresHumanReview = true, status = NEEDS_REVIEW
// 6. If MARK_RESOLVED: status = RESOLVED, resolvedAt = now, resolutionNotes = notes
// 7. If DISMISS: status = DISMISSED
// 8. Return updated report
```

#### POST `/reports/:reportId/reinvestigate`
```typescript
// 1. Find report
// 2. Reset aiStatus = ANALYZING, clear AI fields
// 3. FIRE_AND_FORGET: investigateQuestion(reportId)
// 4. Return { message: 'Re-investigation started' }
```

---

## Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection (Supabase) |
| `DIRECT_URL` | Yes | Direct connection for migrations |
| `GROQ_API_KEY` | Yes | Groq API key for AI investigation |
| `JWT_SECRET` | Yes | Token signing |
| `NODE_ENV` | No | development/production |

---

## Performance Considerations

| Area | Current Approach | Optimization Needed |
|------|------------------|---------------------|
| AI Investigation | Fire-and-forget async | Move to job queue (Bull/Redis) |
| Report Listing | Offset pagination | Keyset pagination for large datasets |
| My Learning GET | Single query with merges | Consider materialized view |
| Duplicate Detection | Exact text match | Fuzzy matching (trigram/pg_trgm) |

---

## Testing Checklist

### Unit Tests
- [ ] `runDeterministicChecks` — promotional, malformed, OCR, duplicate
- [ ] `runAIInvestigation` — mock Groq response parsing
- [ ] `investigateQuestion` — full flow with mocked dependencies
- [ ] Confidence routing logic

### Integration Tests
- [ ] POST `/api/reports` — validation, creation, async investigation trigger
- [ ] GET `/api/reports` — pagination, filtering
- [ ] PATCH `/api/learning/:chapterId` — upsert, status enum validation
- [ ] PATCH `/api/learning/bulk` — transaction rollback on error
- [ ] Admin GET `/api/admin/reports` — filters, pagination
- [ ] Admin PATCH `/api/admin/reports/:reportId/action` — all 5 actions
- [ ] Admin POST `/api/admin/reports/:reportId/reinvestigate`

### Frontend Tests
- [ ] MyLearningPage — status cycling, bulk selection, search, filter
- [ ] ReportIssueModal — validation, submission, error states
- [ ] AdminReports — filter changes, pagination, detail modal tabs, actions