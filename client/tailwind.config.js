/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Dark mode is handled entirely via CSS custom properties toggled on html.dark —
  // no Tailwind dark variants needed.
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      colors: {
        'surface-bg':     'var(--surface-bg)',
        'surface-card':   'var(--surface-card)',
        'surface-border': 'var(--surface-border)',
        'surface-hover':  'var(--surface-hover)',
        'tx-primary':     'var(--text-primary)',
        'tx-secondary':   'var(--text-secondary)',
        'tx-muted':       'var(--text-muted)',
        'accent':         'var(--accent-color)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};
