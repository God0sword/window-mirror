/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        zen: {
          bg: '#0d0d0d',
          surface: '#141414',
          elevated: '#1c1c1c',
          border: '#2a2a2a',
          accent: '#00d4aa',
          'accent-glow': 'rgba(0, 212, 170, 0.3)',
        },
        apple: {
          glass: 'rgba(28, 28, 30, 0.72)',
          'glass-border': 'rgba(255, 255, 255, 0.08)',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'fade-in': 'fadeIn 200ms ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 170, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 212, 170, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}