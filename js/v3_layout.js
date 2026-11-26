/* BOND Layout Manager: unified Drag & Drop (Touch + Mouse), Button-only Edit Mode & Floating Done Button */
(function () {
  'use strict';

  const VIEWS = { today: 'home', hist: 'dash' };
  let editMode = false;
  let activeView = null;
  let dragState = null;
  let isMounting = false;

  function getCurrentTab() {
    if (window.tab) return window.tab;
    try { if (typeof tab !== 'undefined' && tab) return tab; } catch (_) {}
    return 'today';
  }

  function ensureLayout(view) {
    if (!window.S) return { order: [], hidden: [] };
    if (!S.layout || typeof S.layout !== 'object') S.layout = {};
    if (!S.layout[view]) S.layout[view] = { order: [], hidden: [] };
    if (!Array.isArray(S.layout[view].order)) S.layout[view].order = [];
    if (!Array.isArray(S.layout[view].hidden)) S.layout[view].hidden = [];
    return S.layout[view];
  }

  function injectStyles() {
    if (document.getElementById('bond-layout-css')) return;
    const st = document.createElement('style');
    st.id = 'bond-layout-css';
    st.textContent = `
      .bl-editing [data-card] {
        position: relative;
        outline: 1.5px dashed var(--ac);
        outline-offset: 2px;
        transition: transform .15s ease;
      }
      .bl-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        margin: -6px -6px 10px -6px;
        border-radius: 10px;
        background: var(--bg);
        border: 1px solid var(--bd);
        user-select: none;
      }
      .bl-handle {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        font-size: 13px;
        font-weight: 700;
        color: var(--tx);
        cursor: grab;
        touch-action: none;
        padding: 4px 2px;
      }
      .bl-handle:active { cursor: grabbing; }
      .bl-hide-btn {
        min-width: 32px;
        min-height: 32px;
        border-radius: 8px;
        border: 1px solid var(--bd);
        background: transparent;
        color: var(--mc);
        font-weight: 700;
        cursor: pointer;
      }
      .bl-dragging {
        opacity: .92;
        box-shadow: 0 14px 32px rgba(0,0,0,.35) !important;
        z-index: 50 !important;
        pointer-events: none;
        transform: scale(1.015);
      }
      .bl-placeholder {
        border: 2px dashed var(--ac);
        border-radius: 14px;
        background: var(--ac2);
        margin: 10px 0;
        opacity: .55;
      }
      .bl-add-box {
        margin-top: 14px;
        padding: 14px;
        border-radius: 14px;
        border: 2px dashed var(--bd);
        text-align: center;
      }
      .bl-footer {
        margin-top: 16px;
        padding-bottom: 8px;
        display: flex;
        justify-content: center;
      }
      .bl-toggle-btn {
        width: 100%;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
      }
      #bondLayoutDoneFab {
        position: fixed;
        right: 16px;
        bottom: calc(82px + max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)));
        z-index: 35;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 11px 18px;
        border-radius: 999px;
        border: 1.5px solid var(--ac);
        background: var(--ac);
        color: var(--bg);
        font-weight: 800;
        font-size: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.32);
        cursor: pointer;
      }
    `;
    document.head.appendChild(st);
  }

  function cleanLabelText(raw) {
    return String(raw || '')
      .replace(/[▶▼▲⋮]/g, '')
      .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]+/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugifyId(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36);
  }

  function deriveCardLabel(el, fallbackId) {
    if (el.dataset.label) return el.dataset.label;
    const heading = el.querySelector('h3, h4, summary, b, strong');
    if (heading) {
      const cleaned = cleanLabelText(heading.textContent);
      if (cleaned) return cleaned.length > 38 ? cleaned.slice(0, 36) + '…' : cleaned;
    }
    const mod = el.getAttribute('data-module');
    if (mod) return mod;
    return fallbackId;
  }

  function isStaticHeaderOrControl(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (tag === 'H1' || tag === 'H2' || tag === 'SCRIPT' || tag === 'STYLE') return true;
    if (el.classList.contains('bl-add-box') || el.classList.contains('bl-footer') || el.classList.contains('bl-placeholder')) return true;
    if (el.id === 'bondLayoutFab' || el.id === 'bondLayoutDoneFab') return true;
    return false;
  }

  function collectAndNormalizeCards(app, view) {
    const directChildren = [...app.children];
    directChildren.forEach(el => {
      if (isStaticHeaderOrControl(el)) return;

      if (el.classList.contains('home-extras')) {
        while (el.firstChild) {
          app.insertBefore(el.firstChild, el);
        }
        el.remove();
        return;
      }

      if (el.tagName === 'SECTION' && el.hasAttribute('data-module')) {
        const innerTagged = [...el.querySelectorAll(':scope > [data-card]')];
        if (innerTagged.length === 1 && el.children.length === 1) {
          const inner = innerTagged[0];
          app.insertBefore(inner, el);
          el.remove();
          return;
        }
        const innerCards = [...el.querySelectorAll(':scope > .c, :scope > [data-card]')];
        if (innerCards.length > 1) {
          while (el.firstChild) {
            app.insertBefore(el.firstChild, el);
          }
          el.remove();
          return;
        }
        if (!el.dataset.card) {
          const modName = el.getAttribute('data-module');
          el.dataset.card = view + '_mod_' + slugifyId(modName || 'section');
          el.dataset.label = deriveCardLabel(el, modName);
        }
      }
    });

    const usedIds = new Set();
    const cards = [];

    [...app.children].forEach(el => {
      if (isStaticHeaderOrControl(el)) return;
      if (!el.textContent.trim() && !el.querySelector('svg, canvas, img, input, button')) return;

      if (!el.dataset.card) {
        const label = deriveCardLabel(el, 'Bereich');
        const baseSlug = slugifyId(label) || 'card';
        let candidate = view + '_' + baseSlug;
        let counter = 2;
        while (usedIds.has(candidate)) {
          candidate = view + '_' + baseSlug + '_' + counter++;
        }
        el.dataset.card = candidate;
        if (!el.dataset.label) el.dataset.label = label;
      } else {
        if (!el.dataset.label) {
          el.dataset.label = deriveCardLabel(el, el.dataset.card);
        }
      }

      usedIds.add(el.dataset.card);
      cards.push(el);
    });

    return cards;
  }

  function saveOrderFromDom(app, view) {
    const cfg = ensureLayout(view);
    const visibleIds = [...app.querySelectorAll(':scope > [data-card]')]
      .filter(el => el.style.display !== 'none')
      .map(el => el.dataset.card);
    cfg.order = [...visibleIds, ...cfg.hidden.filter(id => !visibleIds.includes(id))];
    if (typeof window.save === 'function') window.save();
  }

  function startDrag(e, card, app, view) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'bl-placeholder';
    placeholder.style.height = rect.height + 'px';

    card.parentNode.insertBefore(placeholder, card);
    card.classList.add('bl-dragging');
    card.style.position = 'fixed';
    card.style.left = rect.left + 'px';
    card.style.top = rect.top + 'px';
    card.style.width = rect.width + 'px';
    card.style.margin = '0';

    dragState = {
      card,
      placeholder,
      offsetY: e.clientY - rect.top,
      app,
      view
    };

    try { navigator.vibrate?.(25); } catch (_) {}
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const { card, placeholder, offsetY, app } = dragState;
    card.style.top = (e.clientY - offsetY) + 'px';

    if (e.clientY < 80) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 100) window.scrollBy(0, 10);

    const siblings = [...app.querySelectorAll(':scope > [data-card]')]
      .filter(el => el !== card && el.style.display !== 'none');

    let inserted = false;
    for (const sib of siblings) {
      const box = sib.getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        app.insertBefore(placeholder, sib);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      const tail = app.querySelector('.bl-add-box, .bl-footer');
      if (tail) app.insertBefore(placeholder, tail);
      else app.appendChild(placeholder);
    }
  }

  function onDragEnd() {
    if (!dragState) return;
    const { card, placeholder, app, view } = dragState;
    card.classList.remove('bl-dragging');
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.margin = '';

    placeholder.parentNode.insertBefore(card, placeholder);
    placeholder.remove();
    dragState = null;

    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);

    saveOrderFromDom(app, view);
  }

  function removeFloatingDoneFab() {
    document.getElementById('bondLayoutFab')?.remove();
    document.getElementById('bondLayoutDoneFab')?.remove();
  }

  function ensureFloatingDoneFab() {
    let fab = document.getElementById('bondLayoutDoneFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'bondLayoutDoneFab';
      fab.type = 'button';
      fab.textContent = '✓ Fertig';
      fab.onclick = () => window.BONDLayout.setEdit(false);
      document.body.appendChild(fab);
    }
    return fab;
  }

  function renderControls(app, view, allCards) {
    app.querySelector('.bl-add-box')?.remove();
    app.querySelector('.bl-footer')?.remove();
    removeFloatingDoneFab();

    if (editMode) {
      const cfg = ensureLayout(view);
      const hiddenCards = allCards.filter(c => cfg.hidden.includes(c.dataset.card));

      const box = document.createElement('div');
      box.className = 'bl-add-box';

      if (!hiddenCards.length) {
        box.innerHTML = `<div class="mu" style="font-size:13px">Alle Elemente sind eingeblendet. Ziehe über <b>⋮⋮</b> zum Sortieren oder tippe <b>✕</b> zum Ausblenden.</div>`;
      } else {
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px';
        title.textContent = '+ Element wieder hinzufügen';
        box.appendChild(title);

        const row = document.createElement('div');
        row.className = 'r';
        row.style.justifyContent = 'center';
        hiddenCards.forEach(c => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'chip';
          btn.textContent = '+ ' + (c.dataset.label || c.dataset.card);
          btn.onclick = () => {
            cfg.hidden = cfg.hidden.filter(id => id !== c.dataset.card);
            if (!cfg.order.includes(c.dataset.card)) cfg.order.push(c.dataset.card);
            if (typeof window.save === 'function') window.save();
            window.BONDLayout.mount(getCurrentTab());
          };
          row.appendChild(btn);
        });
        box.appendChild(row);
      }
      app.appendChild(box);

      ensureFloatingDoneFab();
    } else {
      const footer = document.createElement('div');
      footer.className = 'bl-footer';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'b g bl-toggle-btn';
      editBtn.textContent = '✏️ Anpassen';
      editBtn.onclick = () => window.BONDLayout.setEdit(true);
      footer.appendChild(editBtn);
      app.appendChild(footer);
    }
  }

  window.BONDLayout = {
    mount(currentTab) {
      if (isMounting || dragState) return;
      const tabName = currentTab || getCurrentTab();
      const view = VIEWS[tabName];
      const app = document.getElementById('app');

      if (!view || !app) {
        editMode = false;
        activeView = null;
        removeFloatingDoneFab();
        return;
      }

      isMounting = true;
      try {
        injectStyles();

        if (activeView !== view) {
          editMode = false;
          activeView = view;
        }

        const cards = collectAndNormalizeCards(app, view);
        if (!cards.length) {
          app.querySelector('.bl-add-box')?.remove();
          app.querySelector('.bl-footer')?.remove();
          removeFloatingDoneFab();
          return;
        }

        app.classList.toggle('bl-editing', editMode);

        const cfg = ensureLayout(view);
        const map = new Map(cards.map(c => [c.dataset.card, c]));

        cfg.order.forEach(id => {
          const el = map.get(id);
          if (el) app.appendChild(el);
        });
        cards.forEach(c => {
          if (!cfg.order.includes(c.dataset.card)) {
            cfg.order.push(c.dataset.card);
            app.appendChild(c);
          }
        });

        cards.forEach(card => {
          const id = card.dataset.card;
          const isHidden = cfg.hidden.includes(id);
          card.style.display = isHidden ? 'none' : '';

          card.querySelector(':scope > .bl-bar')?.remove();
          if (editMode && !isHidden) {
            const bar = document.createElement('div');
            bar.className = 'bl-bar';

            const handle = document.createElement('div');
            handle.className = 'bl-handle';
            handle.innerHTML = `<span style="font-size:16px;opacity:.7">⋮⋮</span><span>${card.dataset.label || id}</span>`;
            handle.addEventListener('pointerdown', e => startDrag(e, card, app, view));

            const hideBtn = document.createElement('button');
            hideBtn.type = 'button';
            hideBtn.className = 'bl-hide-btn';
            hideBtn.title = 'Ausblenden';
            hideBtn.textContent = '✕';
            hideBtn.onclick = () => {
              if (!cfg.hidden.includes(id)) cfg.hidden.push(id);
              if (typeof window.save === 'function') window.save();
              window.BONDLayout.mount(tabName);
            };

            bar.appendChild(handle);
            bar.appendChild(hideBtn);
            card.insertBefore(bar, card.firstChild);
          }
        });

        renderControls(app, view, cards);
      } finally {
        isMounting = false;
      }
    },

    setEdit(val) {
      const savedY = window.scrollY || window.pageYOffset || 0;
      editMode = !!val;
      this.mount(getCurrentTab());
      if (savedY > 0) {
        window.scrollTo(0, savedY);
      }
    },

    toggleEdit() {
      this.setEdit(!editMode);
    }
  };

  if (typeof window.render === 'function' && !window.render._blWrapped) {
    const _origRender = window.render;
    window.render = function () {
      const res = _origRender.apply(this, arguments);
      window.BONDLayout.mount(getCurrentTab());
      return res;
    };
    window.render._blWrapped = true;
    try { render = window.render; } catch (_) {}
  }

  if (document.getElementById('app')) {
    window.BONDLayout.mount(getCurrentTab());
  }
})();