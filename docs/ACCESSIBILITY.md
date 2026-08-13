# Accessibility

Target: **WCAG 2.2 Level AA**.

For a municipal system this is not a preference. Under Title II of the ADA and
Section 508, a city's public-facing web content is expected to meet WCAG 2.1 AA
at minimum; 2.2 AA is the current version and the sensible target for anything
built now. More to the point, a resident who cannot read an agenda cannot
participate in the meeting it announces.

Automated testing catches perhaps a third of what matters. The manual checks in
this document cover the rest.

---

## What the system does

### Structure and semantics

One `<h1>` per page, headings in order with no skipped levels. Meeting lists
are `<ul>`/`<li>`; agenda and minutes pairs are `<dl>`. Landmarks —
`<header>`, `<nav>`, `<main>`, `<footer>` — on every page, each `<nav>`
labelled. A skip link is the first focusable element and becomes visible on
focus.

Filter controls are a real `<form>` using GET, so the public archive works
with JavaScript disabled and every filtered view is a linkable, bookmarkable
URL.

### Keyboard

Everything reachable and operable by keyboard, in an order that matches the
visual layout. Focus indicators are a 3px outline with 2px offset, never
removed. No keyboard traps. Nothing depends on hover or on a pointer.

Focus is managed, not left to chance: dialogs move focus in and restore it on
close; after a filter is applied, focus moves to the results heading so a
screen-reader user is not returned to the top of the page.

Paging in the embedded widget keeps the reader's position rather than
scrolling the host page to the top.

### Screen readers

Every control has a name. Link text is descriptive:
"View August 18, 2026 City Council Agenda — PDF", not "click here" — because
screen-reader users routinely navigate by pulling up a list of links, where
twelve identical "click here" entries are useless.

PDF links say so, so nobody is surprised by a file download. Result counts and
form errors are announced through polite live regions. Decorative marks are
`aria-hidden`. Status is never conveyed by colour alone — an approved-minutes
badge carries its own text.

### Colour and contrast

The palette was chosen against the requirement, not adjusted afterwards.

| Pair | Ratio | Requirement |
| --- | --- | --- |
| Ink `#14202E` on paper `#FFFFFF` | 15.8:1 | 4.5:1 |
| Muted `#4A5866` on paper | 7.4:1 | 4.5:1 |
| Paper on civic navy `#1B3A5C` | 10.4:1 | 4.5:1 |
| Approved `#1B5E3A` on paper | 6.3:1 | 4.5:1 |
| Pending `#8A5A00` on paper | 5.6:1 | 4.5:1 |
| Rule `#D2D8D6` on paper | 3.1:1 | 3:1 (non-text) |

### Forms

Every field has a visible `<label>`, associated by `for`/`id` — not a
placeholder standing in for one. Required fields are marked in text as well as
by `aria-required`. Errors appear next to the field they concern, are linked
by `aria-describedby`, and are also summarised at the top of the form with
links to each field. Error messages say what to do: "Enter a meeting date"
rather than "Invalid input".

Related controls are grouped in `<fieldset>` with a `<legend>`.

### Target size and layout

Interactive targets are at least 44×44 px (WCAG 2.2 SC 2.5.8 requires 24×24;
44 is the comfortable figure and the one this system uses). Layout reflows to
320 px with no horizontal scrolling, and remains usable at 200% zoom.

Nothing animates beyond a short transition, and `prefers-reduced-motion` is
respected.

### WCAG 2.2 specifics

The criteria added in 2.2 are worth naming, because they are the ones most
recently built systems miss:

- **2.4.11 Focus Not Obscured** — no sticky header overlaps a focused element
- **2.5.7 Dragging Movements** — nothing requires dragging
- **2.5.8 Target Size** — 44 px, above the 24 px minimum
- **3.2.6 Consistent Help** — contact information sits in the same place on every page
- **3.3.7 Redundant Entry** — filter values persist across pagination; the meeting form retains entries after a validation error
- **3.3.8 Accessible Authentication** — password managers and paste are supported; no puzzle, no cognitive test

---

## The PDF problem

This system controls its own interface. It cannot control what a clerk uploads,
and a scanned agenda is an image — invisible to a screen reader and unsearchable.

So it helps rather than ignores: uploads with no embedded fonts are flagged as
probably scanned, and the clerk is shown a notice explaining that the document
likely needs OCR before it meets the city's obligations.

Guidance to pass on to whoever produces the documents:

- Export from Word or Google Docs rather than scanning, whenever the original is digital
- If scanning is unavoidable, run OCR (Adobe Acrobat, ABBYY FineReader, or `ocrmypdf`)
- Use real heading styles, not bold text sized up
- Give tables header rows; give images alt text
- Set the document language and title in the PDF properties
- Check with Acrobat's built-in accessibility checker before uploading

A city that treats this as optional will eventually receive a complaint about
it, and the complaint will be correct.

---

## Testing

### Automated

```bash
npm run test:e2e     # Playwright + axe-core, desktop and mobile
```

Runs in CI on every pull request. Covers contrast, labelling, structure, and
landmark use, and asserts no horizontal scroll at phone width or at 200% zoom.
Treat a clean run as a floor, not a certificate.

### Manual, before each release

**Keyboard, no mouse.** Tab through the public archive and the admin meeting
form. Confirm focus is always visible, order is logical, everything is
reachable, and nothing traps.

**Screen reader.** VoiceOver (⌘F5 on macOS) or NVDA on Windows. Navigate by
heading, then by link. Confirm the page structure makes sense from headings
alone, and that link text identifies its document without surrounding context.

**Zoom.** 200% browser zoom, then 400%. Nothing cut off, nothing overlapping,
no horizontal scrolling.

**Phone.** Real device, portrait. Nothing scrolls sideways; every tap target is
comfortable.

**Colour.** Grayscale the display and confirm no status is ambiguous.

### Tools

- axe DevTools browser extension, for spot checks during development
- WAVE (wave.webaim.org), for a second opinion
- Lighthouse accessibility audit, in Chrome DevTools
- WebAIM Contrast Checker, when adding any colour

---

## Known limitations

**Uploaded PDFs.** The system flags likely-scanned documents but cannot remediate
them. Document accessibility remains the responsibility of whoever produces the
document.

**The iframe fallback.** Fixed height, because an iframe cannot size itself to
its content. Prefer the widget.

**Third-party embedding.** Once the widget renders inside GoHighLevel, the host
page's own heading structure and landmarks are outside this system's control.
The widget contributes correct semantics; it cannot repair the page around it.

---

## Statement for the municipality's website

Adapt and publish:

> The City of Example is committed to ensuring that its meeting agendas and
> minutes are accessible to all residents. This system is designed to meet
> WCAG 2.2 Level AA. If you encounter a barrier, or need a meeting document in
> an alternative format, contact the City Secretary at [email] or [phone] and
> we will provide it promptly and at no cost.

The last clause matters. It is both the legal expectation and the honest
answer for a scanned document from 1997.
