export const theme = {
  colors: {
    dark: {
      bg: '#121212',
      surface: '#1e1e1e',
      border: '#2a2a2a',
    },
    primary: {
      DEFAULT: '#00A884',
      hover: '#008f6f',
      ring: 'rgba(0, 168, 132, 0.5)',
    },
    text: {
      primary: '#d9d9d9',
      secondary: '#9ca3af',
    },
    states: {
      hover: '#282828',
      disabled: '#0a0a0a',
    },
    feedback: {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
    },
  },
  typography: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
    baseSize: '18px',
  },
  boxShadow: {
    focus: '0 0 0 3px rgba(0, 168, 132, 0.5)',
  },
} as const;
