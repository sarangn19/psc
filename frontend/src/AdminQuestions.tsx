import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../store';
import { FlagQuestion } from '@/components/FlagQuestion';
import { AdminFlaggedReports } from '@/components/AdminFlaggedReports';

const AdminQuestions = () => {
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flaggedStatus, setFlaggedStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchQuestions();
  }, [user?.id]);

  const fetchQuestions = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get('/api/questions');
      setQuestions(res.data.items);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      console.error('Failed to fetch questions', e);
    }
  };

  const handleFlagSuccess = () => {
    setFlaggedStatus('✅ Question flagged!');
    setTimeout(() => setFlaggedStatus(null), 3000);
    fetchQuestions(); // Refresh list
  };

  if (loading) return <div>Loading questions...</div>;

  return (
    <div className="admin-questions">
      <h2>Question Bank ({questions.length})</h2>

      {/* Flagged Questions Summary */}
      {flaggedStatus && <p>{flaggedStatus}</p>}

      <AdminFlaggedReports />

      <div className="questions-list">
        {questions.map((q) => (
          <div key={q.id} className="question-item">
            <div className="question-info">
              <p><strong>Question:</strong> {q.text?.slice(0, 60) + (q.text?.length > 60 ? '...' : '')}</p>
              <p><strong>Chapter:</strong> {q.chapter?.name || 'N/A'}</p>
              <p><strong>Difficulty:</strong> {q.difficulty || 'N/A'}</p>
            </div>
            <div className="question-actions">
              <FlagQuestion questionId={q.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminQuestions;