/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#0B1F33',
        canvas: '#F5F8FC',
        hairline: '#DCE6F1',
        ink: '#0F172A',
        muted: '#64748B',
        brand: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
          light: '#EFF6FF',
        },
        severity: {
          low: '#16A34A',
          watch: '#EAB308',
          moderate: '#F59E0B',
          high: '#F97316',
          critical: '#DC2626',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)',
        panel: '0 4px 16px -2px rgba(15, 23, 42, 0.10)',
      },
    },
  },
  plugins: [],
};
