CREATE TYPE "LearningFeedbackType" AS ENUM ('TOO_HARD', 'TOO_EASY', 'CONFUSED', 'EXPLAIN_DIFFERENTLY', 'TIRED', 'NEED_BREAK', 'HINT_REQUESTED');
CREATE TYPE "LearningMemoryType" AS ENUM ('DIFFICULT_CONCEPT', 'REPEATED_MISTAKE', 'SUCCESSFUL_APPROACH', 'MASTERY_CHANGE', 'UNFINISHED_OBJECTIVE', 'STUDENT_FEEDBACK', 'REVISION_OUTCOME');

CREATE TABLE "learning_hints" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "questionId" TEXT NOT NULL,
  "conceptId" INTEGER,
  "hintCount" INTEGER NOT NULL DEFAULT 1,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "answeredCorrect" BOOLEAN,
  "eventKey" TEXT NOT NULL,
  CONSTRAINT "learning_hints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "questionId" TEXT,
  "conceptId" INTEGER,
  "type" "LearningFeedbackType" NOT NULL,
  "message" TEXT,
  "eventKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_learning_memory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conceptId" INTEGER,
  "type" "LearningMemoryType" NOT NULL,
  "key" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_learning_memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "concept_revisions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conceptId" INTEGER NOT NULL,
  "masterySnapshot" INTEGER,
  "intervalDays" INTEGER NOT NULL DEFAULT 1,
  "consecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "lastReviewedAt" TIMESTAMP(3),
  "lastResultCorrect" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concept_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_hints_userId_eventKey_key" ON "learning_hints"("userId", "eventKey");
CREATE INDEX "learning_hints_userId_conceptId_idx" ON "learning_hints"("userId", "conceptId");
CREATE INDEX "learning_hints_userId_questionId_idx" ON "learning_hints"("userId", "questionId");

CREATE UNIQUE INDEX "learning_feedback_userId_eventKey_key" ON "learning_feedback"("userId", "eventKey");
CREATE INDEX "learning_feedback_userId_conceptId_idx" ON "learning_feedback"("userId", "conceptId");

CREATE UNIQUE INDEX "student_learning_memory_userId_type_conceptId_key_key" ON "student_learning_memory"("userId", "type", "conceptId", "key");
CREATE INDEX "student_learning_memory_userId_occurredAt_idx" ON "student_learning_memory"("userId", "occurredAt");

CREATE UNIQUE INDEX "concept_revisions_userId_conceptId_key" ON "concept_revisions"("userId", "conceptId");
CREATE INDEX "concept_revisions_userId_dueAt_idx" ON "concept_revisions"("userId", "dueAt");

ALTER TABLE "learning_hints" ADD CONSTRAINT "learning_hints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_feedback" ADD CONSTRAINT "learning_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_learning_memory" ADD CONSTRAINT "student_learning_memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_revisions" ADD CONSTRAINT "concept_revisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
