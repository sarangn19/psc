export interface StoredChatLike {
  sessionId?: string;
  messages?: { kind?: string; questionId?: string; text?: string }[];
  question?: { id?: string } | null;
  [key: string]: any;
}

export function normalizeRestoredChat(stored: StoredChatLike): StoredChatLike {
  if (!stored || !stored.messages || !stored.question?.id) return stored;
  const questionId = stored.question.id;
  const hasHistorical = stored.messages.some(
    (m) => m.kind === 'question' && (m.questionId || m.text) === questionId,
  );
  if (hasHistorical) {
    return { ...stored, question: null };
  }
  return stored;
}
