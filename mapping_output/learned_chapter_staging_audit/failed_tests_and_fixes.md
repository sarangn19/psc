# Failed Tests and Fixes

During staging audit, found non-enforced paths in no-session conversation flow and adjacent concept selection. Fixed:
- Filtered allQuestionIds/availableRows by learned chapters.
- Filtered findAdjacentQuestionIds candidates by learned chapters.
- Active question returns null when chapter no longer learned.
- Pocket/adaptive fallbacks removed (already).

No other bypasses found.
Status: FIXED.
