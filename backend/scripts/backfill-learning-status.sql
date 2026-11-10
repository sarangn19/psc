-- Backfill LearningStatus from legacy isLearned column.
-- Safe to run multiple times.
UPDATE user_chapters
SET status = CASE WHEN "isLearned" IS TRUE THEN 'LEARNED' ELSE 'NOT_STARTED' END
WHERE status IS NULL OR status = 'NOT_STARTED' AND "isLearned" IS TRUE;

-- Backfill question_reports legacy rows (if any) to OTHER category.
UPDATE question_reports
SET category = 'OTHER'
WHERE category IS NULL;
