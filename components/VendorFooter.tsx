import pkg from '@/package.json'

/**
 * Vendor attribution and build version.
 *
 * Deliberately narrow wording: the software is the vendor's, the records are
 * the municipality's. A bare "© Priddy Impact Group" on a page of public
 * meeting minutes would read as a claim over the records themselves, which is
 * both wrong and the sort of thing that draws a public-information complaint.
 *
 * The version is here so anyone reporting a problem can say which build they
 * were looking at without being asked to dig.
 */
export function VendorFooter({ className = '' }: { className?: string }) {
  return (
    <p className={`text-sm text-ink-muted ${className}`}>
      Records management software &copy; {new Date().getFullYear()} Priddy Impact Group, LLC
      d/b/a Shift 1 Systems. Meeting records are public documents of the municipality.
      <span className="ml-2 whitespace-nowrap opacity-70">v{pkg.version}</span>
    </p>
  )
}
