// ============================================
// 4. QuestionFlagButton.tsx - Flag button for each question
// ============================================

import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../store';
import FlagQuestion from './FlagQuestion';

const QuestionFlagButton = ({ questionId }: { questionId: string }) => {
  const { user } = useAuth();
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [flagStatus, setFlagStatus] = useState<string | null>(null);

  const handleFlag = async () => {
    setShowFlagModal(true);
  };

  const handleRefresh = async () => {
    // Refresh flag status
    try {
      const res = await api.get('/api/user/flagged');
      setIsFlagged(res.data.some((f: any) => f.questionId === questionId));
    } catch (e) {
      // Ignore errors, just re-render
    }
  };

  return (
    <div className="question-flag-container">
      {isFlagged ? (
        <span className="flagged-badge">Flagged</span>
      ) : (
        <FlagQuestion questionId={questionId} />
      )}

      <button
        className="flag-button-small"
        onClick={handleFlag}
        title="Flag this question"
        style={{
          marginLeft: '8px',
          background: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
      >
        🚩
      </button>

      {status && (
        <span className="flag-status-small" style={{ marginLeft: '8px', color: '#28a745' }}>
          {status}
        </span>
      )}
    </div>
  );
};

export default QuestionFlagButton;