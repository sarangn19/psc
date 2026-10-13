// ============================================
// 1. AdminFeedback.tsx - Space to send message to admin
// ============================================

import React, { useState } from 'react';
import { api } from '../api';

export const AdminFeedback = () => {
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      const res = await api.post('/admin/feedback', { message, type: 'general' });
      setStatus(res.data.success ? '✅ Sent successfully!' : '❌ Failed');
      setMessage('');
      setShowModal(false);
      // Auto-clear after 3 seconds
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setStatus('❌ Error sending feedback');
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="admin-feedback-section">
      <button
        className="btn-admin-feedback"
        onClick={() => setShowModal(true)}
        title="Send feedback to admin"
      >
        💬 Send Feedback
      </button>

      {showModal && (
        <div className="admin-feedback-modal">
          <h4>Send Feedback to Admin</h4>
          <p>Help us improve the platform</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your feedback, bug report, or suggestion..."
            rows={4}
            disabled={false}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              marginBottom: '8px',
              fontSize: '14px',
            }}
          ></textarea>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleSend}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#0055ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Send
            </button>
            <button
              onClick={() => setShowModal(false)}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#f0f0f0',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
          {status && (
            <p
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: status.includes('✅') ? '#28a745' : '#dc3545',
              }}
            >
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
};