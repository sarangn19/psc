# API Contracts — Student Learning & Question Reporting

## My Learning API

### GET `/api/learning`
**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "exams": [
    {
      "id": "string",
      "name": "string",
      "subjects": [
        {
          "id": "string",
          "name": "string",
          "chapters": [
            {
              "id": "string",
              "name": "string",
              "status": "NOT_STARTED" | "IN_PROGRESS" | "LEARNED",
              "questionCount": "number"
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "notStarted": "number",
    "inProgress": "number",
    "learned": "number",
    "total": "number"
  }
}
```

### PATCH `/api/learning/:chapterId`
**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{ "status": "IN_PROGRESS" }
```

**Response 200:**
```json
{ "chapterId": "string", "status": "IN_PROGRESS" }
```

### PATCH `/api/learning/bulk`
**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{ "updates": [{ "chapterId": "string", "status": "LEARNED" }] }
```

**Response 200:**
```json
{ "updated": "number" }
```

---

## Report Issue API

### POST `/api/reports`
**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "questionId": "string",
  "category": "INCORRECT_ANSWER" | "INCORRECT_QUESTION" | "WRONG_OR_MISSING_OPTIONS" | "DUPLICATE_QUESTION" | "TYPOGRAPHICAL_OR_GRAMMAR_ERROR" | "CONFUSING_EXPLANATION" | "OUTDATED_INFORMATION" | "IRRELEVANT_QUESTION" | "FORMATTING_OR_OCR_PROBLEM" | "PROMOTIONAL_OR_UNWANTED_CONTENT" | "OTHER",
  "description": "string (min 10 chars)",
  "suggestedCorrection": "string (optional)",
  "sessionContext": "object (optional)"
}
```

**Response 201:**
```json
{
  "id": "string",
  "status": "SUBMITTED",
  "aiStatus": "SUBMITTED",
  "message": "Report submitted. AI investigation started."
}
```

### GET `/api/reports`
**Headers:** `Authorization: Bearer <token>`

**Query params:** `page`, `pageSize`

**Response 200:**
```json
{
  "items": [
    {
      "id": "string",
      "questionId": "string",
      "category": "string",
      "status": "string",
      "aiStatus": "string",
      "aiClassification": "string | null",
      "aiConfidence": "number | null",
      "aiSeverity": "string | null",
      "createdAt": "ISO8601",
      "question": { "id": "string", "text": "string", "chapter": { "name": "string" } }
    }
  ],
  "total": "number",
  "page": "number",
  "pageSize": "number"
}
```

---

## Admin Reports API

### GET `/api/admin/reports`
**Headers:** `Authorization: Bearer <admin-token>`

**Query params:**
- `page` (default: 1)
- `pageSize` (default: 25)
- `status` — SUBMITTED, ANALYZING, NEEDS_REVIEW, RESOLVED, DISMISSED
- `aiStatus` — AUTO_CONFIRMED, AUTO_REJECTED, NEEDS_REVIEW
- `severity` — LOW, MEDIUM, HIGH, CRITICAL
- `category` — any of 11 categories
- `dateFrom` — ISO8601 date
- `dateTo` — ISO8601 date
- `search` — searches question text, student name, email

**Response 200:**
```json
{
  "items": [
    {
      "id": "string",
      "userId": "string",
      "questionId": "string",
      "category": "string",
      "description": "string | null",
      "suggestedCorrection": "string | null",
      "questionSnapshot": "object",
      "sessionContext": "object | null",
      "status": "string",
      "aiStatus": "string",
      "aiClassification": "string | null",
      "aiConfidence": "number | null",
      "aiSeverity": "string | null",
      "aiSummary": "string | null",
      "aiEvidence": "string | null",
      "aiQuestionProblem": "string | null",
      "aiAnswerKeyProblem": "string | null",
      "aiExplanationProblem": "string | null",
      "aiSuggestedCorrection": "string | null",
      "aiRequiresHumanReview": "boolean",
      "aiRecommendedAction": "string | null",
      "aiProcessedAt": "ISO8601 | null",
      "aiError": "string | null",
      "resolvedAt": "ISO8601 | null",
      "resolutionNotes": "string | null",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "user": { "id": "string", "name": "string", "email": "string" },
      "question": { "id": "string", "text": "string", "chapter": { "id": "string", "name": "string", "subject": { "id": "string", "name": "string", "exam": { "id": "string", "name": "string" } } }, "concept": { "id": "number", "nameEnglish": "string" } | null }
    }
  ],
  "total": "number",
  "page": "number",
  "pageSize": "number"
}
```

### GET `/api/admin/reports/stats`
**Headers:** `Authorization: Bearer <admin-token>`

**Response 200:**
```json
{
  "total": "number",
  "byStatus": [{ "status": "string", "count": "number" }],
  "byAiStatus": [{ "aiStatus": "string", "count": "number" }],
  "byCategory": [{ "category": "string", "count": "number" }],
  "bySeverity": [{ "severity": "string", "count": "number" }],
  "topReportedQuestions": [
    {
      "questionId": "string",
      "reportCount": "number",
      "text": "string",
      "chapter": { "id": "string", "name": "string", "subject": { "id": "string", "name": "string", "exam": { "id": "string", "name": "string" } } }
    }
  ]
}
```

### GET `/api/admin/reports/:reportId`
**Headers:** `Authorization: Bearer <admin-token>`

**Response 200:** Full report object (same shape as list item)

### PATCH `/api/admin/reports/:reportId/action`
**Headers:** `Authorization: Bearer <admin-token>`, `Content-Type: application/json`

**Body:**
```json
{
  "action": "CONFIRM_ISSUE" | "REJECT_REPORT" | "REQUEST_FURTHER_INVESTIGATION" | "MARK_RESOLVED" | "DISMISS",
  "notes": "string (optional)"
}
```

**Action → Status mapping:**
| Action | New Status | Notes |
|--------|------------|-------|
| CONFIRM_ISSUE | NEEDS_REVIEW | Question flagged for content team |
| REJECT_REPORT | DISMISSED | Report closed, no issue found |
| REQUEST_FURTHER_INVESTIGATION | NEEDS_REVIEW | aiRequiresHumanReview = true |
| MARK_RESOLVED | RESOLVED | resolvedAt set, resolutionNotes saved |
| DISMISS | DISMISSED | Report closed |

**Response 200:**
```json
{ "id": "string", "status": "string", "aiStatus": "string" }
```

### POST `/api/admin/reports/:reportId/reinvestigate`
**Headers:** `Authorization: Bearer <admin-token>`

**Response 200:**
```json
{ "id": "string", "aiStatus": "ANALYZING", "message": "Re-investigation started" }
```

---

## AI Investigation Response Schema (Internal)

```json
{
  "classification": "INCORRECT_ANSWER",
  "confidence": 0.92,
  "severity": "HIGH",
  "summary": "The answer key marks option B as correct, but the explanation and standard references support option C.",
  "evidence": "Question asks for capital of Kerala. Option B: Kochi. Option C: Thiruvananthapuram. Official Kerala government sources confirm Thiruvananthapuram.",
  "questionProblem": "None",
  "answerKeyProblem": "Answer key incorrectly marks Kochi (B) as correct. Correct answer is Thiruvananthapuram (C).",
  "explanationProblem": "Explanation references Kerala's commercial capital but question asks for administrative capital.",
  "suggestedCorrection": "Update answer key to option C (Thiruvananthapuram). Update explanation to reference administrative capital.",
  "recommendedAction": "Confirm issue and assign to content team for answer key correction.",
  "requiresHumanReview": false
}
```

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Missing/invalid fields |
| 401 | UNAUTHORIZED | Invalid or missing token |
| 403 | FORBIDDEN | Non-admin accessing admin endpoints |
| 404 | NOT_FOUND | Report/chapter not found |
| 429 | RATE_LIMITED | *Not yet implemented* |
| 500 | INTERNAL_ERROR | Server error |
| 503 | AI_UNAVAILABLE | Groq API failure |