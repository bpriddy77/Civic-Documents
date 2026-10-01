/*!
 * City alert banner
 *
 * Shows an urgent notice at the very top of every page, and nothing at all
 * when there is no alert.
 *
 *   <script src="https://records.example.gov/city-alert.js" defer></script>
 *   <script>
 *     window.addEventListener('load', function () {
 *       CityAlert.init({ municipality: "city-of-example" })
 *     })
 *   </script>
 *
 * With no active alert this renders nothing and touches no part of the host
 * page — the cost of having it installed permanently is one small request.
 *
 * Accessibility notes, because this is the one element nobody can look away
 * from:
 *   - The text scrolls only when it is too long to fit, and a pause control
 *     is always present (WCAG 2.2.2 requires a way to stop moving content).
 *   - `prefers-reduced-motion` renders it static. Scrolling text can trigger
 *     vestibular symptoms.
 *   - It is announced politely rather than assertively: an emergency banner
 *     that interrupts a screen reader mid-sentence is less useful, not more.
 */
;(function () {
  'use strict'

  if (window.CityAlert) return

  var ORIGIN = (function () {
    var s = document.currentScript
    if (s && s.src) {
      try { return new URL(s.src).origin } catch (e) { /* fall through */ }
    }
    return window.location.origin
  })()

  var TONE = {
    emergency:   { bg: '#B91C1C', fg: '#FFFFFF', label: 'Emergency' },
    advisory:    { bg: '#B45309', fg: '#FFFFFF', label: 'Advisory' },
    information: { bg: '#1B3A5C', fg: '#FFFFFF', label: 'Notice' }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function CityAlert(options) {
    this.options = options || {}
    this.poll = (this.options.pollSeconds || 120) * 1000
    this.host = null
    this.check()
    var self = this
    // An alert can be posted or cleared while a page is open. Re-check
    // periodically so a resident who left a tab open still sees it.
    setInterval(function () { self.check() }, this.poll)
  }

  CityAlert.prototype.check = function () {
    var self = this

    // The API lives on the records domain, which is where this script was
    // loaded from — not the host page's own origin. `baseUrl` is the explicit
    // override for the case where the script tag cannot be identified.
    var base = this.options.baseUrl || ORIGIN
    var url
    try {
      url = new URL('/api/public/alert', base)
    } catch (e) {
      if (window.console) console.warn('[CityAlert] could not resolve API origin')
      return
    }
    if (this.options.municipality) {
      url.searchParams.set('municipality', this.options.municipality)
    }

    fetch(url.toString(), { credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (body) {
        var alert = body && body.data ? body.data.alert : null
        if (alert) self.show(alert)
        else self.hide()
      })
      .catch(function () {
        // Network trouble must never leave a stale emergency on screen, nor
        // remove a live one. Leave whatever is showing as it is.
      })
  }

  CityAlert.prototype.hide = function () {
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host)
      this.host = null
    }
  }

  CityAlert.prototype.show = function (alert) {
    if (this.host && this.host.dataset.message === alert.message) return
    this.hide()

    var tone = TONE[alert.severity] || TONE.emergency

    var mount = document.createElement('div')
    mount.dataset.message = alert.message
    mount.style.cssText = 'all:initial;display:block;position:relative;z-index:2147483000'
    document.body.insertBefore(mount, document.body.firstChild)
    this.host = mount

    var root = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount

    var style = document.createElement('style')
    style.textContent = [
      ':host{all:initial}',
      '*,*::before,*::after{box-sizing:border-box}',
      '.bar{display:flex;align-items:center;gap:12px;padding:10px 14px;',
      '  background:' + tone.bg + ';color:' + tone.fg + ';',
      '  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;',
      '  font-size:15px;line-height:1.4;font-weight:600}',
      '.tag{flex:none;text-transform:uppercase;letter-spacing:.07em;font-size:11px;',
      '  font-weight:800;border:1.5px solid currentColor;border-radius:3px;padding:3px 7px}',
      '.viewport{flex:1 1 auto;overflow:hidden;min-width:0}',
      '.text{display:block;white-space:nowrap}',
      '.text.wrap{white-space:normal}',
      '.text.scroll{animation:slide var(--dur,22s) linear infinite}',
      '.paused .text.scroll{animation-play-state:paused}',
      '@keyframes slide{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}',
      '.pause{flex:none;background:transparent;color:inherit;border:1.5px solid currentColor;',
      '  border-radius:3px;font:inherit;font-size:12px;padding:5px 9px;cursor:pointer;min-height:32px}',
      '.pause:focus-visible{outline:3px solid #fff;outline-offset:2px}',
      'a{color:inherit;text-decoration:underline;text-underline-offset:2px}',
      '@media (prefers-reduced-motion: reduce){',
      '  .text.scroll{animation:none}.text{white-space:normal}.pause{display:none}}',
      '@media (max-width:640px){.bar{font-size:14px;align-items:flex-start}',
      '  .text{white-space:normal}.text.scroll{animation:none}.pause{display:none}}'
    ].join('')

    var link = alert.link_url && alert.link_label
      ? ' <a href="' + esc(alert.link_url) + '">' + esc(alert.link_label) + '</a>'
      : ''

    var bar = document.createElement('div')
    bar.className = 'bar'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', tone.label + ' notice from the city')
    bar.innerHTML =
      '<span class="tag">' + tone.label + '</span>' +
      '<div class="viewport"><span class="text" id="t">' + esc(alert.message) + link + '</span></div>' +
      '<button class="pause" type="button" aria-pressed="false">Pause</button>'

    root.appendChild(style)
    root.appendChild(bar)

    // A polite live region: the banner is read after the current phrase
    // rather than cutting across it.
    var sr = document.createElement('div')
    sr.setAttribute('role', 'status')
    sr.setAttribute('aria-live', 'polite')
    sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'
    sr.textContent = tone.label + ': ' + alert.message
    root.appendChild(sr)

    // Scroll only if the text genuinely does not fit. A short message that
    // fits should sit still — movement for its own sake is just noise.
    var text = bar.querySelector('#t')
    var viewport = bar.querySelector('.viewport')
    var button = bar.querySelector('.pause')

    requestAnimationFrame(function () {
      if (text.scrollWidth > viewport.clientWidth) {
        var seconds = Math.max(14, Math.round(text.scrollWidth / 42))
        text.innerHTML = text.innerHTML + '<span style="padding:0 48px">&bull;</span>' + text.innerHTML
        text.style.setProperty('--dur', seconds + 's')
        text.classList.add('scroll')
      } else {
        text.classList.add('wrap')
        button.style.display = 'none'
      }
    })

    button.addEventListener('click', function () {
      var paused = bar.classList.toggle('paused')
      button.setAttribute('aria-pressed', paused ? 'true' : 'false')
      button.textContent = paused ? 'Resume' : 'Pause'
    })
  }

  window.CityAlert = {
    init: function (options) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { new CityAlert(options) })
        return
      }
      return new CityAlert(options)
    }
  }
})()
