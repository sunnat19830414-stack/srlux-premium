/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fdf9e7',
          100: '#faf0c0',
          200: '#f5de7a',
          300: '#f0cb45',
          400: '#e8b820',
          DEFAULT: '#D4AF37',
          600: '#B8960C',
          700: '#8B6914',
          800: '#5e4510',
          900: '#3a2a0a',
        },
        anthracite: {
          50:  '#f5f5f5',
          100: '#e0e0e0',
          200: '#bdbdbd',
          300: '#9e9e9e',
          400: '#757575',
          DEFAULT: '#2D2D2D',
          600: '#212121',
          700: '#1a1a1a',
          800: '#141414',
          900: '#0a0a0a',
        },
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #8B6914 0%, #D4AF37 50%, #f0cb45 100%)',
        'dark-gradient': 'linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
      },
      boxShadow: {
        'gold': '0 0 24px rgba(212, 175, 55, 0.25)',
        'gold-lg': '0 0 48px rgba(212, 175, 55, 0.35)',
        'card': '0 4px 32px rgba(0, 0, 0, 0.5)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
