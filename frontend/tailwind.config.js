/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        app: {
          bg: '#f5f4ef',
          card: '#ffffff',
          surface: '#f0efe9',
          border: '#e5e3da',
          borderLight: '#d4d2c8',
          accent: '#2d6a4f',
          accentLight: '#40916c',
          accentDark: '#1b4332',
          accentMuted: '#d8f3dc',
          text: '#1f1e1d',
          textSecondary: '#4a4845',
          textMuted: '#8a8680',
        },
      },
    },
  },
  plugins: [],
};
