-- Drop old table with wrong unique constraint and recreate cleanly
DROP TABLE IF EXISTS "user_concept_stats";

CREATE TABLE "user_concept_stats" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "conceptId" INTEGER,
    "chapterId" TEXT,
    "total"     INTEGER NOT NULL DEFAULT 0,
    "correct"   INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_concept_stats_pkey" PRIMARY KEY ("id")
);

-- Separate unique indexes so NULLs work correctly in PostgreSQL
CREATE UNIQUE INDEX "user_concept_stats_userId_conceptId_key"
    ON "user_concept_stats"("userId", "conceptId")
    WHERE "conceptId" IS NOT NULL;

CREATE UNIQUE INDEX "user_concept_stats_userId_chapterId_key"
    ON "user_concept_stats"("userId", "chapterId")
    WHERE "chapterId" IS NOT NULL;

CREATE INDEX "user_concept_stats_userId_idx"
    ON "user_concept_stats"("userId");

ALTER TABLE "user_concept_stats"
    ADD CONSTRAINT "user_concept_stats_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
