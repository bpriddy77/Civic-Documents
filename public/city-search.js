/*!
 * City site search
 *
 * A search box that looks across the whole city website — the pages, the
 * PDFs posted on them, and every agenda and set of minutes — and answers
 * from the city's own index rather than sending residents to a search
 * engine.
 *
 *   <div id="city-search"></div>
 *   <script src="https://records.example.gov/city-search.js" defer></script>
 *   <script>
 *     window.addEventListener('load', function () {
 *       CitySearch.init({ municipality: "city-of-example" })
 *     })
 *   </script>
 *
 * Accessibility, because a search box is one of the two things on a city
 * site that must work for everyone:
 *   - A real <form> with a real <label>, so it submits on Enter and is
 *     announced correctly. Nothing here depends on a click.
 *   - Results are a list, counted in a polite live region, so a screen
 *     reader user is told how many there are rather than discovering it.
 *   - Focus moves to the result count after a search, so the next Tab
 *     lands in the results instead of back at the top of the page.
 *   - Every result is a plain link. No JavaScript is needed to follow one.
 *
 * Nothing the server returns is ever treated as markup. Titles come from
 * crawled pages and are escaped; highlights arrive as [[hl]] sentinels and
 * are turned into <mark> only after escaping, so a page whose own text
 * contains a tag cannot run anything in a resident's browser.
 *
 * STYLING
 *
 * The widget renders inside a shadow root, so the host page's stylesheet
 * cannot reach in and a site redesign can never break it. Custom
 * properties do cross that boundary, so they are how it is themed --
 * set them on the container from the site's own CSS, with no change to
 * the embed code:
 *
 *   #city-search {
 *     --cs-accent: #BEAE88;
 *     --cs-font: Georgia, serif;
 *     --cs-radius: 2px;
 *   }
 *
 * Link colour is --cs-link and defaults to --cs-accent. Set it
 * separately when the brand colour is pale: it works as a button with
 * dark text but fails contrast as link text on white.
 *
 * Every property is listed under DEFAULTS below. For anything they do
 * not cover, `css` in init() is appended last and can style anything:
 *
 *   CitySearch.init({
 *     municipality: "city-of-example",
 *     labels: { button: "Go", placeholder: "What are you looking for?" },
 *     css: ".t a { font-style: italic }"
 *   })
 */
;(function () {
  'use strict'

  if (window.CitySearch) return

  var ORIGIN = (function () {
    var s = document.currentScript
    if (s && s.src) {
      try { return new URL(s.src).origin } catch (e) { /* fall through */ }
    }
    return window.location.origin
  })()

  var LABELS = {
    label:       'Search this website',
    placeholder: 'Water rates, agendas, permits…',
    button:      'Search',
    searching:   'Searching…',
    more:        'Show more results',
    // {q} is replaced with what the resident typed, {shown} and {total}
    // with the counts.
    noResults:   'No results for “{q}”.',
    oneResult:   '1 result for “{q}”.',
    manyResults: 'Showing {shown} of {total} results for “{q}”.',
    error:       'Search is unavailable at the moment. Please try again shortly.',
    page:        'Page',
    pdf:         'PDF',
    meeting:     'Meeting',
    document:    'Document'
  }

  /**
   * Themeable properties, with their defaults.
   *
   * Declared on :host so they appear in developer tools and can be
   * overridden from the host page, since custom properties cross the
   * shadow boundary even though ordinary styles do not.
   */
  var DEFAULTS = {
    '--cs-font': 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    '--cs-size': '16px',
    '--cs-accent': '#1B3A5C',
    '--cs-accent-text': '#FFFFFF',
    // Separate from --cs-accent on purpose. A brand colour light enough
    // to need dark text on a button is usually too light to carry link
    // text on white: a pale gold reads fine as a button and fails WCAG
    // contrast as a link. Setting --cs-accent alone keeps the brand on
    // the button and leaves links legible.
    '--cs-link': 'var(--cs-accent)',
    '--cs-text': '#111827',
    '--cs-muted': '#4b5563',
    '--cs-url': '#15803d',
    '--cs-border': '#9aa4b2',
    '--cs-rule': '#e5e7eb',
    '--cs-input-bg': '#FFFFFF',
    '--cs-mark-bg': '#fde68a',
    '--cs-mark-text': 'inherit',
    '--cs-radius': '6px',
    '--cs-max-width': '760px',
    '--cs-gap': '8px',
    '--cs-kind-bg': '#f3f4f6',
    '--cs-kind-text': '#4b5563'
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  /**
   * Escape first, then allow exactly one pair of tags back in.
   *
   * The order is the whole point. The snippet is text taken off a web
   * page; escaping it first means nothing it contains can become markup,
   * and only the sentinels the database put there become <mark>.
   */
  function highlight(snippet) {
    return esc(snippet)
      .split('[[hl]]').join('<mark>')
      .split('[[/hl]]').join('</mark>')
  }

  function CitySearch(options) {
    this.options = options || {}
    this.municipality = this.options.municipality
    // The API is served by the deployment this script was loaded from, not
    // by the host page's own origin.
    this.base = this.options.baseUrl || ORIGIN
    this.perPage = this.options.perPage || 10

    // Labels, with anything the city supplied taking precedence. Done
    // once here so every call site reads this.text.something.
    this.text = {}
    for (var key in LABELS) {
      if (Object.prototype.hasOwnProperty.call(LABELS, key)) this.text[key] = LABELS[key]
    }
    var given = this.options.labels || {}
    for (var k in given) {
      if (Object.prototype.hasOwnProperty.call(given, k) && typeof given[k] === 'string') {
        this.text[k] = given[k]
      }
    }
    this.page = 1
    this.query = ''
    this.seq = 0
    this.mount(this.options.target || 'city-search')
  }

  CitySearch.prototype.mount = function (target) {
    var el = typeof target === 'string' ? document.getElementById(target) : target
    if (!el) return
    this.root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el
    this.render()
    this.wire()
    if (this.options.query) {
      this.input.value = this.options.query
      this.search(this.options.query)
    }
  }

  CitySearch.prototype.render = function () {
    // A declaration block of the defaults, so every property is visible
    // in developer tools and overridable from the host page.
    var vars = ''
    for (var name in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
        vars += name + ':' + DEFAULTS[name] + ';'
      }
    }
    // Kept for the sites already using it; --cs-accent is the way now.
    if (this.options.accentColor) vars += '--cs-accent:' + this.options.accentColor + ';'

    var style = [
      ':host{all:initial;' + vars + '}',
      '*{box-sizing:border-box}',
      '.w{font-family:var(--cs-font);font-size:var(--cs-size);line-height:1.6;',
      '   color:var(--cs-text);max-width:var(--cs-max-width)}',
      'form{display:flex;gap:var(--cs-gap);align-items:stretch}',
      'label{display:block;font-weight:600;margin-bottom:6px}',
      'input{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--cs-border);',
      '      border-radius:var(--cs-radius);background:var(--cs-input-bg);color:inherit}',
      'input:focus-visible,button:focus-visible,a:focus-visible{',
      '  outline:3px solid var(--cs-accent);outline-offset:2px}',
      'button{font:inherit;font-weight:600;padding:11px 18px;border:0;',
      '       border-radius:var(--cs-radius);background:var(--cs-accent);',
      '       color:var(--cs-accent-text);cursor:pointer}',
      'button:hover{filter:brightness(1.12)}',
      '.count{margin:18px 0 10px;color:var(--cs-muted)}',
      '.count:focus{outline:none}',
      'ol{list-style:none;margin:0;padding:0}',
      'li{padding:14px 0;border-top:1px solid var(--cs-rule)}',
      '.t{font-size:1.06em;font-weight:600;margin:0 0 2px}',
      '.t a{color:var(--cs-link);text-decoration:underline;text-underline-offset:2px}',
      '.u{font-size:.82em;color:var(--cs-url);word-break:break-all;margin:0 0 4px}',
      '.s{margin:0;color:var(--cs-text)}',
      'mark{background:var(--cs-mark-bg);color:var(--cs-mark-text);padding:0 1px}',
      '.kind{display:inline-block;font-size:.75em;font-weight:700;letter-spacing:.04em;',
      '  text-transform:uppercase;color:var(--cs-kind-text);background:var(--cs-kind-bg);',
      '  border-radius:3px;padding:1px 6px;margin-right:6px}',
      '.more{margin-top:18px}',
      '.more button{background:transparent;color:var(--cs-link);',
      '             border:1px solid var(--cs-border)}',
      // Anything the city supplies goes last so it wins without !important.
      this.options.css || ''
    ].join('')

    var html =
      '<style>' + style + '</style>' +
      '<div class="w">' +
      '  <form novalidate>' +
      '    <div style="flex:1;min-width:0">' +
      '      <label for="q">' + esc(this.text.label) + '</label>' +
      '      <input id="q" type="search" name="q" autocomplete="off"' +
      '             placeholder="' + esc(this.text.placeholder) + '">' +
      '    </div>' +
      '    <div style="display:flex;align-items:flex-end">' +
      '      <button type="submit">' + esc(this.text.button) + '</button>' +
      '    </div>' +
      '  </form>' +
      '  <p class="count" id="count" tabindex="-1" role="status" aria-live="polite"></p>' +
      '  <ol id="results"></ol>' +
      '  <div class="more" id="more"></div>' +
      '</div>'

    if (this.root.innerHTML !== undefined) this.root.innerHTML = html
    this.form = this.root.querySelector('form')
    this.input = this.root.querySelector('#q')
    this.count = this.root.querySelector('#count')
    this.list = this.root.querySelector('#results')
    this.moreBox = this.root.querySelector('#more')
  }

  /** Fills {q}, {shown} and {total} in a label. */
  function fill(template, values) {
    return String(template).replace(/\{(q|shown|total)\}/g, function (_, key) {
      return values[key] == null ? '' : String(values[key])
    })
  }

  CitySearch.prototype.wire = function () {
    var self = this
    this.form.addEventListener('submit', function (event) {
      event.preventDefault()
      self.page = 1
      self.list.innerHTML = ''
      self.search(self.input.value)
    })
  }

  CitySearch.prototype.search = function (query) {
    var self = this
    this.query = String(query || '').trim()
    if (!this.query) {
      this.list.innerHTML = ''
      this.moreBox.innerHTML = ''
      this.count.textContent = ''
      return
    }

    // A slow reply to an earlier search must never overwrite a later one.
    var ticket = ++this.seq
    this.count.textContent = this.text.searching

    var url = this.base + '/api/public/search' +
      '?municipality=' + encodeURIComponent(this.municipality) +
      '&q=' + encodeURIComponent(this.query) +
      '&page=' + this.page +
      '&perPage=' + this.perPage

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json() })
      .then(function (body) {
        if (ticket !== self.seq) return
        var data = body && body.data
        if (!data) throw new Error('no data')
        self.show(data)
      })
      .catch(function () {
        if (ticket !== self.seq) return
        self.count.textContent = self.text.error
        self.moreBox.innerHTML = ''
      })
  }

  CitySearch.prototype.show = function (data) {
    var results = data.results || []
    var total = (data.pagination && data.pagination.total) || 0
    var self = this

    if (!total) {
      this.count.textContent = fill(this.text.noResults, { q: this.query })
      this.list.innerHTML = ''
      this.moreBox.innerHTML = ''
      this.count.focus()
      return
    }

    var shown = this.list.children.length + results.length
    this.count.textContent = fill(
      total === 1 ? this.text.oneResult : this.text.manyResults,
      { q: this.query, shown: shown, total: total })

    for (var i = 0; i < results.length; i += 1) {
      var r = results[i]
      var li = document.createElement('li')
      // Titles and addresses are escaped; only the snippet's own
      // sentinels become markup.
      li.innerHTML =
        '<p class="t"><a href="' + esc(r.url) + '">' + esc(r.title) + '</a></p>' +
        '<p class="u">' + esc(r.url) + '</p>' +
        '<p class="s"><span class="kind">' + esc(this.text[r.source] || r.source) + '</span>' +
        highlight(r.snippet) + '</p>'
      this.list.appendChild(li)
    }

    this.moreBox.innerHTML = ''
    if (shown < total) {
      var button = document.createElement('button')
      button.type = 'button'
      button.textContent = this.text.more
      button.addEventListener('click', function () {
        self.page += 1
        self.search(self.query)
      })
      this.moreBox.appendChild(button)
    }

    // Only on the first page: moving focus on "show more" would throw the
    // reader back to the top of a list they were already reading.
    if (this.page === 1) this.count.focus()
  }

  window.CitySearch = {
    init: function (options) {
      if (!options || !options.municipality) {
        return console.error('CitySearch.init needs a municipality.')
      }
      function start() { new CitySearch(options) }
      // The page builder runs its tracking code after `load` has fired, so
      // waiting for an event that already happened would never start.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start)
      } else {
        start()
      }
    }
  }
})()
