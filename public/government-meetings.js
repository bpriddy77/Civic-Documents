/*!
 * Government Meetings widget
 *
 * Embeds the public meeting archive into any host page, including a
 * GoHighLevel site:
 *
 *   <div id="government-meetings"></div>
 *   <script src="https://records.example-city.gov/government-meetings.js" defer></script>
 *   <script>
 *     GovernmentMeetings.init({ municipality: "city-of-example" })
 *   </script>
 *
 * Everything renders inside a shadow root, so the host page's CSS cannot
 * reach in and the widget's CSS cannot reach out. No global styles are
 * registered, no fonts are fetched, no third-party code is loaded, and
 * nothing outside the mount element is touched.
 */
;(function () {
  'use strict'

  if (window.GovernmentMeetings) return

  var SCRIPT_ORIGIN = (function () {
    var script = document.currentScript
    if (script && script.src) {
      try {
        return new URL(script.src).origin
      } catch (error) {
        /* fall through */
      }
    }
    return window.location.origin
  })()

  var DEFAULTS = {
    target: '#government-meetings',
    municipality: null,
    showUpcoming: true,
    showPast: true,
    showSearch: true,
    meetingsPerPage: 20,
    baseUrl: SCRIPT_ORIGIN,
    heading: null,
  }

  var STYLES = [
    ':host { all: initial; display: block; color: #14202E;',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;',
    '  font-size: 16px; line-height: 1.6; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    '.gm-root { max-width: 64rem; margin: 0 auto; }',
    '.gm-heading { font-family: "Iowan Old Style", Palatino, Georgia, serif;',
    '  font-size: 1.5rem; font-weight: 600; margin: 0 0 .25rem; }',
    '.gm-sub { color: #4A5866; margin: 0 0 1.25rem; font-size: .95rem; }',
    '.gm-filters { display: grid; gap: .75rem; grid-template-columns: 1fr;',
    '  padding: 1rem; background: #F4F6F5; border: 1px solid #D2D8D6; border-radius: 3px; }',
    '@media (min-width: 40rem) { .gm-filters { grid-template-columns: 2fr 1fr auto; align-items: end; } }',
    '.gm-field label { display: block; font-size: .8rem; font-weight: 600; margin-bottom: .25rem; }',
    '.gm-field input, .gm-field select { width: 100%; min-height: 44px; padding: .5rem .625rem;',
    '  border: 1px solid #A9B2B0; border-radius: 3px; font: inherit; color: inherit; background: #fff; }',
    '.gm-btn { min-height: 44px; padding: .5rem 1rem; border-radius: 3px; font: inherit;',
    '  font-weight: 600; cursor: pointer; border: 1px solid #1B3A5C; background: #1B3A5C; color: #fff; }',
    '.gm-btn.gm-secondary { background: #fff; color: #1B3A5C; border-color: #A9B2B0; }',
    '.gm-btn:hover { background: #132A44; color: #fff; }',
    '.gm-btn.gm-secondary:hover { background: #EAF0F6; color: #1B3A5C; }',
    '.gm-section { margin-top: 2rem; }',
    '.gm-section h3 { font-family: "Iowan Old Style", Palatino, Georgia, serif;',
    '  font-size: 1.25rem; font-weight: 600; margin: 0 0 .5rem; }',
    '.gm-list { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid #D2D8D6; }',
    '.gm-item { display: grid; gap: .25rem 1.25rem; grid-template-columns: 1fr;',
    '  padding: 1.1rem 0; border-top: 1px solid #D2D8D6; }',
    '@media (min-width: 40rem) { .gm-item { grid-template-columns: 9.5rem 1fr; } }',
    '.gm-when { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-weight: 600; }',
    '.gm-eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: .72rem;',
    '  font-weight: 700; color: #4A5866; margin: 0; }',
    '.gm-title { font-size: 1.05rem; font-weight: 600; margin: .15rem 0 .25rem; }',
    '.gm-title a { color: #14202E; text-decoration: none; }',
    '.gm-title a:hover { text-decoration: underline; }',
    '.gm-meta { color: #4A5866; font-size: .9rem; margin: 0 0 .5rem; }',
    '.gm-docs { display: flex; flex-wrap: wrap; gap: .35rem 1.75rem; font-size: .95rem; margin: 0; }',
    '.gm-docs dt { font-weight: 600; display: inline; }',
    '.gm-docs dd { display: inline; margin: 0 0 0 .35rem; }',
    '.gm-docs .gm-pair { display: flex; gap: .35rem; align-items: baseline; }',
    '.gm-muted { color: #4A5866; }',
    'a { color: #1B3A5C; }',
    '.gm-pager { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center;',
    '  margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #D2D8D6; }',
    '.gm-note { padding: 1.25rem; border: 1px dashed #A9B2B0; border-radius: 3px;',
    '  background: #F4F6F5; color: #4A5866; }',
    '.gm-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;',
    '  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }',
    ':focus-visible { outline: 3px solid #1B3A5C; outline-offset: 2px; }',
    '@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }',
  ].join('\n')

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
    })
  }

  function Widget(options) {
    this.options = Object.assign({}, DEFAULTS, options || {})
    this.state = { q: '', category: '', page: 1, loading: true, error: null, data: null, config: null }
    this.mount()
  }

  Widget.prototype.mount = function () {
    var host =
      typeof this.options.target === 'string'
        ? document.querySelector(this.options.target)
        : this.options.target

    if (!host) {
      // Fail quietly on the host page rather than throwing into their console noise.
      if (window.console) console.warn('[GovernmentMeetings] mount element not found')
      return
    }

    this.host = host
    this.root = host.shadowRoot || host.attachShadow({ mode: 'open' })

    var style = document.createElement('style')
    style.textContent = STYLES
    this.root.innerHTML = ''
    this.root.appendChild(style)

    this.container = document.createElement('div')
    this.container.className = 'gm-root'
    this.root.appendChild(this.container)

    this.render()
    this.load()
  }

  Widget.prototype.api = function (path, params) {
    var url = new URL(this.options.baseUrl + path)
    if (this.options.municipality) url.searchParams.set('municipality', this.options.municipality)
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== '' && params[key] != null) url.searchParams.set(key, params[key])
    })
    return fetch(url.toString(), { credentials: 'omit', headers: { Accept: 'application/json' } }).then(
      function (response) {
        if (!response.ok) throw new Error('request failed')
        return response.json()
      },
    )
  }

  Widget.prototype.load = function () {
    var self = this
    this.state.loading = true
    this.render()

    var filtering = Boolean(this.state.q || this.state.category)
    var requests = [this.api('/api/public/categories', {})]

    if (this.options.showUpcoming && !filtering) {
      requests.push(this.api('/api/public/meetings', { scope: 'upcoming', sort: 'soonest', perPage: 25 }))
    } else {
      requests.push(Promise.resolve(null))
    }

    if (this.options.showPast || filtering) {
      requests.push(
        this.api('/api/public/meetings', {
          scope: filtering ? 'all' : 'past',
          q: this.state.q,
          category: this.state.category,
          page: this.state.page,
          perPage: this.options.meetingsPerPage,
        }),
      )
    } else {
      requests.push(Promise.resolve(null))
    }

    Promise.all(requests)
      .then(function (results) {
        self.state.loading = false
        self.state.error = null
        self.state.config = results[0].data
        self.state.upcoming = results[1] ? results[1].data : null
        self.state.past = results[2] ? results[2].data : null
        self.render()
      })
      .catch(function () {
        self.state.loading = false
        self.state.error =
          'Meeting information could not be loaded right now. Refresh the page, or view the archive directly.'
        self.render()
      })
  }

  Widget.prototype.render = function () {
    if (!this.container) return

    var archiveUrl = this.options.baseUrl + '/meetings'
    var heading =
      this.options.heading ||
      (this.state.config && this.state.config.municipality
        ? this.state.config.municipality.archive_heading
        : 'Meeting agendas & minutes')

    var html = ''
    html += '<h2 class="gm-heading">' + escapeHtml(heading) + '</h2>'
    html +=
      '<p class="gm-sub">Agendas are posted before each meeting. Minutes are posted once approved. ' +
      'All documents open as PDF files.</p>'

    if (this.options.showSearch) {
      html += this.renderFilters()
    }

    html += '<p class="gm-sr" role="status" aria-live="polite">' + this.statusText() + '</p>'

    if (this.state.error) {
      html +=
        '<p class="gm-note">' +
        escapeHtml(this.state.error) +
        ' <a href="' +
        escapeHtml(archiveUrl) +
        '">Open the full meeting archive</a>.</p>'
    } else if (this.state.loading) {
      html += '<p class="gm-note">Loading meetings…</p>'
    } else {
      var filtering = Boolean(this.state.q || this.state.category)

      if (this.state.upcoming && !filtering) {
        html += this.renderSection('Upcoming meetings', this.state.upcoming.meetings, 'No upcoming meetings are scheduled right now.')
      }
      if (this.state.past) {
        html += this.renderSection(
          filtering ? 'Search results' : 'Past meetings',
          this.state.past.meetings,
          filtering
            ? 'No meetings match this search. Try a different word, or clear the filters.'
            : 'No past meetings have been posted yet.',
        )
        html += this.renderPager()
      }
    }

    this.container.innerHTML = html
    this.bind()
  }

  Widget.prototype.statusText = function () {
    if (this.state.loading) return 'Loading meetings.'
    if (this.state.error) return this.state.error
    var count = (this.state.past && this.state.past.pagination.total) || 0
    var upcoming = (this.state.upcoming && this.state.upcoming.meetings.length) || 0
    return count + ' past ' + (count === 1 ? 'meeting' : 'meetings') + ', ' + upcoming + ' upcoming.'
  }

  Widget.prototype.renderFilters = function () {
    var categories = (this.state.config && this.state.config.categories) || []
    var options = ['<option value="">All categories</option>']
    for (var i = 0; i < categories.length; i += 1) {
      options.push(
        '<option value="' +
          escapeHtml(categories[i].slug) +
          '"' +
          (this.state.category === categories[i].slug ? ' selected' : '') +
          '>' +
          escapeHtml(categories[i].name) +
          '</option>',
      )
    }

    return (
      '<form class="gm-filters" data-gm-form>' +
      '<div class="gm-field"><label for="gm-q">Search meetings</label>' +
      '<input id="gm-q" name="q" type="search" value="' +
      escapeHtml(this.state.q) +
      '" placeholder="Title, description, or location"></div>' +
      '<div class="gm-field"><label for="gm-category">Category</label>' +
      '<select id="gm-category" name="category">' +
      options.join('') +
      '</select></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
      '<button type="submit" class="gm-btn">Search</button>' +
      (this.state.q || this.state.category
        ? '<button type="button" class="gm-btn gm-secondary" data-gm-clear>Clear</button>'
        : '') +
      '</div></form>'
    )
  }

  Widget.prototype.renderSection = function (title, meetings, emptyMessage) {
    var id = 'gm-' + title.toLowerCase().replace(/[^a-z]+/g, '-')
    var html = '<section class="gm-section" aria-labelledby="' + id + '"><h3 id="' + id + '">' + escapeHtml(title) + '</h3>'

    if (!meetings || meetings.length === 0) {
      return html + '<p class="gm-note">' + escapeHtml(emptyMessage) + '</p></section>'
    }

    html += '<ul class="gm-list">'
    for (var i = 0; i < meetings.length; i += 1) {
      html += this.renderMeeting(meetings[i])
    }
    return html + '</ul></section>'
  }

  Widget.prototype.renderMeeting = function (meeting) {
    var agenda = null
    var minutes = null
    for (var i = 0; i < meeting.documents.length; i += 1) {
      if (meeting.documents[i].type === 'agenda') agenda = meeting.documents[i]
      if (meeting.documents[i].type === 'minutes') minutes = meeting.documents[i]
    }

    var minutesLabels = {
      not_available: 'Not yet available',
      draft: 'In preparation',
      pending_approval: 'Pending approval',
      approved: 'Approved',
    }

    var agendaCell = agenda
      ? '<a href="' +
        escapeHtml(agenda.url) +
        '" aria-label="View ' +
        escapeHtml(meeting.display_when + ' ' + meeting.title) +
        ' Agenda — PDF">View agenda (PDF)</a>'
      : '<span class="gm-muted">Not yet posted</span>'

    var minutesCell = minutes
      ? '<a href="' +
        escapeHtml(minutes.url) +
        '" aria-label="View ' +
        escapeHtml(
          meeting.display_when +
            ' ' +
            (meeting.minutes_status === 'approved' ? 'Approved ' : '') +
            meeting.title,
        ) +
        ' Minutes — PDF">View ' +
        (meeting.minutes_status === 'approved' ? 'approved ' : '') +
        'minutes (PDF)</a>'
      : '<span class="gm-muted">' +
        escapeHtml(minutesLabels[meeting.minutes_status] || 'Not yet available') +
        '</span>'

    return (
      '<li class="gm-item">' +
      '<div class="gm-when"><time datetime="' +
      escapeHtml(meeting.starts_at) +
      '">' +
      escapeHtml(meeting.display_when) +
      '</time></div>' +
      '<div>' +
      '<p class="gm-eyebrow">' +
      escapeHtml(meeting.category ? meeting.category.name : 'Meeting') +
      '</p>' +
      '<p class="gm-title"><a href="' +
      escapeHtml(meeting.url) +
      '">' +
      escapeHtml(meeting.title) +
      '</a></p>' +
      (meeting.location ? '<p class="gm-meta">' + escapeHtml(meeting.location) + '</p>' : '') +
      '<dl class="gm-docs">' +
      '<div class="gm-pair"><dt>Agenda:</dt><dd>' +
      agendaCell +
      '</dd></div>' +
      '<div class="gm-pair"><dt>Minutes:</dt><dd>' +
      minutesCell +
      '</dd></div>' +
      '</dl></div></li>'
    )
  }

  Widget.prototype.renderPager = function () {
    if (!this.state.past) return ''
    var pagination = this.state.past.pagination
    if (pagination.page_count <= 1) return ''

    var html = '<nav class="gm-pager" aria-label="Meeting archive pages">'
    if (pagination.page > 1) {
      html += '<button type="button" class="gm-btn gm-secondary" data-gm-page="' + (pagination.page - 1) + '">Previous page</button>'
    }
    html += '<span class="gm-btn gm-secondary" aria-current="page">Page ' + pagination.page + ' of ' + pagination.page_count + '</span>'
    if (pagination.page < pagination.page_count) {
      html += '<button type="button" class="gm-btn gm-secondary" data-gm-page="' + (pagination.page + 1) + '">Next page</button>'
    }
    return html + '</nav>'
  }

  Widget.prototype.bind = function () {
    var self = this
    var form = this.root.querySelector('[data-gm-form]')

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        self.state.q = form.querySelector('#gm-q').value.trim()
        self.state.category = form.querySelector('#gm-category').value
        self.state.page = 1
        self.load()
      })
    }

    var clear = this.root.querySelector('[data-gm-clear]')
    if (clear) {
      clear.addEventListener('click', function () {
        self.state.q = ''
        self.state.category = ''
        self.state.page = 1
        self.load()
      })
    }

    var pageButtons = this.root.querySelectorAll('[data-gm-page]')
    for (var i = 0; i < pageButtons.length; i += 1) {
      pageButtons[i].addEventListener('click', function (event) {
        self.state.page = Number(event.currentTarget.getAttribute('data-gm-page'))
        self.load()
        // Keep the reader's place rather than jumping the host page to the top.
        var section = self.root.querySelector('.gm-section:last-of-type h3')
        if (section) section.scrollIntoView({ block: 'start' })
      })
    }
  }

  window.GovernmentMeetings = {
    init: function (options) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          new Widget(options)
        })
        return
      }
      return new Widget(options)
    },
  }
})()
