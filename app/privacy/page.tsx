import type { Metadata } from 'next'
import Link from 'next/link'
import { SkipLink } from '@/components/accessibility/SkipLink'
import { VendorFooter } from '@/components/VendorFooter'
import { getMunicipalityBySlug, tenantConfig } from '@/lib/data/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How this meeting records system handles personal information, including what it collects when city staff sign in with a Google account.',
  robots: { index: true, follow: true },
}

/**
 * Privacy policy for the records system itself.
 *
 * Hosted here, on the same domain as the public archive, for two reasons.
 * Google's OAuth branding review requires the privacy policy to sit on the
 * domain that hosts the application home page and to disclose specifically how
 * the app handles Google user data. And a city's general website privacy
 * policy is written about that website — it cannot honestly describe what this
 * system does, because whoever wrote it was describing something else.
 *
 * The municipality's own policy is linked from here rather than replaced.
 */
export default async function PrivacyPage() {
  const municipality = await getMunicipalityBySlug()
  const config = tenantConfig(municipality)
  const contact = municipality.contact_email

  return (
    <>
      <SkipLink />

      <header className="border-b border-rule">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="eyebrow">{municipality.name}</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Privacy policy</h1>
          <p className="mt-3 text-ink-muted">
            How the meeting agendas and minutes system handles personal information.
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <div className="prose-civic space-y-6">
          <section aria-labelledby="reading">
            <h2 id="reading" className="font-display text-xl font-semibold">
              Reading meeting records
            </h2>
            <p className="mt-2">
              No account is required to read anything on this site, and none of the meeting
              agendas, minutes, or documents here ask for personal information. You may search,
              read, download, and share every document without identifying yourself.
            </p>
            <p className="mt-2">
              This site does not use advertising trackers and does not sell or share information
              about visitors with anyone. Ordinary web server logs are kept for security and
              reliability, and are not used to build a profile of any visitor.
            </p>
          </section>

          <section aria-labelledby="staff">
            <h2 id="staff" className="font-display text-xl font-semibold">
              Staff sign-in, including Google sign-in
            </h2>
            <p className="mt-2">
              Only authorized {municipality.name} staff can sign in to publish and maintain these
              records. Accounts are created by an administrator; signing in does not create one.
            </p>
            <p className="mt-2">
              Staff may sign in with an email address and password, or with a Google account. When
              a staff member signs in with Google, this system receives only:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>the name on that Google account</li>
              <li>the email address on that Google account</li>
            </ul>
            <p className="mt-2">
              That is the entire extent of the Google user data this system requests. It does not
              request or receive access to Gmail, Google Drive, Contacts, Calendar, or any other
              Google service, and it cannot read, modify, or delete anything in a staff member&rsquo;s
              Google account.
            </p>
            <p className="mt-2">
              <strong>How it is used.</strong> The name and email address identify which staff
              member signed in and which staff member made each change to the public record. This
              is what allows the city to answer, accurately and later, who published a given
              agenda or approved a given set of minutes.
            </p>
            <p className="mt-2">
              <strong>How it is stored.</strong> The name and email address are stored in the
              system&rsquo;s database, hosted by Supabase, and in the change history described below.
              Passwords, when used, are stored only as salted cryptographic hashes and are never
              readable by anyone, including the city or the software vendor.
            </p>
            <p className="mt-2">
              <strong>How it is shared.</strong> It is not sold, rented, or shared with any third
              party for advertising or any other purpose. It may appear in the change history,
              which is a record of city business and may be subject to disclosure under the Texas
              Public Information Act.
            </p>
            <p className="mt-2">
              This system&rsquo;s use of Google user data is limited to the practices described here,
              in keeping with the Google API Services User Data Policy, including its Limited Use
              requirements.
            </p>
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="font-display text-xl font-semibold">
              Change history
            </h2>
            <p className="mt-2">
              Every change to a meeting, document, category, or staff account is recorded
              automatically, including who made it and when. This history cannot be edited or
              deleted by anyone using the application. It exists so that the integrity of the
              public record can be demonstrated rather than assumed.
            </p>
          </section>

          <section aria-labelledby="retention">
            <h2 id="retention" className="font-display text-xl font-semibold">
              Retention
            </h2>
            <p className="mt-2">
              Meeting agendas and minutes are public records and are retained according to the
              city&rsquo;s records retention schedule and Texas law. Staff account information is
              retained while the account is active and afterwards as part of the change history,
              so that past entries continue to identify who made them. When a staff member leaves,
              their access is disabled rather than deleted, for that reason.
            </p>
          </section>

          <section aria-labelledby="requests">
            <h2 id="requests" className="font-display text-xl font-semibold">
              Questions, access, and corrections
            </h2>
            <p className="mt-2">
              To ask a question about this policy, request a document in an alternative format, or
              ask about information held about you, contact the {municipality.name} city
              clerk&rsquo;s office
              {contact ? (
                <>
                  {' '}at <a href={`mailto:${contact}`}>{contact}</a>
                </>
              ) : null}
              .
            </p>
            {config.privacy_policy_url && (
              <p className="mt-2">
                The city maintains a separate privacy policy covering its main website, available
                at <a href={config.privacy_policy_url}>{config.privacy_policy_url}</a>. This page
                describes the meeting records system specifically.
              </p>
            )}
          </section>
        </div>

        <p className="mt-10">
          <Link href="/meetings">Return to meeting agendas and minutes</Link>
        </p>
      </main>

      <footer className="border-t border-rule bg-paper-sunk">
        <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-ink-muted">
          <p>Records maintained by {municipality.name}</p>
          <VendorFooter className="mt-4 border-t border-rule pt-4" />
        </div>
      </footer>
    </>
  )
}
