import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getSafetyRecordSync, QuestionSafetyStatus } from '../lib/questionSafety';
import { normalizeOptions } from '../lib/options';

const router = Router();

const REPORT_CATEGORIES = [
  'INCORRECT_ANSWER',
  'INCORRECT_QUESTION',
  'WRONG_OR_MISSING_OPTIONS',
  'DUPLICATE_QUESTION',
  'TYPOGRAPHICAL_OR_GRAMMAR_ERROR',
  'CONFUSING_EXPLANATION',
  'OUTDATED_INFORMATION',
  'IRRELEVANT_QUESTION',
  'FORMATTING_OR_OCR_PROBLEM',
  'PROMOTIONAL_OR_UNWANTED_CONTENT',
  'OTHER',
] as const;

type ReportCategory = typeof REPORT_CATEGORIES[number];

function buildQuestionSnapshot(question: any) {
  return {
    id: question.id,
    text: question.text,
    options: normalizeOptions(question.options),
    correctOption: question.correctOption,
    explanation: question.explanation,
    difficulty: question.difficulty,
    tags: question.tags,
    chapter: question.chapter?.name,
    subject: question.chapter?.subject?.name,
    exam: question.chapter?.subject?.exam?.name,
    concept: question.concept?.nameEnglish,
    isActive: question.isActive,
    updatedAt: question.updatedAt,
    snapshotAt: new Date().toISOString(),
  };
}

function buildSessionContext(req: AuthRequest, questionId: string) {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    questionId,
    timestamp: new Date().toISOString(),
  };
}

// Submit a question issue report
router.post('/:questionId/report', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { questionId } = req.params;
  const { category, description, suggestedCorrection } = req.body;

  if (!category || !REPORT_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'Valid category is required' });
  }

  // Rate limit: max 10 reports per user per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.questionReport.count({
    where: { userId, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= 10) {
    return res.status(429).json({ message: 'Too many reports submitted. Please try again later.' });
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      chapter: { include: { subject: { include: { exam: true } } } },
      concept: { select: { id: true, nameEnglish: true } },
    },
  });

  if (!question) return res.status(404).json({ message: 'Question not found' });

  // Check for existing report from this user for this question with same category
  const existing = await prisma.questionReport.findFirst({
    where: { userId, questionId, category },
  });

  if (existing) {
    return res.status(409).json({ message: 'You have already reported this issue for this question', reportId: existing.id });
  }

  const snapshot = buildQuestionSnapshot(question);
  const sessionContext = buildSessionContext(req, questionId);

  const report = await prisma.questionReport.create({
    data: {
      userId,
      questionId,
      category,
      description: description?.slice(0, 2000),
      suggestedCorrection: suggestedCorrection?.slice(0, 2000),
      questionSnapshot: snapshot,
      sessionContext,
      status: 'SUBMITTED',
      aiStatus: 'SUBMITTED',
    },
  });

  await prisma.userActivity.create({
    data: { userId, type: 'QUESTION_REPORTED', metadata: { questionId, category, reportId: report.id } },
  });

  // Trigger AI investigation asynchronously (don't await)
  investigateReport(report.id).catch((err) => {
    console.error(`AI investigation failed for report ${report.id}:`, err);
  });

  return res.status(201).json({ ...report, queuedForAnalysis: true });
});

// Get report details (for student who submitted it)
router.get('/:reportId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { reportId } = req.params;

  const report = await prisma.questionReport.findUnique({
    where: { id: reportId },
    include: {
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
  });

  if (!report) return res.status(404).json({ message: 'Report not found' });
  if (report.userId !== userId) return res.status(403).json({ message: 'Not authorized' });

  return res.json(report);
});

// Get user's reports
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const reports = await prisma.questionReport.findMany({
    where: { userId },
    include: {
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(reports);
});

// --- AI Investigation Pipeline ---

async function investigateReport(reportId: string) {
  const report = await prisma.questionReport.findUnique({
    where: { id: reportId },
    include: {
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
  });

  if (!report) return;

  // Prevent duplicate processing: only process reports still in SUBMITTED state
  if (report.aiStatus !== 'SUBMITTED') {
    return;
  }

  await prisma.questionReport.update({
    where: { id: reportId },
    data: { aiStatus: 'ANALYZING' },
  });

  try {
    // Step 1: Deterministic checks
    const deterministicResults = runDeterministicChecks(report.question, report.category);

    // Step 2: If deterministic checks find clear issue, auto-confirm
    if (deterministicResults.confirmed) {
      await prisma.questionReport.update({
        where: { id: reportId },
        data: {
          aiStatus: 'AUTO_CONFIRMED',
          aiConfidence: 0.95,
          aiSeverity: (deterministicResults.severity || 'MEDIUM') as any,
          aiSummary: deterministicResults.summary,
          aiEvidence: deterministicResults.evidence,
          aiProcessedAt: new Date(),
          aiRequiresHumanReview: false,
          aiRecommendedAction: deterministicResults.action,
        },
      });
      return;
    }

    // Reuse prior investigation if question version unchanged
    const prior = await prisma.questionReport.findFirst({
      where: {
        questionId: report.questionId,
        category: report.category,
        id: { not: report.id },
        aiStatus: { in: ['AUTO_CONFIRMED', 'AUTO_REJECTED', 'NEEDS_REVIEW'] },
        aiProcessedAt: { not: null },
      },
      orderBy: { aiProcessedAt: 'desc' },
    });

    if (prior && (prior.questionSnapshot as any)?.updatedAt === (report.questionSnapshot as any)?.updatedAt) {
      await prisma.questionReport.update({
        where: { id: reportId },
        data: {
          aiStatus: prior.aiStatus,
          aiClassification: prior.aiClassification,
          aiConfidence: prior.aiConfidence,
          aiSeverity: prior.aiSeverity,
          aiSummary: prior.aiSummary,
          aiEvidence: prior.aiEvidence,
          aiQuestionProblem: prior.aiQuestionProblem,
          aiAnswerKeyProblem: prior.aiAnswerKeyProblem,
          aiExplanationProblem: prior.aiExplanationProblem,
          aiSuggestedCorrection: prior.aiSuggestedCorrection,
          aiRequiresHumanReview: prior.aiRequiresHumanReview,
          aiRecommendedAction: prior.aiRecommendedAction,
          aiProcessedAt: new Date(),
        },
      });
      return;
    }

    // Step 3: AI-assisted investigation for non-deterministic cases
    const aiResult = await runAIInvestigation(report);

    if (!aiResult) {
      await prisma.questionReport.update({
        where: { id: reportId },
        data: {
          aiStatus: 'NEEDS_REVIEW',
          aiConfidence: 0,
          aiError: 'AI investigation unavailable',
          aiProcessedAt: new Date(),
          aiRequiresHumanReview: true,
        },
      });
      return;
    }

    // Step 4: Confidence-based routing
    let finalStatus: 'AUTO_CONFIRMED' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';
    if (aiResult.confidence >= 0.9 && aiResult.issue_detected) {
      finalStatus = 'AUTO_CONFIRMED';
    }
    // AI rejection never auto-dismisses; keep for human review
    if (aiResult.confidence >= 0.9 && !aiResult.issue_detected) {
      finalStatus = 'NEEDS_REVIEW';
    }

    await prisma.questionReport.update({
      where: { id: reportId },
      data: {
        aiStatus: finalStatus,
        aiClassification: aiResult.issue_category as any,
        aiConfidence: aiResult.confidence,
        aiSeverity: aiResult.severity as any,
        aiSummary: aiResult.summary,
        aiEvidence: aiResult.evidence,
        aiQuestionProblem: aiResult.question_problem,
        aiAnswerKeyProblem: aiResult.answer_key_problem,
        aiExplanationProblem: aiResult.explanation_problem,
        aiSuggestedCorrection: aiResult.suggested_correction,
        aiRequiresHumanReview: aiResult.requires_human_review,
        aiRecommendedAction: aiResult.recommended_action,
        aiProcessedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('Investigation error:', err);
    await prisma.questionReport.update({
      where: { id: reportId },
      data: {
        aiStatus: 'NEEDS_REVIEW',
        aiError: String(err),
        aiProcessedAt: new Date(),
        aiRequiresHumanReview: true,
      },
    });
  }
}

function runDeterministicChecks(question: any, category: ReportCategory) {
  const options = normalizeOptions(question.options);
  const results: {
    confirmed: boolean;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    summary?: string;
    evidence?: string;
    action?: string;
  } = { confirmed: false };

  // Check: Missing question text
  if (!question.text || question.text.trim().length === 0) {
    return {
      confirmed: true,
      severity: 'HIGH',
      summary: 'Question text is empty or missing',
      evidence: 'question.text is empty',
      action: 'DEACTIVATE_QUESTION',
    };
  }

  // Check: Empty options
  if (!options.length || options.some((o: string) => !o || o.trim().length === 0)) {
    return {
      confirmed: true,
      severity: 'HIGH',
      summary: 'One or more answer options are empty',
      evidence: `Options array has ${options.length} items, ${options.filter((o: string) => !o || o.trim().length === 0).length} empty`,
      action: 'DEACTIVATE_QUESTION',
    };
  }

  // Check: Invalid correctOption index
  if (typeof question.correctOption !== 'number' || question.correctOption < 0 || question.correctOption >= options.length) {
    return {
      confirmed: true,
      severity: 'HIGH',
      summary: 'Correct answer index is out of bounds',
      evidence: `correctOption=${question.correctOption}, options.length=${options.length}`,
      action: 'FIX_ANSWER_KEY',
    };
  }

  // Check: Duplicate options
  const uniqueOptions = new Set(options.map((o: string) => o.trim().toLowerCase()));
  if (uniqueOptions.size < options.length) {
    return {
      confirmed: true,
      severity: 'MEDIUM',
      summary: 'Duplicate answer options detected',
      evidence: `${options.length} options, ${uniqueOptions.size} unique`,
      action: 'FIX_OPTIONS',
    };
  }

  // Check: HTML/OCR artifacts
  const artifactPattern = /<[^>]+>|&[a-z]+;|\\[nrt]|\\u[0-9a-f]{4}/i;
  const hasArtifacts = artifactPattern.test(question.text) || options.some((o: string) => artifactPattern.test(o));
  if (hasArtifacts && (category === 'FORMATTING_OR_OCR_PROBLEM' || category === 'OTHER')) {
    return {
      confirmed: true,
      severity: 'MEDIUM',
      summary: 'HTML entities or OCR artifacts detected in question text or options',
      evidence: 'Text contains HTML tags, entities, or escape sequences',
      action: 'CLEAN_CONTENT',
    };
  }

  // Check: Promotional content (reuse safety filter patterns)
  const promoPattern = /(official site|youtube|whatsapp|telegram|insta|fb|follow us)/i;
  const hasPromo = promoPattern.test(question.explanation || '') || promoPattern.test(question.text);
  if (hasPromo && category === 'PROMOTIONAL_OR_UNWANTED_CONTENT') {
    return {
      confirmed: true,
      severity: 'MEDIUM',
      summary: 'Promotional content detected in question',
      evidence: 'Text contains promotional keywords (Official Site, YouTube, WhatsApp, etc.)',
      action: 'REMOVE_PROMOTIONAL_CONTENT',
    };
  }

  // Check: Missing explanation (for confusing explanation category)
  if (category === 'CONFUSING_EXPLANATION' && (!question.explanation || question.explanation.trim().length === 0)) {
    return {
      confirmed: true,
      severity: 'LOW',
      summary: 'Explanation is missing',
      evidence: 'question.explanation is empty or null',
      action: 'ADD_EXPLANATION',
    };
  }

  // Check: Existing safety filter status
  const safety = getSafetyRecordSync(question.id);
  if (safety && (safety.status === QuestionSafetyStatus.BLOCKED_CONFIRMED || safety.status === QuestionSafetyStatus.REPAIRED_PENDING_VERIFICATION)) {
    return {
      confirmed: true,
      severity: 'HIGH',
      summary: 'Question is already blocked by safety filter',
      evidence: `Safety status: ${safety.status}, reason: ${safety.reason}`,
      action: 'QUESTION_ALREADY_BLOCKED',
    };
  }

  return results;
}

async function runAIInvestigation(report: any) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const question = report.question;
  const options = normalizeOptions(question.options);

  const categoryPrompts: Record<ReportCategory, string> = {
    INCORRECT_ANSWER: `Compare the answer key (option ${String.fromCharCode(65 + question.correctOption)}) with the question and options. Evaluate if the proposed answer is supported. Check for option-order or indexing issues.`,
    INCORRECT_QUESTION: `Check if the question is incomplete, ambiguous, or factually inconsistent. Identify missing context.`,
    WRONG_OR_MISSING_OPTIONS: `Inspect option completeness and consistency. Identify duplicate or malformed options.`,
    DUPLICATE_QUESTION: `This would require comparing against other questions. Note that exact duplicates vs legitimate cross-exam variants should be distinguished.`,
    TYPOGRAPHICAL_OR_GRAMMAR_ERROR: `Identify typographical, grammatical, or language errors in the question text, options, or explanation.`,
    CONFUSING_EXPLANATION: `Compare the explanation with the question and correct answer. Identify contradictions, irrelevant content, or unclear reasoning.`,
    OUTDATED_INFORMATION: `Identify date-sensitive claims. Check if the question references time-sensitive information that may have changed. Do not assume old current-affairs answers were historically incorrect.`,
    IRRELEVANT_QUESTION: `Assess if the question is relevant to the chapter/subject/exam context.`,
    FORMATTING_OR_OCR_PROBLEM: `Identify merged text, broken symbols, malformed equations, missing characters, or OCR artifacts.`,
    PROMOTIONAL_OR_UNWANTED_CONTENT: `Identify embedded advertisements, social links, coaching promotions, unwanted scraped text. Avoid flagging legitimate educational words like purchase, price, cost, or banking.`,
    OTHER: `Analyze the question for any issues based on the student's description.`,
  };

  const prompt = [
    'You are an expert question quality analyst for a Kerala PSC exam preparation app.',
    'Investigate the reported issue and return a structured JSON response.',
    '',
    `REPORTED CATEGORY: ${report.category}`,
    report.description ? `STUDENT DESCRIPTION: ${report.description}` : '',
    report.suggestedCorrection ? `STUDENT SUGGESTED CORRECTION: ${report.suggestedCorrection}` : '',
    '',
    'QUESTION:',
    `Text: ${question.text}`,
    `Options: ${options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}: ${o}`).join('; ')}`,
    `Correct Option: ${String.fromCharCode(65 + question.correctOption)} (${options[question.correctOption]})`,
    question.explanation ? `Explanation: ${question.explanation}` : 'Explanation: (none)',
    `Difficulty: ${question.difficulty}`,
    `Tags: ${question.tags.join(', ') || '(none)'}`,
    `Chapter: ${question.chapter?.name} (${question.chapter?.subject?.name})`,
    `Exam: ${question.chapter?.subject?.exam?.name}`,
    `Concept: ${question.concept?.nameEnglish || '(none)'}`,
    `Question Updated: ${question.updatedAt}`,
    '',
    'INSTRUCTIONS:',
    categoryPrompts[report.category as ReportCategory] || categoryPrompts.OTHER,
    '',
    'Return ONLY a valid JSON object with these fields:',
    JSON.stringify({
      issue_detected: 'boolean',
      issue_category: 'string (must match reported category or a more specific one)',
      severity: 'string (LOW|MEDIUM|HIGH|CRITICAL)',
      confidence: 'number (0-1)',
      summary: 'string (2-3 sentences)',
      evidence: 'string (specific evidence from question)',
      question_problem: 'string or null',
      answer_key_problem: 'string or null',
      explanation_problem: 'string or null',
      suggested_correction: 'string or null',
      requires_human_review: 'boolean',
      recommended_action: 'string (DEACTIVATE_QUESTION|FIX_ANSWER_KEY|FIX_OPTIONS|CLEAN_CONTENT|REMOVE_PROMOTIONAL_CONTENT|ADD_EXPLANATION|QUESTION_ALREADY_BLOCKED|NO_ACTION_NEEDED|INVESTIGATE_FURTHER)',
    }, null, 2),
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_completion_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Groq request failed: ${response.status} ${body.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);

    // Validate required fields
    const required = ['issue_detected', 'issue_category', 'severity', 'confidence', 'summary', 'evidence', 'requires_human_review', 'recommended_action'];
    for (const field of required) {
      if (!(field in parsed)) throw new Error(`Missing required field: ${field}`);
    }

    // Clamp confidence
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence)));

    return parsed;
  } catch (err) {
    console.error('AI investigation error:', err);
    return null;
  }
}

export { investigateReport };
export default router;
