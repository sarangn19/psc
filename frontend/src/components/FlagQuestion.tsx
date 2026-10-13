// ============================================
// 2. FlagQuestion.tsx - Flag a question with reason
// ============================================

import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../store';

const FlagQuestion = ({ questionId }: { questionId: string }) => {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reasons = [
    { value: 'general', label: 'General issue' },
    { value: 'incorrect', label: 'Incorrect answer' },
    { value: 'typo', label: 'Typo / grammar error' },
    { value: 'offensive', label: 'Offensive content' },
    { value: 'duplicate', label: 'Duplicate question' },
    { value: 'content', label: 'Content issue' },
    { value: 'format', label: 'Format problem' },
  ];

  const handleFlag = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/questions/${questionId}/flag`, { reason: selectedReason });
      setStatus(res.data.flagged ? '✅ Question flagged!' : '❌ Failed');
      setShowModal(false);
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setStatus('❌ Error flagging question');
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flag-question-wrapper">
      <button
        className="flag-question-btn"
        onClick={() => setShowModal(true)}
        disabled={submitting}
        title="Flag this question"
      >
        {submitting ? 'Flagging...' : 'Flag'}
      </button>

      {showModal && (
        <div className="flag-question-modal">
          <h4>Why flag this question?</h4>
          <p>Select the reason for flagging</p>
          <div className="flag-reasons">
            {reasons.map((r) => (
              <label key={r.value} className="flag-reason-item">
                <input
                  type="radio"
                  name="flag-reason"
                  value={r.value}
                  checked={selectedReason === r.value}
                  onChange={() => setSelectedReason(r.value)}
                  disabled={submitting}
                  style={{ marginRight: '8px' }}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
          <div className="flag-actions">
            <button onClick={handleFlag} disabled={submitting}>
              {submitting ? 'Flagging...' : 'Submit'}
            </button>
            <button onClick={() => setShowModal(false)}>Cancel</button>
          </div>
          {status && <p className="flag-status">{status}</p>}
        </div>
      )}
    </div>
  );
};

export default FlagQuestion;