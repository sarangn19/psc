/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Anek Malayalam'", 'system-ui', 'sans-serif'],
      },
      colors: {
        app: {
          bg:           '#F3F4F6',
          card:         '#FFFFFF',
          surface:      '#F1F3FD',
          border:       '#DADDE5',
          borderLight:  '#EEF0F4',
          accent:       '#2A3FC1',
          accentLight:  '#E8EBFB',
          accentDark:   '#1E2E94',
          accentMuted:  '#F1F3FD',
          text:         '#1A1F36',
          textSecondary:'#4B5168',
          textMuted:    '#7A8095',
          danger:       '#C4314B',
          dangerLight:  '#FBE8EC',
          dangerDark:   '#A3263D',
          warn:         '#E3A033',
          warnLight:    '#FBF0DA',
          warnDark:     '#8A5300',
        },
      },
    },
  },
  plugins: [],
};
