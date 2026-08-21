/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        app: {
          bg: '#090d16',
          card: '#111827',
          surface: '#1e293b',
          border: '#1e293b',
          borderLight: '#334155',
          accent: '#7c3aed',
          accentLight: '#8b5cf6',
          accentDark: '#6d28d9',
          accentMuted: '#4c1d95',
          text: '#f8fafc',
          textSecondary: '#94a3b8',
          textMuted: '#64748b',
        },
      },
    },
  },
  plugins: [],
};
