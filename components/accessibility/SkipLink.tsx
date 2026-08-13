export function SkipLink({ href = '#main', children = 'Skip to main content' }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                 focus:rounded focus:border focus:border-civic focus:bg-paper focus:px-4 focus:py-2
                 focus:font-semibold"
    >
      {children}
    </a>
  )
}
