import { create } from 'zustand';
import api from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  createdAt: string;
  hasExams?: boolean;
  travelMode?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  toggleTravelMode: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: false,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    set({ token: data.token, user: data.user });
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', data.token);
    set({ token: data.token, user: data.user });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  fetchMe: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data });
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null });
    } finally {
      set({ loading: false });
    }
  },

  toggleTravelMode: async () => {
    const current = get().user?.travelMode === true;
    set({ user: get().user ? { ...get().user!, travelMode: !current } : null });
    try {
      const { data } = await api.post('/users/travel-mode', { enabled: !current });
      set({ user: get().user ? { ...get().user!, travelMode: data.travelMode } : null });
    } catch {
      set({ user: get().user ? { ...get().user!, travelMode: current } : null });
      throw new Error('Failed to update travel mode');
    }
  },
}));
