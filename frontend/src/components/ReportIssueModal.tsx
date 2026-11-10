import { useState, useEffect, useRef } from 'react';

const REPORT_CATEGORIES = [
  { value: 'INCORRECT_ANSWER', label: 'Incorrect Answer' },
  { value: 'INCORRECT_QUESTION', label: 'Incorrect Question' },
  { value: 'WRONG_OR_MISSING_OPTIONS', label: 'Wrong or Missing Options' },
  { value: 'DUPLICATE_QUESTION', label: 'Duplicate Question' },
  { value: 'TYPOGRAPHICAL_OR_GRAMMAR_ERROR', label: 'Typographical or Grammar Error' },
  { value: 'CONFUSING_EXPLANATION', label: 'Confusing Explanation' },
  { value: 'OUTDATED_INFORMATION', label: 'Outdated Information' },
  { value: 'IRRELEVANT_QUESTION', label: 'Irrelevant Question' },
  { value: 'FORMATTING_OR_OCR_PROBLEM', label: 'Formatting or OCR Problem' },
  { value: 'PROMOTIONAL_OR_UNWANTED_CONTENT', label: 'Promotional or Unwanted Content' },
  { value: 'OTHER', label: 'Other' },
] as const;

type ReportCategory = typeof REPORT_CATEGORIES[number]['value'];

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  questionText: string;
  onSubmitted?: () => void;
}

export default function ReportIssueModal({ isOpen, onClose, questionId, questionText, onSubmitted }: ReportIssueModalProps) {
  const [category, setCategory] = useState<ReportCategory>('INCORRECT_ANSWER');
  const [description, setDescription] = useState('');
  const [suggestedCorrection, setSuggestedCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const focusRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setError('');
      setCategory('INCORRECT_ANSWER');
      setDescription('');
      setSuggestedCorrection('');
      setTimeout(() => focusRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      setError('Please select an issue category');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const api = (await import('../lib/api')).default;
      await api.post(`/reports/${questionId}/report`, {
        category,
        description: description || undefined,
        suggestedCorrection: suggestedCorrection || undefined,
      });
      setSubmitted(true);
      onSubmitted?.();
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError('You have already reported this issue for this question');
      } else {
        setError(err.response?.data?.message || 'Failed to submit report. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-app-border flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 id="report-modal-title" className="text-[18px] font-[700] text-app-text m-0">Report Issue</h2>
          <button type="button" onClick={onClose} disabled={submitting} className="p-1 rounded-lg text-app-textMuted hover:bg-app-surface hover:text-app-text transition-colors disabled:opacity-50" aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {submitted ? (
          /* Success State */
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2A3FC1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h3 className="text-[20px] font-[700] text-app-text m-0 mb-2">Report Submitted</h3>
            <p className="text-[15px] text-app-textSecondary m-0 mb-6">
              Thank you for reporting this issue. Our AI system will investigate and the admin team will review it.
            </p>
            <button type="button" onClick={onClose} className="btn-primary w-full max-w-xs">Close</button>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Question Preview */}
            <div className="bg-app-surface border border-app-border rounded-xl p-4">
              <p className="text-[12px] uppercase tracking-[0.05em] font-[600] text-app-textMuted m-0 mb-2">Question</p>
              <p className="text-[15px] leading-[1.5] text-app-text m-0 line-clamp-3">{questionText}</p>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-[14px] font-[600] text-app-textSecondary mb-3">Issue Category <span className="text-app-danger">*</span></label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {REPORT_CATEGORIES.map((cat) => (
                  <label key={cat.value} className="relative">
                    <input
                      type="radio"
                      name="category"
                      value={cat.value}
                      checked={category === cat.value}
                      onChange={() => { setCategory(cat.value); setError(''); }}
                      className="sr-only"
                    />
                    <div className={`min-h-[72px] p-3 rounded-xl border-2 text-left cursor-pointer transition-all` +
                      (category === cat.value
                        ? ' border-app-accent bg-app-accentLight'
                        : ' border-app-border hover:border-app-accent/50 hover:bg-app-surface')}>
                      <p className="text-[14px] font-[600] text-app-text m-0 mb-1">{cat.label}</p>
                      <p className="text-[12px] text-app-textSecondary m-0">
                        {getCategoryDescription(cat.value)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-[14px] font-[600] text-app-textSecondary mb-2">
                Your Explanation (optional)
              </label>
              <textarea
                id="description"
                placeholder="Describe what's wrong with this question..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                className="input w-full resize-none"
              />
              <p className="text-[12px] text-app-textMuted text-right mt-1">{description.length}/2000</p>
            </div>

            {/* Suggested Correction */}
            <div>
              <label htmlFor="suggestedCorrection" className="block text-[14px] font-[600] text-app-textSecondary mb-2">
                Suggested Correct Answer / Correction (optional)
              </label>
              <textarea
                id="suggestedCorrection"
                placeholder="What should the correct answer or question text be?"
                value={suggestedCorrection}
                onChange={(e) => setSuggestedCorrection(e.target.value)}
                rows={2}
                maxLength={2000}
                className="input w-full resize-none"
              />
              <p className="text-[12px] text-app-textMuted text-right mt-1">{suggestedCorrection.length}/2000</p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-app-dangerLight text-app-danger text-[14px]" role="alert">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !category}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>

            <p className="text-[12px] text-app-textMuted text-center">
              Your student ID, question details, and session context are captured automatically.
              We never share your identity with other students.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function getCategoryDescription(category: ReportCategory): string {
  const descriptions: Record<ReportCategory, string> = {
    INCORRECT_ANSWER: 'The marked correct answer is wrong',
    INCORRECT_QUESTION: 'The question itself is factually incorrect',
    WRONG_OR_MISSING_OPTIONS: 'Options are missing, duplicated, or malformed',
    DUPLICATE_QUESTION: 'This question appears elsewhere in the bank',
    TYPOGRAPHICAL_OR_GRAMMAR_ERROR: 'Spelling, grammar, or language errors',
    CONFUSING_EXPLANATION: 'The explanation contradicts or is unclear',
    OUTDATED_INFORMATION: 'Contains outdated facts or dates',
    IRRELEVANT_QUESTION: 'Not relevant to the chapter or exam',
    FORMATTING_OR_OCR_PROBLEM: 'Broken symbols, merged text, OCR artifacts',
    PROMOTIONAL_OR_UNWANTED_CONTENT: 'Contains ads, links, or promotional text',
    OTHER: 'Other issue not listed above',
  };
  return descriptions[category];
}