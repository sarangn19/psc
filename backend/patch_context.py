p = r"C:\Users\saran\Documents\psc app\backend\src\routes\teacher.ts"
s = open(p, encoding='utf-8').read()
old = """  const isCasual = intent === 'GREETING' || intent === 'GENERAL_CONVERSATION';
  const lowerMessage = message.toLowerCase();
  const referencesCurrentQuestion = /\\b(this|that|it|the question|the problem|last step|previous|above|these|those)\\b/.test(lowerMessage);
  const isSelfContained = /^\\s*\\d+\\s*[\\+\\-\\*\\/]\\s*\\d+\\s*\\??\\s*$/.test(message) || !referencesCurrentQuestion;
  const isRecommendation = /which topic|what should i focus|what am i weak|where should i improve|study next/i.test(message);
  const contextQuestion = (isCasual || isSelfContained || isRecommendation) ? null : currentQuestion;
  const composed = composeConversationResponse(intent, message, (isCasual || isSelfContained || isRecommendation) ? null : currentQuestion?.text || null, (isCasual || isSelfContained || isRecommendation) ? null : currentQuestion?.explanation || null, (isCasual || isSelfContained || isRecommendation) ? null : currentQuestion?.concept?.nameEnglish || null);"""
new = """  const lowerMessage = message.toLowerCase();
  const replyTo = req.body?.replyTo;
  const hasExplicitTopicCorrection = /not about the question|in general|i mean in general|forget that|change the topic|leave the question|something else|talk about something else/i.test(lowerMessage);
  const isEmotionalSupport = /stressed|tired|exhausted|sad|anxious|overwhelmed|confused|not motivated|need someone to talk/i.test(lowerMessage) && !/this question|that question|the question/i.test(lowerMessage);
  const isPerformanceQuestion = /am i improving|how am i doing|my weak|my progress|how am i performing/i.test(lowerMessage);
  const isPracticeRequest = /another question|next question|test me|practice|give me a question/i.test(lowerMessage);
  const isExamPrep = /how should i prepare|how to prepare|study plan|what should i study/i.test(lowerMessage);
  const referencesCurrentQuestion = /\\b(this|that|it|the question|the problem|last step|previous|above|these|those)\\b/.test(lowerMessage);
  const isFollowUp = /\\b(why|how does that work|explain that again|another example|what happens if|did not understand|didn't understand)\\b/.test(lowerMessage) && referencesCurrentQuestion;
  let contextMode = 'GENERAL_ACADEMIC_HELP';
  if (replyTo) contextMode = 'EXPLICIT_REPLY_FOLLOWUP';
  else if (hasExplicitTopicCorrection) contextMode = 'GENERAL_CONVERSATION';
  else if (isEmotionalSupport) contextMode = 'EMOTIONAL_SUPPORT';
  else if (isPerformanceQuestion) contextMode = 'PERFORMANCE_RESPONSE';
  else if (isPracticeRequest) contextMode = 'START_PRACTICE';
  else if (isExamPrep) contextMode = 'EXAM_PREPARATION_GUIDANCE';
  else if (isFollowUp) contextMode = 'ACTIVE_QUESTION_HELP';
  else if (referencesCurrentQuestion) contextMode = 'ACTIVE_QUESTION_HELP';
  const contextQuestion = (contextMode === 'ACTIVE_QUESTION_HELP') ? currentQuestion : null;
  const composed = composeConversationResponse(intent, message, (contextQuestion ? currentQuestion?.text : null) || null, (contextQuestion ? currentQuestion?.explanation : null) || null, (contextQuestion ? currentQuestion?.concept?.nameEnglish : null) || null);"""
assert old in s, "old block not found"
s = s.replace(old, new)
# Also update the prompt building: only include currentQuestion if contextQuestion
s = s.replace(
"""    currentQuestion
      ? [
          `Current question: ${currentQuestion.text}`,
          `Options: ${normalizeOptions(currentQuestion.options).map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
          currentQuestion.explanation ? `Stored explanation: ${currentQuestion.explanation}` : 'Stored explanation unavailable.',
        ].join('\\n')
      : 'There is no active practice question.',""",
"""    contextQuestion
      ? [
          `Current question: ${contextQuestion.text}`,
          `Options: ${normalizeOptions(contextQuestion.options).map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
          contextQuestion.explanation ? `Stored explanation: ${contextQuestion.explanation}` : 'Stored explanation unavailable.',
        ].join('\\n')
      : 'There is no active practice question.',""")
open(p, 'w', encoding='utf-8').write(s)
print("patched")
