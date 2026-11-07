# Question Bank Semantic Duplication (Separate Investigation)

Two distinct question IDs with semantically equivalent content were observed in practice.

Example:
- Question A: "A pipe fills a tank at 40 litres per minute. If the tank is filled in 15 minutes, what is its capacity?"
- Question B: "A pipe can fill a tank in 10 hours. What part of the tank will it fill in 3 hours?"

Both involve pipe-filling capacity/rate. This is a content-quality issue, not a frontend rendering defect.

Recommendation: run a separate question-bank deduplication audit comparing question text, options, answers, and concept IDs. Do not modify adaptive learning or question selection in the stability branch.
