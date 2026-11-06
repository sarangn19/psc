-- Add an explicit retry key for answer submissions.
ALTER TABLE "question_attempts" ADD COLUMN "submissionKey" TEXT;

-- New and retry submissions can carry a non-null key. PostgreSQL allows multiple
-- NULL rows, so historical NULL keys remain unaffected.
ALTER TABLE "question_attempts"
ADD CONSTRAINT "question_attempts_userId_submissionKey_key"
UNIQUE ("userId", "submissionKey");
