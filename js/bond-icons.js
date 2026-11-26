/* BOND v4.2 optional minimal icon style. Loaded LAST by loader.js.
   Presentation-only: existing navigation handlers, button classes, theme and layout stay intact. */
(function () {
  'use strict';
  if (typeof S === 'undefined' || typeof nav !== 'function' || typeof vSet !== 'function') return;
  S.ui = S.ui || {};
  if (!['classic', 'minimal'].includes(S.ui.bondIconStyle)) S.ui.bondIconStyle = 'classic';

  // Self-contained outline SVGs: no external Lucide library, asset or network dependency.
  const shapes = {
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/>',
    plans: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
    body: '<path d="m6.5 6.5 11 11M4 9l5-5a1.4 1.4 0 0 0-2-2L2 7a1.4 1.4 0 0 0 2 2Zm13 13 5-5a1.4 1.4 0 0 0-2-2l-5 5a1.4 1.4 0 0 0 2 2ZM7 12l5-5a1.4 1.4 0 0 0-2-2l-5 5a1.4 1.4 0 0 0 2 2Zm7 7 5-5a1.4 1.4 0 0 0-2-2l-5 5a1.4 1.4 0 0 0 2 2Z"/>',
    mind: '<path d="M12 6a3 3 0 0 0-5.6-1.4A4 4 0 0 0 4 11a4 4 0 0 0 2 6.8A3.5 3.5 0 0 0 12 19V6ZM12 6a3 3 0 0 1 5.6-1.4A4 4 0 0 1 20 11a4 4 0 0 1-2 6.8A3.5 3.5 0 0 1 12 19V6Z"/><path d="M7 10c1.6 0 2.5 1 2.5 2.5M17 10c-1.6 0-2.5 1-2.5 2.5"/>',
    dashboard: '<path d="M3 3v18h18M7 17v-3M12 17v-5M17 17v-7"/><path d="m6 10 5-5 4 3 5-5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    stats: '<path d="M4 20v-6h4v6M10 20V9h4v11M16 20V4h4v16"/>',
    flame: '<path d="M12 22c-5 0-8-3.4-8-8 0-3.4 2-6.1 5-9-.3 3 1 5 2 5 2-2 3-5 3-8 4 3.5 6 7 6 12 0 4.6-3 8-8 8Z"/><path d="M12 22c-2.4 0-4-1.6-4-4 0-2 1-3.5 3-5 0 2 1 3 2 3 1-1 1-2 1-3 2 2 2 3.5 2 5 0 2.4-1.6 4-4 4Z"/>',
    progress: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
    energy: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
    wind: '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M2 12h17a2 2 0 1 0-2-2M4 16h10a2.5 2.5 0 1 1-2.5 2.5"/>',
    sprig: '<path d="M4 21C8 16 14 12 19 5M10 15C5 15 4 12 5 8c4 0 6 3 5 7ZM14 11c-1-5 1-8 6-9 1 5-2 8-6 9Zm-4 5c3-4 7-4 11-2-2 4-6 5-11 2Z"/>',
    moon: '<path d="M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
    trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4m-5 4v5m-4 1h8"/>',
    skip: '<path d="m5 5 12 7-12 7V5ZM19 5v14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.6 1.6 0 0 1 1.2-2.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><path d="M7 11h.01M10 7h.01M15 7h.01M18 11h.01"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    save: '<path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M7 3v5h10V3M7 21v-8h10v8"/>',
    package: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5ZM3 8l9 5 9-5m-9 5v8M7.5 5.5l9 5"/>',
    scale: '<path d="M12 3v17m-5 1h10M4 7h16M6 7l-3 7h6L6 7Zm12 0-3 7h6l-3-7Z"/>',
    training: '<path d="M3 7v10m4-13v16m10-16v16m4-13v10M3 12h4m0 0h10m0 0h4"/>',
    tools: '<path d="m5 19 7-7m3-5 3 3 3-3a5 5 0 0 1-6 6l-7 7a2 2 0 1 1-3-3l7-7a5 5 0 0 1 6-6l-3 3Z"/>',
    arrows: '<path d="M3 12h18m-14-4-4 4 4 4m10-8 4 4-4 4"/>',
    note: '<path d="M12 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M10 14l1-4 7-7 3 3-7 7-4 1Z"/>',
    movie: '<path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Zm0 0L2 5l17-4 1 4L3 9Zm4-5 3 3m3-5 3 3m-6 8 5 3-5 3v-6Z"/>',
    import: '<path d="M12 3v11m-4-4 4 4 4-4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
    gear: '<path d="m10 3-.6 2.2-1.5.9-2.2-.6-2 3.5 1.6 1.6v1.8l-1.6 1.6 2 3.5 2.2-.6 1.5.9.6 2.2h4l.6-2.2 1.5-.9 2.2.6 2-3.5-1.6-1.6v-1.8l1.6-1.6-2-3.5-2.2.6-1.5-.9L14 3Z"/><circle cx="12" cy="11.5" r="3"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>'
  };
  const glyphs = {'🏠':'home','⌂':'home','📋':'plans','📆':'calendar','📅':'calendar','💪':'body','🧠':'mind','📈':'progress','📊':'stats','🎯':'target','🔥':'flame','⚡':'energy','✅':'check','🏆':'trophy','⏭':'skip','🎨':'palette','🔔':'bell','📱':'phone','💾':'save','📦':'package','⚖':'scale','🏋':'training','🛠':'tools','↔':'arrows','📝':'note','🎬':'movie','📥':'import','⚙':'gear','🌬':'wind','🌿':'sprig','🌙':'moon','✏':'edit','✎':'edit'};
  function svg(name) {
    return '<svg class="bond-min-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shapes[name] + '</svg>';
  }
  function css() {
    if (document.getElementById('bond-minimal-css')) return;
    const style = document.createElement('style');
    style.id = 'bond-minimal-css';
    style.textContent = '.bond-min-icon{width:1em;height:1em;display:inline-block;vertical-align:-.13em;color:inherit;stroke:currentColor;flex-shrink:0}' +
      '#nav .bond-min-icon{width:22px;height:22px;display:block;margin:0 auto;vertical-align:middle}' +
      '.bond-min-preview{display:inline-flex;align-items:center;gap:7px}.bond-min-preview svg{font-size:20px}';
    document.head.appendChild(style);
  }
  const pattern = new RegExp('(' + Object.keys(glyphs).join('|') + ')[\uFE0E\uFE0F]?', 'gu');
  const skip = 'script,style,textarea,option,[contenteditable],svg,[data-bond-icon-choice]';
  function isActivityLabel(text) {
    return /^\s*🎯[\uFE0E\uFE0F]?\s*(?:Aktivität(?:en)?|Activities|Activity)(?![\p{L}\p{N}_])/iu.test(text);
  }
  function replaceActivityLabels(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && !node.parentElement.closest(skip) && isActivityLabel(node.parentElement.textContent)) {
        const changed = node.nodeValue.replace(/^(\s*)🎯[\uFE0E\uFE0F]?/u, '$1⚡');
        if (changed !== node.nodeValue) node.nodeValue = changed;
      }
    }
  }
  function replaceGlyphs(root) {
    if (!root) return;
    if (S.ui.bondIconStyle !== 'minimal') {
      root.querySelectorAll('svg[data-bond-original]').forEach(icon => icon.replaceWith(document.createTextNode(icon.getAttribute('data-bond-original'))));
      replaceActivityLabels(root);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || node.parentElement.closest(skip)) continue;
      if (Array.from(node.nodeValue.matchAll(pattern)).length) nodes.push(node);
    }
    for (const node of nodes) {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        const holder = document.createElement('span');
        const activity = match[1] === '🎯' && isActivityLabel(node.parentElement.textContent) && !text.slice(0, match.index).trim();
        const icon = activity ? 'energy' : match[1] === '\u{1F4C8}' && root.id === 'nav' ? 'dashboard' : glyphs[match[1]];
        holder.innerHTML = svg(icon);
        const graphic = holder.firstChild;
        graphic.setAttribute('data-bond-original', activity ? '⚡' : match[0]);
        if (!node.parentElement.closest('#nav,[aria-label],[aria-labelledby]')) {
          graphic.removeAttribute('aria-hidden');
          graphic.setAttribute('role', 'img');
          graphic.setAttribute('aria-label', activity ? '⚡' : match[0]);
        }
        frag.appendChild(graphic);
        last = match.index + match[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
  }
  window.bondSetIconStyle = function (style) {
    S.ui.bondIconStyle = style === 'minimal' ? 'minimal' : 'classic';
    save(); render();
  };
  const oldNav = nav;
  nav = function () {
    oldNav.apply(this, arguments);
    css();
    replaceGlyphs(document.getElementById('nav'));
  };
  function iconChoice() {
    const section = document.createElement('div');
    section.dataset.bondIconChoice = 'true';
    section.innerHTML = '<p style="margin-top:12px"><b>' + 'New Home Icon' + '</b></p>' +
      '<div class="r"><button class="chip ' + (S.ui.bondIconStyle === 'classic' ? 'on' : '') + '" onclick="bondSetIconStyle(\'classic\')">🏠 Classic</button>' +
      '<button class="chip ' + (S.ui.bondIconStyle === 'minimal' ? 'on' : '') + '" onclick="bondSetIconStyle(\'minimal\')"><span class="bond-min-preview">' + svg('home') + ' Minimal</span></button></div>';
    return section;
  }
  window.bondToggleAppearance = function (opened) {
    S.ui.settingsOpen = S.ui.settingsOpen || {};
    if (Boolean(S.ui.settingsOpen.appearance) === opened) return;
    S.ui.settingsOpen.appearance = opened;
    save();
  };
  const oldSet = vSet;
  vSet = function () {
    const tpl = document.createElement('template');
    tpl.innerHTML = oldSet.apply(this, arguments);
    // Place the preference in the collapsible content, never next to <details>.
    const palette = tpl.content.querySelector('button[onclick^="setPalette("]');
    const mode = tpl.content.querySelector('button[onclick^="setMode("]');
    const theme = tpl.content.querySelector('button[onclick^="setTheme("]');
    const control = palette || mode || theme;
    const card = control?.closest('.c');
    const existing = control?.closest('details') || card?.querySelector(':scope > details');
    if (!tpl.content.querySelector('[data-bond-icon-choice]') && (existing || card)) {
      if (existing) {
        existing.appendChild(iconChoice());
      } else {
        // This app version renders Appearance as a plain card. Make it collapsible.
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const title = card.querySelector(':scope > h3');
        summary.textContent = title?.textContent.trim() || (S.lang === 'en' ? 'Appearance' : 'Darstellung');
        summary.style.cssText = 'font-weight:700;cursor:pointer';
        if (title) title.remove();
        const content = document.createElement('div');
        content.style.marginTop = '12px';
        while (card.firstChild) content.appendChild(card.firstChild);
        content.appendChild(iconChoice());
        details.append(summary, content);
        if (S.ui.settingsOpen?.appearance) details.setAttribute('open', '');
        details.setAttribute('ontoggle', "bondToggleAppearance(this.open)");
        card.appendChild(details);
      }
    }
    return tpl.innerHTML;
  };
  // Render is called by the loader and on every page switch; keep all other emoji in sync.
  const oldRender = render;
  render = function () {
    const result = oldRender.apply(this, arguments);
    refreshContent();
    return result;
  };
  function refreshContent() {
    ['app', 'thx'].forEach(id => replaceGlyphs(document.getElementById(id)));
  }
  css();
  refreshContent();
  // Some in-app controls update via innerHTML without going through render().
  if (typeof MutationObserver === 'function') {
    const watch = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        const parent = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const root = parent?.closest('#app,#nav,#thx');
        if (!root || parent.closest(skip)) continue;
        if (record.type === 'characterData' || Array.from(record.addedNodes).some(node => node.nodeType === 3 || (node.nodeType === 1 && !node.matches('svg[data-bond-original]')))) roots.add(root);
      }
      roots.forEach(replaceGlyphs);
    });
    ['app', 'nav', 'thx'].forEach(id => {
      const root = document.getElementById(id);
      if (root) watch.observe(root, { childList: true, subtree: true, characterData: true });
    });
  }
})();
