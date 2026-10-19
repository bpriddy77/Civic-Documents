# Website search

A search box for the city's whole public website: the pages, the PDFs posted
on them, and every agenda and set of minutes published here.

Residents look for things by searching, not by navigating a menu. A small city
site has no search at all unless something provides one, and a search engine is
a poor substitute — it will not have an agenda posted an hour ago, and for a
new `.gov` it may not have indexed anything yet.

---

## Turning it on

1. **Settings → Website search** → tick *Website search is active*.
2. Paste the search box code onto a page. It is shown on **Website search** in
   the admin, with the municipality already filled in.
3. Wait for the overnight crawl, or run it on demand from the Actions tab.

Agendas and minutes are searchable immediately — they do not wait for a crawl.

While the setting is off, the search box returns nothing to anyone, including
on a page that already has the code installed. That is enforced in the
database, not in the widget, because the widget is a public file that anyone
can read and call directly.

---

## What gets indexed

| Source | How it arrives | When |
| --- | --- | --- |
| Agendas, minutes, other documents | Written by the database when published | Immediately |
| Meetings | Written by the database when published | Immediately |
| Website pages | Crawled from `sitemap.xml` | Overnight |
| PDFs posted on the website | Crawled and read | Overnight |

Nothing private is ever indexed. A draft meeting and a set of minutes the
council has not approved are not in the index at all — not hidden from
results, absent. The index uses the same visibility rule as the public API and
the row-level security policy, so there is one definition of "public" and the
search box cannot drift from it.

Unpublishing a meeting, retiring a document, or un-approving minutes removes
the entry immediately.

---

## The crawl

Runs nightly at 07:00 UTC, roughly 1am Central, so a page edited during the
working day is searchable the next morning.

It reads `sitemap.xml` from the city's website — GoHighLevel generates one
automatically — and follows a sitemap index if there is one. Anything
`robots.txt` asks crawlers to skip is skipped.

**Run it now:** Actions → Nightly site crawl → *Run workflow*. It takes a
single city's slug, and a dry-run option that reports what it would index
without writing anything.

Requires two repository secrets, the same ones the backup workflow uses:
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Why pages are read the way they are

Every page of a site built in a page builder carries the same header,
navigation and footer. Indexed as-is, every page contains the words from every
menu item, so a search for "water" matches all thirty pages and ranks none of
them — a search box that confidently returns everything is worse than no
search box.

So the crawler indexes the whole site first, then discards the blocks of text
that appear on most pages. Repetition is what site furniture *is*, which makes
this work on any site and survive a redesign. Guessing at CSS selectors would
need tuning per city and would break the first time a theme changed.

On a site of three pages or fewer this step is skipped: with that little to
compare, everything looks repeated and stripping it would leave nothing.

---

## Scanned PDFs

A scanned PDF is a photograph of a page. There is no text in it, so there is
nothing to search.

The same fact matters far more elsewhere: a scan cannot be read by a screen
reader either. A resident who is blind cannot read that ordinance at all.

The **Website search** admin page counts these and lists them after each
crawl. Saving the PDF directly from Word instead of scanning a printout fixes
both problems at once, and is the single most valuable accessibility habit for
a city posting documents.

---

## Customising the search box

The widget renders inside a shadow root, so the site's own stylesheet cannot
reach into it and a redesign can never break it. Custom properties *do* cross
that boundary, and they are how it is themed — set them on the container from
the site's CSS, with no change to the embed code.

```css
#city-search {
  --cs-accent: #BEAE88;
  --cs-link: #6B5B2E;
  --cs-font: Georgia, serif;
  --cs-radius: 2px;
}
```

| Property | Default | Controls |
| --- | --- | --- |
| `--cs-font` | system sans-serif | Typeface |
| `--cs-size` | `16px` | Base size; everything else scales from it |
| `--cs-accent` | `#1B3A5C` | Button background and focus ring |
| `--cs-accent-text` | `#FFFFFF` | Button text |
| `--cs-link` | `--cs-accent` | Result links |
| `--cs-text` | `#111827` | Body text |
| `--cs-muted` | `#4b5563` | Result count |
| `--cs-url` | `#15803d` | The address under each result |
| `--cs-border` | `#9aa4b2` | Input border |
| `--cs-rule` | `#e5e7eb` | Lines between results |
| `--cs-input-bg` | `#FFFFFF` | Search field background |
| `--cs-mark-bg` | `#fde68a` | Highlight behind matched words |
| `--cs-mark-text` | `inherit` | Highlighted text |
| `--cs-radius` | `6px` | Corner rounding |
| `--cs-max-width` | `760px` | Width of the whole block |
| `--cs-gap` | `8px` | Space between field and button |
| `--cs-kind-bg` | `#f3f4f6` | PAGE / PDF tag background |
| `--cs-kind-text` | `#4b5563` | PAGE / PDF tag text |

**`--cs-link` is separate from `--cs-accent` deliberately.** A brand colour
pale enough to need dark text on a button is usually too pale for link text on
white. A light gold reads well as a button and fails WCAG contrast as a link.
Setting `--cs-accent` alone keeps the brand on the button and leaves links
legible; set `--cs-link` to a darker shade of the same hue when you want both.

### Wording

Every piece of text can be replaced. `{q}` is what the resident typed,
`{shown}` and `{total}` are the counts.

```html
<script>
  CitySearch.init({
    municipality: "city-of-example",
    labels: {
      label:       "Find something on this site",
      placeholder: "Try “water deposit”",
      button:      "Go",
      searching:   "Looking…",
      noResults:   "Nothing found for “{q}”. Try fewer words.",
      oneResult:   "1 match for “{q}”.",
      manyResults: "Showing {shown} of {total} matches for “{q}”.",
      more:        "More results",
      error:       "Search is unavailable just now.",
      page: "Page", pdf: "PDF", meeting: "Meeting", document: "Document"
    }
  });
</script>
```

### Anything else

`css` is appended after everything the widget defines, so it wins without
`!important`:

```js
CitySearch.init({
  municipality: "city-of-example",
  css: ".kind { display: none } .u { display: none }"
});
```

That example hides the PAGE / PDF tag and the address under each result.

### Other options

| Option | Default | Meaning |
| --- | --- | --- |
| `municipality` | required | The city's slug |
| `target` | `city-search` | Id of the element to render into |
| `perPage` | `10` | Results per page |
| `query` | none | Run a search immediately on load |
| `baseUrl` | where the script came from | Override only if the records system is on another domain |

---

## Accessibility

The search box is one of the two things on a city site that has to work for
everyone, so:

- It is a real `<form>` with a real `<label>`. Enter submits it; nothing
  depends on a mouse.
- Results are a list, and the count is announced in a polite live region, so a
  screen-reader user is told how many there are rather than discovering it.
- Focus moves to the count after a search, so the next Tab lands in the
  results. It does not move on *Show more*, which would throw a reader back to
  the top of a list they were reading.
- Every result is an ordinary link.
- The focus ring is explicit and uses the accent colour.

Checked with axe against WCAG 2.1 A and AA: no violations.

**One thing to check yourself:** if you change the colours, check the contrast
of `--cs-link` against the page background. 4.5:1 is the AA threshold for body
text. Everything else in the widget passes at the defaults, but a brand colour
chosen for a logo often does not.

---

## Privacy

What a resident types is sent to this system in order to answer, and is not
stored. There is no search log, no per-resident history, and no third party
involved — no analytics service sees the query, and no search engine learns
what residents of a small town are looking up at City Hall's website.

If you later want to know what people search for in order to fix the
navigation, that is worth adding deliberately, with a retention period and a
note in the privacy policy. It should not appear by accident.
