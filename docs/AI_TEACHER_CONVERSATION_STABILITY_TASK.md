# Engineering Task: Cognix AI Teacher Conversation Stability

## Objective
Resolve all outstanding AI Teacher conversation stability issues before the next production release.

## Scope
P0: duplicate question cards, answered questions disappearing/reappearing, incorrect ordering, stale async responses.
P1: greeting/free-text intent, typing indicator lifecycle, conversation restoration, duplicate intro messages.

## Protected functionality
No changes to scoring, idempotency, adaptive learning, learning memory, revision scheduling, database schema, authentication.

## Subtasks
1. Conversation state and rendering audit.
2. Question lifecycle correction.
3. Message orchestration and intent handling.
4. Loading states and async synchronization.
5. Conversation restoration.
6. Automated and browser regression testing.

## Acceptance criteria
- Automated regression tests pass.
- Frontend/backend TypeScript checks pass.
- Desktop/mobile browser verification passes.
- No duplicate question IDs in rendered conversations.
- No loss of historical answers/explanations.
- Explicit approval before production deployment.

## Release policy
Stability release only. No feature expansion until complete.
