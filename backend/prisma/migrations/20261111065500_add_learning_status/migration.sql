-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'LEARNED');

-- AlterTable
ALTER TABLE "user_chapters"
    ADD COLUMN "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing data: isLearned=true becomes status='LEARNED'
UPDATE "user_chapters" SET "status" = 'LEARNED' WHERE "is_learned" = true;

-- Make legacy columns nullable for backfill compatibility
ALTER TABLE "user_chapters"
    ALTER COLUMN "is_learned" DROP NOT NULL,
    ALTER COLUMN "learned_at" DROP NOT NULL;