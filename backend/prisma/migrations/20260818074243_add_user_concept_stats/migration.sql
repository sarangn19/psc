-- CreateTable
CREATE TABLE "user_concept_stats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" INTEGER,
    "chapterId" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_concept_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_concept_stats_userId_idx" ON "user_concept_stats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_concept_stats_userId_conceptId_chapterId_key" ON "user_concept_stats"("userId", "conceptId", "chapterId");

-- AddForeignKey
ALTER TABLE "user_concept_stats" ADD CONSTRAINT "user_concept_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
