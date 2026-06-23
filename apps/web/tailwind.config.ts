import type { Config } from 'tailwindcss';

/**
 * Autmn brand tokens. Warm autumn palette — see src/app/brand/page.tsx for the
 * one-page brand sheet. Two brand colors (terracotta + amber), one accent (olive),
 * cream background, warm-ink text.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terracotta: {
          DEFAULT: '#C2410C',
          dark: '#9A3412',
          light: '#EA580C',
        },
        amber: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
          light: '#FBBF24',
        },
        olive: {
          DEFAULT: '#4D7C0F',
          dark: '#3F6212',
        },
        cream: {
          DEFAULT: '#FFFBF5',
          deep: '#FEF3E2',
        },
        ink: {
          DEFAULT: '#2B1A10',
          soft: '#6B5544',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        warm: '0 10px 40px -12px rgba(194, 65, 12, 0.25)',
        card: '0 4px 24px -8px rgba(43, 26, 16, 0.12)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};

export default config;
