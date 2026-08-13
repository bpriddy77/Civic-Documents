# Google sign-in

Lets staff sign in with their Google account instead of a separate password.

## What this is, and what it is not

**Is:** one less password. Someone already signed into Google in that browser
clicks *Continue with Google* and is in — usually with no prompt at all.

**Is not:** a shared session with GoHighLevel. Signing into GHL does not sign
anyone into records administration. The two systems each authenticate against
Google independently, so in practice it feels seamless while remaining
separately revocable.

That separation is deliberate. GoHighLevel accounts are provisioned for
marketing and CRM work; records administration has its own roles, and
disabling a GHL user should not be the only thing standing between someone and
the public record.

## The part that matters most

**Google will authenticate anyone on earth.** Any Google account can complete
the sign-in flow. What it cannot do is grant access.

Access requires an active `profiles` row, created by an administrator. A
Google account with no profile is signed straight back out and shown a message
explaining that the account is not set up. This is enforced in
`app/auth/callback/route.ts` and again by Row-Level Security.

So enabling Google does **not** open the door. It changes how known staff prove
who they are, nothing else.

Two consequences worth internalising:

- The email on the profile must match the Google account exactly. `jane@forsan.texas.gov` and `jane.clerk@gmail.com` are different people as far as this system is concerned.
- Removing someone's Google account does not remove their access. Set `active = false` on their profile — that is the revocation that counts.

---

## Setup

### 1. Create the Google OAuth client

In the [Google Cloud Console](https://console.cloud.google.com):

1. Create or select a project
2. **APIs & Services → OAuth consent screen** — External, fill in the app name, support email, and developer email
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. **Authorised redirect URIs** — add exactly:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`

That URI is Supabase's, not your app's. Supabase receives the response from
Google and then redirects to your application. Getting this wrong produces
`redirect_uri_mismatch`, which is the most common failure here.

Copy the **Client ID** and **Client secret**.

### 2. Enable it in Supabase

**Authentication → Sign In / Providers → Google**:

- Enable
- Paste the Client ID and Client secret
- Save

Confirm the callback URL Supabase displays matches what you entered in Google.

### 3. Confirm your redirect URLs

**Authentication → URL Configuration** — the app's callback must be in the
allow list, or Google returns the user to the wrong place:

- `https://<your-domain>/auth/callback`
- `http://localhost:3000/auth/callback`

### 4. Match profiles to Google addresses

For each staff member, the `profiles.email` must equal the Google account they
will use. To check:

```sql
select display_name, email, role, active from public.profiles order by role;
```

If someone's profile uses a different address than their Google account,
update it, or add their login under **Authentication → Users** and attach a
profile with `supabase/setup/04-add-user.sql`.

### 5. Test it

1. Open `/sign-in` in a private window
2. **Continue with Google** with a staff account — should land in `/admin`
3. Sign out, and try with a personal Google account that has no profile — should return to sign-in with "That account is not set up for records administration"

Step 3 is the one to actually perform. It is the check that keeps Google
sign-in from being an open door.

---

## Notes

**Password sign-in still works.** Both methods remain available. Do not remove
password sign-in — it is the fallback when Google is unreachable or an account
is locked out.

**Restricting to a domain.** If the city moves to Google Workspace on
`forsan.texas.gov`, you can require that domain rather than allowing any Google
account. Until then, the profile requirement is what limits access.

**Gmail accounts are fine.** A city using `cityofforsan@gmail.com` works
exactly the same way.

**Shared mailboxes weaken the audit trail.** If several clerks sign in with one
shared Google account, every change attributes to that one account and the
audit log can no longer answer "who published this?". Individual accounts are
worth the small extra setup for a public records system.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` | The Google client's redirect URI is not exactly `https://<ref>.supabase.co/auth/v1/callback` |
| Returns to sign-in with "not set up" | Working correctly — that Google address has no active profile |
| Lands on the wrong site after Google | The app callback is missing from Supabase's redirect allow list |
| "Google sign-in is unavailable" | The provider is not enabled in Supabase |
| Signed in but bounced from `/admin` | Profile exists but `active = false` |
