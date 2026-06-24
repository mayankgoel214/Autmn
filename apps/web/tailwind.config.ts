import type { Config } from 'tailwindcss';

/**
 * Autmn brand tokens. Ink + Gold premium palette.
 *   ink   = near-black canvas
 *   gold  = the one confident accent (the bloom, CTAs, "Au")
 *   cream = light surfaces / text on ink
 *   sand  = muted text on ink
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#17120E',
          soft: '#211913',
          raised: '#2A2018',
          line: 'rgba(201,154,63,0.18)',
        },
        gold: {
          DEFAULT: '#C99A3F',
          dark: '#A87E2E',
          light: '#E0B860',
        },
        cream: {
          DEFAULT: '#F7F2E9',
          deep: '#ECE6DA',
        },
        sand: {
          DEFAULT: '#C9BBA3',
          dim: '#8A7E6C',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 6px rgba(201,154,63,0.08)',
        lift: '0 18px 50px -20px rgba(0,0,0,0.55)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        bloomIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        bloomIn: 'bloomIn 0.6s cubic-bezier(0.22,1,0.36,1) both',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
