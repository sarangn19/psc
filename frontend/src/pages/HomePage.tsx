import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, BookOpen, TrendingUp, TrendingDown, Target, Zap, Clock } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface Stats {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  totalSessions: number;
  learnedChapters: number;
  lastSessionScore: number;
  weakZones: { name: string; accuracy: number }[];
  strongZones: { name: string; accuracy: number }[];
}

export default function HomePage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [hasExams, setHasExams] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/users/stats'),
      api.get('/exams/my'),
    ]).then(([statsRes, examsRes]) => {
      setStats(statsRes.data);
      setHasExams(examsRes.data.length > 0);
    }).catch(() => setHasExams(false));
  }, []);

  if (hasExams === false) {
    navigate('/onboarding');
    return null;
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-5 text-white">
        <p className="text-green-200 text-sm">Good day,</p>
        <h2 className="text-2xl font-bold mt-0.5">{user?.name} 👋</h2>
        <p className="text-green-100 text-sm mt-1">Keep up your preparation streak!</p>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center p-4">
            <p className="text-2xl font-bold text-green-600">{stats.accuracy}%</p>
            <p className="text-xs text-gray-500 mt-1">Accuracy</p>
          </div>
          <div className="card text-center p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.totalAttempts}</p>
            <p className="text-xs text-gray-500 mt-1">Questions</p>
          </div>
          <div className="card text-center p-4">
            <p className="text-2xl font-bold text-purple-600">{stats.learnedChapters}</p>
            <p className="text-xs text-gray-500 mt-1">Chapters</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('/adaptive')}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl p-5 flex items-center gap-4 hover:from-green-700 hover:to-emerald-700 transition-all shadow-md"
        >
          <div className="bg-white/20 rounded-xl p-3">
            <Brain size={28} />
          </div>
          <div className="text-left">
            <p className="font-bold text-lg">Adaptive Learning</p>
            <p className="text-green-100 text-sm">AI-powered questions based on your knowledge gaps</p>
          </div>
          <Zap size={20} className="ml-auto text-yellow-300" />
        </button>

        <button
          onClick={() => navigate('/chapters')}
          className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 border-2 border-gray-100 hover:border-green-200 transition-all shadow-sm"
        >
          <div className="bg-green-50 rounded-xl p-3">
            <BookOpen size={28} className="text-green-600" />
          </div>
          <div className="text-left">
            <p className="font-bold text-lg text-gray-900">Mark Chapters</p>
            <p className="text-gray-500 text-sm">Update your learned chapters</p>
          </div>
        </button>
      </div>

      {/* Weak & Strong Zones */}
      {stats && (stats.weakZones.length > 0 || stats.strongZones.length > 0) && (
        <div className="space-y-3">
          {stats.weakZones.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={18} className="text-red-500" />
                <h3 className="font-semibold text-gray-900">Weak Zones — Focus Here</h3>
              </div>
              <div className="space-y-2">
                {stats.weakZones.map((z) => (
                  <div key={z.name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{z.name}</span>
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      {z.accuracy}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.strongZones.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} className="text-green-500" />
                <h3 className="font-semibold text-gray-900">Strong Zones — Keep it up!</h3>
              </div>
              <div className="space-y-2">
                {stats.strongZones.map((z) => (
                  <div key={z.name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{z.name}</span>
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      {z.accuracy}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stats && stats.totalSessions > 0 && (
        <div className="card flex items-center gap-3">
          <Clock size={20} className="text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Last session score</p>
            <p className="font-bold text-gray-900">{stats.lastSessionScore.toFixed(1)}%</p>
          </div>
          <div className="ml-auto">
            <Target size={20} className="text-gray-400" />
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total sessions</p>
            <p className="font-bold text-gray-900">{stats.totalSessions}</p>
          </div>
        </div>
      )}
    </div>
  );
}
