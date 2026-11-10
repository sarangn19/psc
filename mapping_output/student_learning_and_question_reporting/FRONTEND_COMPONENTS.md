# Frontend Component Reference

## MyLearningPage.tsx

**Route:** `/my-learning`  
**Location:** `frontend/src/pages/MyLearningPage.tsx`

### Props: None (page component)

### State
- `exams` — Full hierarchy from API
- `searchQuery` — Debounced search string
- `statusFilter` — 'all' | 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED'
- `selectedChapters` — Set of chapter IDs for bulk actions
- `selectAll` — Boolean for header checkbox

### Key Functions
- `handleStatusClick(chapter, e)` — Cycles status: NOT_STARTED → IN_PROGRESS → LEARNED → NOT_STARTED
- `handleBulkUpdate(status)` — Calls PATCH `/api/learning/bulk`
- `toggleSelectAll()` — Select/deselect all visible chapters
- `toggleChapterSelection(chapterId)` — Toggle single chapter in bulk selection

### UI Structure
```
<PageContainer>
  <Header>My Learning + Summary Cards (4)</Header>
  <Toolbar>
    <SearchInput placeholder="Search chapters..." />
    <StatusFilterSelect />
  </Toolbar>
  <ChapterTree>
    {exams.map(exam => (
      <ExamCard>
        <ExamHeader>{exam.name}</ExamHeader>
        {exam.subjects.map(subject => (
          <SubjectCard>
            <SubjectHeader>{subject.name}</SubjectHeader>
            {subject.chapters.map(chapter => (
              <ChapterRow
                selected={selectedChapters.has(chapter.id)}
                onClick={handleStatusClick}
                onCheckboxChange={toggleChapterSelection}
              >
                <StatusBadge status={chapter.status} />
                <ChapterName>{chapter.name}</ChapterName>
                <QuestionCount>{chapter.questionCount}</QuestionCount>
              </ChapterRow>
            ))}
          </SubjectCard>
        ))}
      </ExamCard>
    ))}
  </ChapterTree>
  {selectedChapters.size > 0 && (
    <BulkActionBar>
      <Button onClick={() => handleBulkUpdate('NOT_STARTED')}>Mark Not Started</Button>
      <Button onClick={() => handleBulkUpdate('IN_PROGRESS')}>Mark In Progress</Button>
      <Button onClick={() => handleBulkUpdate('LEARNED')}>Mark Learned</Button>
      <Button onClick={clearSelection}>Clear Selection</Button>
    </BulkActionBar>
  )}
</PageContainer>
```

### Status Badge Colors
| Status | Background | Text | Icon |
|--------|------------|------|------|
| NOT_STARTED | #F3F4F8 | #6B7186 | Circle (outline) |
| IN_PROGRESS | #FFF6E3 | #855300 | Clock |
| LEARNED | #ECFDF5 | #047857 | CheckCircle |

---

## ReportIssueModal.tsx

**Location:** `frontend/src/components/ReportIssueModal.tsx`

### Props
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | boolean | Yes | Modal visibility |
| `onClose` | () => void | Yes | Close handler |
| `questionId` | string | Yes | Question being reported |
| `questionText` | string | Yes | Preview text for confirmation |
| `onSubmit` | (data) => Promise<void> | No | Optional override for submit |

### Form Fields
```typescript
interface ReportFormData {
  category: QuestionReportCategory;  // 11 options, required
  description: string;                // min 10 chars, required
  suggestedCorrection: string;        // optional
}
```

### Category Options (11)
1. INCORRECT_ANSWER — "Incorrect Answer"
2. INCORRECT_QUESTION — "Incorrect Question"
3. WRONG_OR_MISSING_OPTIONS — "Wrong/Missing Options"
4. DUPLICATE_QUESTION — "Duplicate Question"
5. TYPOGRAPHICAL_OR_GRAMMAR_ERROR — "Typo/Grammar"
6. CONFUSING_EXPLANATION — "Confusing Explanation"
7. OUTDATED_INFORMATION — "Outdated Info"
8. IRRELEVANT_QUESTION — "Irrelevant Question"
9. FORMATTING_OR_OCR_PROBLEM — "Formatting/OCR"
10. PROMOTIONAL_OR_UNWANTED_CONTENT — "Promotional"
11. OTHER — "Other"

### States
- `idle` — Form ready
- `submitting` — API call in progress, button disabled
- `success` — Toast shown, modal closes after 1.5s
- `error` — Toast shown, form re-enabled

### Usage Example
```tsx
import ReportIssueModal from '@/components/ReportIssueModal';

function QuestionCard({ question }) {
  const [modalOpen, setModalOpen] = useState(false);
  
  return (
    <>
      <button onClick={() => setModalOpen(true)}>Report Issue</button>
      <ReportIssueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        questionId={question.id}
        questionText={question.text}
      />
    </>
  );
}
```

### Integration Points (Current)
| Page | Component | Line | Trigger |
|------|-----------|------|---------|
| AdaptivePage | Question header | ~line 45 | Flag icon button |
| PocketPage | Question header | ~line 38 | Flag icon button |
| TeacherPage | PracticeQuestionCard | ~line 52 | Flag icon button |
| ChaptersPage | *Not yet integrated* | — | — |

---

## AdminReports.tsx

**Route:** `/admin/reports` (needs sidebar link)  
**Location:** `frontend/src/pages/admin/AdminReports.tsx`

### State
- `reports` — Report[] from API
- `stats` — Stats object from `/api/admin/reports/stats`
- `page`, `pageSize` — Pagination
- `filters` — All filter fields
- `selectedReport` — Report | null for detail modal
- `actionLoading` — reportId string during action

### Filter Fields
```typescript
interface Filters {
  status: '';
  aiStatus: '';
  severity: '';
  category: '';
  examId: '';
  subjectId: '';
  chapterId: '';
  dateFrom: '';
  dateTo: '';
  search: '';
}
```

### Table Columns
1. **Question** — Text (clamped 2 lines), exam/subject/chapter badges
2. **Student** — Name + email
3. **Category** — Label chip
4. **Status** — Badge (7 states)
5. **AI Status** — Badge (4 states)
6. **Severity** — Pill (4 levels)
7. **Confidence** — Percentage or —
8. **Reported** — Relative time (e.g., "2 hours ago")
9. **Actions** — View (always), Re-investigate (NEEDS_REVIEW only)

### Detail Modal Tabs
| Tab | Content |
|-----|---------|
| Overview | Report ID, category, status badges, severity, confidence, timestamps, exam/subject/chapter/concept, student name/email/ID |
| AI Investigation | AI status, classification, confidence, severity, requiresHumanReview, processedAt, error, summary, evidence, questionProblem, answerKeyProblem, explanationProblem, suggestedCorrection, recommendedAction |
| Question | Full text, options (correct highlighted), explanation, difficulty, tags, isActive, updatedAt, snapshotAt |
| Student Report | Category, description, suggestedCorrection, sessionContext (JSON) |

### Admin Actions (Footer)
| Button | Condition | Action | Notes |
|--------|-----------|--------|-------|
| Confirm Issue | status ≠ RESOLVED/DISMISSED | CONFIRM_ISSUE | Sets status=NEEDS_REVIEW |
| Reject Report | status ≠ RESOLVED/DISMISSED | REJECT_REPORT | Sets status=DISMISSED |
| Request Investigation | status ≠ RESOLVED/DISMISSED | REQUEST_FURTHER_INVESTIGATION | Sets aiRequiresHumanReview=true |
| Mark Resolved | status = RESOLVED | MARK_RESOLVED | Sets resolvedAt, resolutionNotes |
| Close | Always | — | Closes modal |

### Status Badge Colors (STATUS_COLORS)
| Status | Background | Text | Border |
|--------|------------|------|--------|
| SUBMITTED | #F3F4F8 | #6B7186 | #DADDE5 |
| ANALYZING | #FFF6E3 | #855300 | #E3A033 |
| AUTO_CONFIRMED | #E8EBFB | #2A3FC1 | #B9C2F2 |
| AUTO_REJECTED | #FBE8EC | #A3263D | #F3D5DB |
| NEEDS_REVIEW | #FEF3C7 | #855300 | #FDE68A |
| RESOLVED | #ECFDF5 | #047857 | #A7F3D0 |
| DISMISSED | #F3F4F8 | #6B7186 | #DADDE5 |

### AI Status Badge Colors (AI_STATUS_COLORS)
| AI Status | Background | Text | Border |
|-----------|------------|------|--------|
| SUBMITTED | #F3F4F8 | #6B7186 | #DADDE5 |
| ANALYZING | #FFF6E3 | #855300 | #E3A033 |
| AUTO_CONFIRMED | #E8EBFB | #2A3FC1 | #B9C2F2 |
| AUTO_REJECTED | #FBE8EC | #A3263D | #F3D5DB |
| NEEDS_REVIEW | #FEF3C7 | #855300 | #FDE68A |

### Severity Pill Colors (SEVERITY_COLORS)
| Severity | Background | Text |
|----------|------------|------|
| LOW | #ECFDF5 | #047857 |
| MEDIUM | #FFF6E3 | #855300 |
| HIGH | #FBE8EC | #A3263D |
| CRITICAL | #FEF2F2 | #B91C1C |

---

## Layout.tsx — Navigation Addition

**Location:** `frontend/src/components/Layout.tsx`

### Added Nav Item (after Pocket)
```tsx
<NavLink to="/my-learning" className="nav-item">
  <BookCheck className="w-5 h-5" />
  <span>My Learning</span>
</NavLink>
```

**Icon:** `BookCheck` from `lucide-react`

---

## App.tsx — Route Registration

**Location:** `frontend/src/App.tsx`

### Added Route
```tsx
import MyLearningPage from './pages/MyLearningPage';

<Route path="/my-learning" element={<MyLearningPage />} />
```

---

## Component Dependencies

```
ReportIssueModal
  ├── @radix-ui/react-dialog (via custom Dialog)
  ├── lucide-react (icons: X, AlertTriangle, CheckCircle, Loader2)
  └── api (axios instance)

MyLearningPage
  ├── api (axios instance)
  ├── lucide-react (icons: Search, Filter, ChevronDown, ChevronRight, CheckCircle2, Clock, Circle, CheckSquare, Square)
  └── date-fns (formatDistanceToNow)

AdminReports
  ├── api (axios instance)
  ├── lucide-react (icons: Search, X, Filter, ChevronLeft, ChevronRight, Eye, RefreshCw, CheckCircle2, XCircle, AlertTriangle, MoreHorizontal, Copy, Download, Upload, Settings, Trash2, Edit3, Flag, Shield, AlertCircle, Check, X, Loader2, ChevronDown, ChevronRight, Circle, Clock, BookOpen, User, Mail, Hash, Tag, AlertTriangle, CheckCircle2, XCircle, RotateCcw)
  ├── date-fns (formatDistanceToNow)
  └── StatusBadge, DetailSection, DetailRow, StatCard (internal)
```