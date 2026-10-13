// ============================================
// 3. AdminFlaggedReports.tsx - Show flagged questions with reasons
// ============================================

import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../store';

export const AdminFlaggedReports = () => {
  const { user } = useAuth();
  const [flaggedQuestions, setFlaggedQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFlaggedQuestions();
  }, [user?.id]);

  const fetchFlaggedQuestions = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get('/admin/reports');
      setFlaggedQuestions(res.data);
    } catch (e) {
      setError('Failed to load flagged questions');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Loading flagged questions...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  if (flaggedQuestions.length === 0) {
    return <p>No flagged questions yet.</p>;
  }

  return (
    <div className="admin-flagged-reports">
      <h3>Flagged Questions ({flaggedQuestions.length})</h3>
      <div className="flagged-questions-list">
        {flaggedQuestions.map((f) => (
          <div key={f.id} className="flagged-question-item">
            <div className="flagged-question-info">
              <p><strong>Question:</strong> {f.text?.slice(0, 60) + (f.text?.length > 60 ? '...' : '')}</p>
              <p><strong>Reason:</strong> {f.reason || 'general'}</p>
              <p><strong>Flagged:</strong> {f.flaggedAt ? new Date(f.flaggedAt).toLocaleDateString() : 'unknown'}</p>
              <p><strong>Chapter:</strong> {f.chapter || 'N/A'}</p>
              <p><strong>Subject:</strong> {f.subject || 'N/A'}</p>
            </div>
            <div className="flagged-question-actions">
              <button
                className="btn-resolve"
                onClick={() => resolveFlaggedQuestion(f.id)}
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const resolveFlaggedQuestion = async (reportId: string) => {
    try {
      const res = await api.patch(`/admin/reports/${reportId}/resolve`);
      setStatus(res.data);
      fetchFlaggedQuestions();
    } catch (e) {
      setError('Failed to resolve');
    }
  };
};