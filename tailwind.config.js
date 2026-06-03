/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./Meridian.html', './src/**/*.{jsx,js,html}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '44px', letterSpacing: '-0.02em' }],
        'title-1': ['22px', { lineHeight: '28px' }],
        'title-2': ['18px', { lineHeight: '24px' }],
        label: ['11px', { lineHeight: '14px', letterSpacing: '0.06em' }],
      },
      colors: {
        base: { DEFAULT: '#080A0F', light: '#FAFAFA' },
        surface: { DEFAULT: '#0E1117', elevated: '#141820', light: '#FFFFFF' },
        border: { DEFAULT: '#1C2130' },
        hairline: '#1C2130',
        'hairline-light': 'rgba(9,9,11,0.08)',
        txt: { primary: '#F8FAFC', secondary: '#94A3B8', muted: '#64748B' },
        accent: { DEFAULT: '#6366F1', glow: 'rgba(99,102,241,0.22)' },
        cyan: { DEFAULT: '#22D3EE', glow: 'rgba(34,211,238,0.18)' },
        spend: '#FB923C',
        critical: '#EF4444',
        good: '#22C55E',
        info: '#22D3EE',
        chart: {
          1: '#6366F1',
          2: '#22D3EE',
          3: '#10B981',
          4: '#F59E0B',
          5: '#F472B6',
          6: '#94A3B8',
        },
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        modal: '16px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)',
        popover: '0 16px 48px rgba(0,0,0,0.55)',
      },
      spacing: {
        4.5: '18px',
      },
      transitionTimingFunction: {
        meridian: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'pulse-live': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(0.85)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        'stagger-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'flash-good': {
          '0%': { color: '#22C55E' },
          '100%': { color: 'inherit' },
        },
        'flash-bad': {
          '0%': { color: '#F87171' },
          '100%': { color: 'inherit' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'pulse-live': 'pulse-live 1.6s ease-in-out infinite',
        'stagger-in': 'stagger-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'flash-good': 'flash-good 0.4s ease-out',
        'flash-bad': 'flash-bad 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
