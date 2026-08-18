-- CreateIndex
CREATE INDEX "question_attempts_userId_idx" ON "question_attempts"("userId");

-- CreateIndex
CREATE INDEX "question_attempts_sessionId_idx" ON "question_attempts"("sessionId");

-- CreateIndex
CREATE INDEX "adaptive_items_sessionId_idx" ON "adaptive_items"("sessionId");
