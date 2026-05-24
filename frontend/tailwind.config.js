import { theme } from './src/theme/default'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: theme.colors.dark,
        primary: theme.colors.primary,
        feedback: theme.colors.feedback,
      },
      fontFamily: {
        sans: theme.typography.fontFamily,
      },
      boxShadow: {
        focus: theme.boxShadow.focus,
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400% 0' },
          '100%': { backgroundPosition: '400% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [],
}
