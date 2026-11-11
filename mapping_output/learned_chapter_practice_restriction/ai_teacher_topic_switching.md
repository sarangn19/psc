# AI Teacher Topic Switching

- Topic-change requests resolved via `resolveRequestedSubject`.
- If requested chapter not LEARNED: returns My Learning instruction with `/my-learning` link.
- If subject/concept has no learned chapters: same instruction.
- If already LEARNED: updates session focus and fetches question constrained to learned chapters.
- Unknown topics → clarification via unresolved response.
- Follow-up questions do not trigger topic switch (extractSubjectPhrase returns null for non-practice messages).
- Status changes during active session take effect on next selection.
