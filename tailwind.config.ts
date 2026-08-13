import type { Config } from 'tailwindcss'

/**
 * Design tokens.
 *
 * The palette is built for a records office, not a product launch: ink on
 * paper, one civic navy for action, and three status colours that are also
 * distinguishable by their label, never by hue alone. Every foreground/
 * background pair below clears WCAG 2.2 AA at normal text size.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14202E', muted: '#4A5866', faint: '#6B7885' },
        paper: { DEFAULT: '#FFFFFF', sunk: '#F4F6F5', edge: '#E7EAE9' },
        rule: { DEFAULT: '#D2D8D6', strong: '#A9B2B0' },
        civic: { DEFAULT: '#1B3A5C', hover: '#132A44', tint: '#EAF0F6' },
        status: {
          approved: '#1B5E3A',
          pending: '#8A5A00',
          none: '#4A5866',
          draft: '#6B21A8',
        },
      },
      fontFamily: {
        // Loaded from the system, so the embedded widget adds no font requests
        // to the host page and the archive renders instantly on slow connections.
        display: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        eyebrow: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
      },
      maxWidth: { prose: '68ch' },
      borderRadius: { sm: '2px', DEFAULT: '3px', md: '4px' },
      boxShadow: { card: '0 1px 2px rgba(20, 32, 46, 0.06)' },
    },
  },
  plugins: [],
}
export default config
