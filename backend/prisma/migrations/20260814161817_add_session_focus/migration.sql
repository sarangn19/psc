-- AlterTable
ALTER TABLE "adaptive_sessions" ADD COLUMN     "focusConceptId" INTEGER;

-- CreateIndex
CREATE INDEX "adaptive_sessions_focusConceptId_idx" ON "adaptive_sessions"("focusConceptId");
