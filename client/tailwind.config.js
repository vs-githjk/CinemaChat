/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cinema: {
          bg: '#08090d',
          card: '#121722',
          border: '#263147',
          accent: '#ff4d4f',
          'accent-hover': '#ff3236',
          gold: '#f6c25c',
          muted: '#8d96ad',
          'electric-blue': '#4da3ff',
          'mint-glow': '#58f3d6',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
