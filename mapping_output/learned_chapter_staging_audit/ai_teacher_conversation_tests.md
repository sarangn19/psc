# AI Teacher Conversation Tests

- Scenario A (learned topic): User A topic switch to Imported Corpus → question delivered (q=cmw8z06q803za1269w19g9yuq).
- Scenario B (unlearned topic): User B topic switch → My Learning guidance with /my-learning.
- Scenario C (conceptual teaching): no learned chapters → no question generation; guidance returned.
- Scenario D (follow-up): handled by conversation path; no unwanted topic switch.
- Scenario E (ambiguous): unresolved → clarification/unavailable message.
- Scenario F (new subject): resolves and checks learned status.
- Scenario G (prompt injection): backend eligibility enforced; AI cannot override.
Status: PASS (staging smoke).
