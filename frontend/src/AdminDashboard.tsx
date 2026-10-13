import React from 'react';
import { useAuth } from '../store';
import { api } from '../api';
import { AdminFeedback } from '@/components/AdminFeedback';
import { AdminFlaggedReports } from '@/components/AdminFlaggedReports';

const AdminDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="admin-dashboard">
      <h2>Admin Dashboard</h2>

      {/* User Stats Section */}
      <div className="admin-stats">
        <div className="stat-card">
          <h3>Total Users</h3>
          <p>{(user?.role === 'ADMIN' ? 'N/A' : 'Loading...')}</p>
        </div>
        <div className="stat-card">
          <h3>Total Questions</h3>
          <p>{user?.role === 'ADMIN' ? 'N/A' : 'Loading...'}</p>
        </div>
        <div className="stat-card">
          <h3>Active Sessions</h3>
          <p>{user?.role === 'ADMIN' ? 'N/A' : 'Loading...'}</p>
        </div>
      </div>

      {/* Feedback Section - NEW */}
      <AdminFeedback />

      {/* Flagged Questions Section - NEW */}
      <AdminFlaggedReports />

      {/* Remaining admin content would go here */}
      <div className="admin-actions">
        <p>Admin actions area</p>
      </div>
    </div>
  );
};

export default AdminDashboard;