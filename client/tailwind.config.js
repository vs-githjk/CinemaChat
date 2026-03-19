/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cinema: {
          bg: '#0a0a0f',
          card: '#13131a',
          border: '#1e1e2e',
          accent: '#e50914',
          'accent-hover': '#c40811',
          gold: '#f5c518',
          muted: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
