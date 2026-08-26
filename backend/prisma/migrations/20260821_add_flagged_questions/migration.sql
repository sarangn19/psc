CREATE TABLE "flagged_questions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flagged_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flagged_questions_userId_questionId_key" ON "flagged_questions"("userId", "questionId");

ALTER TABLE "flagged_questions" ADD CONSTRAINT "flagged_questions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "flagged_questions" ADD CONSTRAINT "flagged_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
