# Known Gaps & Follow-up Work

## High Priority

### 1. ChaptersPage Integration
**File:** `frontend/src/pages/ChaptersPage.tsx`  
**Issue:** Chapter question list doesn't have Report Issue button; uses legacy endpoint `/exams/chapters/mark` for status updates.

**Required Changes:**
- Add ReportIssueModal import and integration to question display
- Migrate status update calls from `/exams/chapters/mark` to `/api/learning/:chapterId`
- Add My Learning status badges to chapter list items

**Estimated Effort:** 2-3 hours

### 2. Background Job Processing for AI Investigation
**Current:** `investigateQuestion(reportId)` runs as fire-and-forget `Promise` in `reports.ts:POST /`  
**Risk:** Process crashes, server restarts, or timeouts lose investigation work; no retry logic.

**Solution Options:**
| Option | Pros | Cons |
|--------|------|------|
| **Bull + Redis** | Durable, retry, priority, scheduling | Extra infrastructure |
| **pg-boss** | Uses existing Postgres, no extra deps | Less features |
| **Inngest** | Serverless-friendly, observability | External service |
| **Custom polling table** | Zero deps | Manual implementation |

**Recommended:** Bull + Redis (already used in codebase for other jobs)

**Implementation:**
```typescript
// backend/src/jobs/questionInvestigationJob.ts
import { Queue } from 'bull';
import { investigateQuestion } from '../services/questionInvestigation';

const investigationQueue = new Queue('question-investigation', {
  redis: { host: process.env.REDIS_HOST, port: 6379 }
});

investigationQueue.process(async (job) => {
  await investigateQuestion(job.data.reportId);
});

// In reports.ts POST /:
await investigationQueue.add('investigate', { reportId: report.id });
```

**Estimated Effort:** 4-6 hours (including Redis setup)

### 3. Rate Limiting on Report Submission
**Endpoint:** `POST /api/reports`  
**Current:** No rate limiting  
**Risk:** Spam reports, API abuse, Groq quota exhaustion

**Recommended Limits:**
- 10 reports/hour per user
- 50 reports/day per user
- Burst: 3 reports/minute

**Implementation:** Add rate limiter middleware (express-rate-limit or custom Redis-based)

**Estimated Effort:** 1-2 hours

---

## Medium Priority

### 4. Test Coverage
**Backend:**
- [ ] `questionInvestigation.test.ts` — deterministic checks, AI response parsing, confidence routing
- [ ] `learning.test.ts` — GET, PATCH single, PATCH bulk
- [ ] `reports.test.ts` — POST submit, GET list, validation
- [ ] `admin.reports.test.ts` — filters, pagination, actions, reinvestigate

**Frontend:**
- [ ] `MyLearningPage.test.tsx` — status cycling, bulk ops, search, filter
- [ ] `ReportIssueModal.test.tsx` — validation, submission flow, error states
- [ ] `AdminReports.test.tsx` — filter changes, pagination, modal tabs, actions

**Target:** >80% coverage on new code

**Estimated Effort:** 8-12 hours

### 5. AdminReports Sidebar Navigation
**File:** `frontend/src/components/admin/AdminSidebar.tsx` (or similar)  
**Issue:** `/admin/reports` route exists but not linked in admin navigation

**Required:** Add nav item "Question Reports" with flag/icon to admin sidebar

**Estimated Effort:** 30 minutes

### 6. Database Migration Verification
**Tasks:**
- [ ] Run `npx prisma migrate dev` in staging/local
- [ ] Verify all enums created correctly
- [ ] Verify UserChapter.status defaults to NOT_STARTED
- [ ] Verify QuestionReport AI fields nullable
- [ ] Run backfill script for existing UserChapter rows
- [ ] Test rollback migration

**Estimated Effort:** 1 hour

---

## Low Priority

### 7. ChaptersPage Legacy Endpoint Migration
**Endpoint:** `/exams/chapters/mark` (POST)  
**Replacement:** `/api/learning/:chapterId` (PATCH)  
**Action:** Deprecate old endpoint, update all callers

### 8. Admin Reports Export
**Feature:** CSV/Excel export of filtered reports  
**Use Case:** Content team triage, analytics

### 9. Question Report Deduplication
**Current:** Duplicate detection only in deterministic checks  
**Enhancement:** Show "Similar reports" in admin detail modal; auto-link duplicate reports

### 10. AI Investigation Improvements
- [ ] Add few-shot examples to Groq prompt
- [ ] Implement confidence calibration (Platt scaling)
- [ ] Add human feedback loop (admin corrections → fine-tune prompt)
- [ ] Support image analysis for OCR/formatting issues

### 11. Real-time Updates
- [ ] WebSocket/SSE for admin dashboard live updates
- [ ] My Learning status sync across tabs

### 12. Accessibility Audit
- [ ] MyLearningPage — keyboard nav, ARIA, color contrast
- [ ] ReportIssueModal — focus trap, screen reader labels
- [ ] AdminReports — table headers, sort indicators, modal focus

---

## Technical Debt

| Item | Location | Description |
|------|----------|-------------|
| TypeScript `any` usage | `reports.ts`, `admin.ts` | Replace with proper types |
| Error handling consistency | All routes | Standardize error response format |
| API versioning | None | Add `/v1/` prefix for future compatibility |
| Request validation | `reports.ts` | Add Zod/Joi schemas |
| Logging | All services | Structured logging (pino/winston) |

---

## Deployment Checklist

### Pre-deploy
- [ ] Run migration: `npx prisma migrate deploy`
- [ ] Set `GROQ_API_KEY` in production env
- [ ] Verify Redis available (for job queue)
- [ ] Run build: `npm run build` (passes)
- [ ] Run tests: `npm test` (when added)

### Post-deploy
- [ ] Verify My Learning page loads
- [ ] Submit test report → check AI investigation runs
- [ ] Verify admin dashboard shows reports
- [ ] Test all admin actions
- [ ] Monitor Groq API usage/costs

### Rollback Plan
- [ ] Revert migration: `npx prisma migrate resolve --rolled-back <migration_name>`
- [ ] Revert code deploy
- [ ] Verify existing features unaffected

---

## Effort Summary

| Priority | Items | Est. Hours |
|----------|-------|------------|
| High | 3 | 7-11 |
| Medium | 3 | 9-15 |
| Low | 6 | 12-20 |
| **Total** | **12** | **28-46** |

---

## Dependencies

```
Background Jobs (Bull/Redis)
    ↓
Rate Limiting (Redis)
    ↓
Tests (depend on stable APIs)
    ↓
Admin Sidebar (independent)
    ↓
Export/Dedup/A11y (independent)
```