# GoHighLevel integration

Two separate jobs, deliberately kept apart:

1. Citizens see the meeting archive on the municipality's GoHighLevel website.
2. Staff can reach the administration from GoHighLevel without a second bookmark.

---

## Part 1 — The public widget

### Install it

In GoHighLevel: **Sites → Pages →** the page where the archive belongs → add a
**Custom Code** or **HTML** element → paste:

```html
<div id="government-meetings"></div>
<script src="https://records.example-city.gov/government-meetings.js" defer></script>
<script>
  window.addEventListener('load', function () {
    GovernmentMeetings.init({
      municipality: "city-of-example",
      showUpcoming: true,
      showPast: true,
      meetingsPerPage: 20
    })
  })
</script>
```

Save and publish. **Admin → Settings** shows this snippet pre-filled with your
municipality's slug and URL, ready to copy.

Nothing further is needed when a new meeting is published — the widget reads
current data on every page load.

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `municipality` | required for multi-tenant | Which city's records to show |
| `target` | `'#government-meetings'` | Selector or element to mount into |
| `showUpcoming` | `true` | Show the upcoming section |
| `showPast` | `true` | Show the past section |
| `showSearch` | `true` | Show search and category filters |
| `meetingsPerPage` | `20` | Page size for past meetings |
| `heading` | municipality setting | Override the heading text |
| `baseUrl` | the script's own origin | Point at a different deployment |

### How it avoids breaking the host page

- Everything renders inside a **shadow root**, so GoHighLevel's CSS cannot reach in and the widget's CSS cannot reach out. `:host { all: initial }` resets inherited styles.
- No global stylesheet, no CSS reset, no `!important` aimed at anything outside the mount element.
- No jQuery, no framework, no third-party code, no external fonts. One request for one file.
- If the mount element is missing, it logs one console warning and stops. It does not throw.
- If the API is unreachable, it shows a plain message and a link to the full archive, rather than an empty box.

### Accessibility

Real headings and lists; every control labelled; 44 px touch targets; visible
focus rings that survive the host page's styles; a polite live region that
announces result counts; descriptive link text
("View August 18, 2026 City Council Agenda — PDF") rather than "click here";
`prefers-reduced-motion` respected. Paging keeps the reader's place instead of
scrolling the host page to the top.

### Performance

The file is a single script with no dependencies. It fetches only what is
displayed, requests are cached for 60 seconds at the edge, and past meetings
are paged rather than loaded whole. Load it with `defer` so it never blocks
rendering of the host page.

### Iframe fallback

For hosts that will not run custom JavaScript:

```html
<iframe
  src="https://records.example-city.gov/embed?municipality=city-of-example"
  title="Meeting agendas and minutes"
  style="width:100%;border:0"
  height="900"
  loading="lazy"></iframe>
```

The widget is preferable: an iframe cannot resize itself to its content, so
the height is a guess, and its contents are excluded from search indexing.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| Nothing renders | The `<div id="government-meetings">` is missing, or the script ran before it existed. Keep the `init()` call inside a `load` listener. |
| "could not be loaded" message | The API is unreachable, or `municipality` does not match a slug |
| Wrong city's meetings | `municipality` is wrong, or omitted on a multi-tenant deployment |
| Styling looks off | Almost certainly not the widget — shadow DOM isolates it. Check for a host-page rule targeting the container `div` itself. |
| Meetings missing | They are Draft, not Published |

---

## Part 2 — Administrative access

### Add a menu link

**Settings → Custom Menu Links → Add**:

- **Name**: Agendas & Minutes Admin
- **URL**: `https://records.example-city.gov/admin`
- **Open in**: New tab
- **Visible to**: the staff who need it

### Why there is no single sign-on

Signing in to GoHighLevel does not sign anyone in here, and the menu link is a
convenience only. That is a deliberate choice:

- GoHighLevel accounts are provisioned for marketing and CRM work, not records administration. Inheriting them would mean anyone with a GHL login could reach the records system.
- Roles here are specific — a City Secretary may publish minutes; a read-only account may not — and there is no reliable mapping from GHL's roles to those.
- Disabling a GoHighLevel user would not disable their access to public records administration, which is exactly the situation an audit finds unacceptable.

If the municipality later adopts an identity provider that both systems can
trust — Google Workspace, Microsoft Entra, or another SAML/OIDC source —
Supabase Auth supports it and a single sign-on becomes reasonable. Until then,
one extra password is a small cost for keeping records administration behind
its own door.

### What staff actually experience

They click the menu link, sign in once, and their session persists for the
working day. Disabling an account takes effect on the next request, not at
token expiry, because every request re-reads the profile.
