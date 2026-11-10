# Session Integrity Report

- Historical attempts, messages, adaptive items, pocket items are not modified by restriction changes.
- Status changes only affect future question selection.
- If current chapter becomes unlearned, active question returns null with `chapterNoLongerLearned`.
- Newly learned chapters become available after revalidation on next request.
- Session history preserved.
