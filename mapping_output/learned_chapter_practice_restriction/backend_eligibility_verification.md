# Backend Eligibility Verification

- Central service uses persisted `UserChapter` status, authenticated user ID only.
- No student-supplied ID accepted.
- Hierarchy filters (exam/subject) applied in service.
- Learned chapters revalidated on every request (no caching).
- Empty learned list blocks all delivery (no fallback).
- Safety filter (`questionSafety`) remains separate and mandatory.
