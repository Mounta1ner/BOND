/* Mein Training v3.0 - Modul 2: Geführter Workout-Player, Mehrphasen-Halte-Timer & BPM-Shortcut */
(function () {
  'use strict';

  S.ui = S.ui || {};
  S.ui.v3PlayerMode = S.ui.v3PlayerMode || 'standard'; // 'standard' (Satz für Satz) | 'circuit' (Runde für Runde)

  // Automatische Phasen-Erkennung für einseitige Halte-/Dehnübungen, falls e.phases noch nicht im JSON definiert ist
  const BILATERAL_HOLD_IDS = new Set([
    'e6',  // Seitstütz
    'e19', // Einbeinstand
    'e20', // Oberschenkel-Vorderseite dehnen
    'e21', // Oberschenkel-Rückseite dehnen
    'e22', // Wadendehnung
    'e23', // Hüftbeuger-Dehnung
    'e26', // Brustdehnung im Türrahmen
    'e27', // Piriformis-Dehnung
    'e28', // Nackendehnung
    'e35', // Tandemstand
    'e36', // Standwaage
    'e52', // Schulterdehnung quer
    'e53', // Trizeps-Dehnung
    'e54', // Handgelenk-Dehnung
    'e56', // Rückendrehung im Liegen
    'e57', // Knie zur Brust
    'e62', // Storchstand
    'e75', // Flamingo-Stand
    'e86', // Seitstütz mit Beinheben
    'e89'  // Einbeinige Hüftbrücke
  ]);

  function isTimedExercise(e) {
    return !!e && (isT(e) || isM(e) || (Array.isArray(e.phases) && e.phases.length > 0));
  }

  function isSpeedExercise(e) {
    return !!e && (e.c === 'Schnelligkeit' || Number(e.bpm) > 0);
  }

  // Erzeugt die Phasen-Liste für eine Übung (nutzt e.phases oder baut Phasen aus der Zielzeit)
  window.v3GetExercisePhases = function (e, targetVal) {
    if (!e) return [];
    const totalSec = unit(e) === 'Min.'
      ? Math.max(5, Math.round((+targetVal || 1) * 60))
      : Math.max(5, Math.round(+targetVal || 30));

    if (Array.isArray(e.phases) && e.phases.length > 0) {
      return e.phases.map(p => ({
        label: String(p.label || e.n),
        sec: Math.max(1, Number(p.sec) || 10)
      }));
    }

    if (BILATERAL_HOLD_IDS.has(e.id)) {
      return [
        { label: e.n + ' · Seite 1 halten', sec: totalSec },
        { label: 'Seitenwechsel & Position einnehmen', sec: 5 },
        { label: e.n + ' · Seite 2 halten', sec: totalSec }
      ];
    }

    return [{ label: e.n + ' halten', sec: totalSec }];
  };

  // =========================================================================
  // 1. BPM-METRONOM QUICK-MODAL (FÜR SCHNELLIGKEITS-ÜBUNGEN)
  // =========================================================================
  window.v3OpenBpmModal = function (exId) {
    const e = ex(exId);
    const defaultBpm = (e && Number(e.bpm) >= 30 && Number(e.bpm) <= 240)
      ? Number(e.bpm)
      : (S.bpm || 120);

    if (!bpmTimer) {
      S.bpm = defaultBpm;
      save();
    }

    const title = e ? `🥁 Taktgeber: ${esc(e.n)}` : '🥁 BPM · Metronom';
    const html = `
      <h2>${title}</h2>
      <p class="mu" style="margin:0 0 10px">Starte den Rhythmus für eine gleichmäßige Bewegungsfrequenz. Du kannst das Fenster schließen, während der Beat im Hintergrund weiterläuft.</p>
      ${typeof bpmCard === 'function' ? bpmCard() : ''}
      <div class="r" style="margin-top:10px;justify-content:space-between">
        <div class="r" style="gap:6px">
          ${[100, 120, 140, 160].map(b => `<button type="button" class="chip ${S.bpm === b ? 'on' : ''}" style="padding:6px 10px;font-size:12px" onclick="v3SetQuickBpm(${b})">${b} BPM</button>`).join('')}
        </div>
      </div>
      <div class="r" style="margin-top:14px;justify-content:flex-end;gap:8px">
        <button type="button" class="b g" onclick="bpmStop();v27CloseModal();if(window.WP&&WP.active)v3RenderPlayer()">⏹ Stopp & Schließen</button>
        <button type="button" class="b" onclick="if(!bpmTimer)bpmStart();v27CloseModal();if(window.WP&&WP.active)v3RenderPlayer()">▶ Weiterlaufen & Schließen</button>
      </div>`;

    v27Modal(html, false);
    // Z-Index anpassen, damit das Modal auch über dem Vollbild-Workout-Player (z-index: 45) liegt
    const ov = document.getElementById('v27Overlay');
    if (ov) ov.style.zIndex = '9998';
  };

  window.v3SetQuickBpm = function (val) {
    S.bpm = val;
    save();
    const inp = document.getElementById('bpmVal');
    if (inp) inp.value = val;
    const circle = document.getElementById('beatCircle');
    if (circle) circle.textContent = val;
    if (bpmTimer) bpmStart();
  };

  // =========================================================================
  // 2. MEHRPHASEN-HALTE-TIMER (SHRINKING BAR + NÄCHSTE STELLUNG)
  // =========================================================================
  let PT = null; // Phase Timer State

  function ensureWorkoutOverlayStyles() {
    if (document.getElementById('v3-workout-overlay-css')) return;
    const st = document.createElement('style');
    st.id = 'v3-workout-overlay-css';
    st.textContent = `
      #v3PlayerOv, .v3-player-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9990 !important;
        background: var(--bg) !important;
        color: var(--tx) !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
        padding: calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))) 16px calc(28px + max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))) 16px !important;
      }
      #v3PlayerOv .v3-player-wrap {
        max-width: 560px;
        margin: 0 auto;
      }
      #v3PhaseOv, .v3-phase-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9995 !important;
        background: rgba(10, 15, 24, 0.86) !important;
        backdrop-filter: blur(4px);
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        overflow-y: auto !important;
      }
      #v3PhaseOv .v3-phase-card {
        width: 100%;
        max-width: 440px;
        background: var(--card);
        color: var(--tx);
        border: 1.5px solid var(--bd);
        border-radius: 18px;
        padding: 18px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.45);
      }
      .v3-shrink-bar-wrap {
        width: 100%;
        height: 12px;
        border-radius: 999px;
        background: var(--bd);
        overflow: hidden;
        margin: 10px 0;
      }
      .v3-shrink-bar {
        height: 100%;
        background: var(--ac);
        transition: width 0.08s linear;
      }
      .v3-phase-time, .v3-rest-countdown {
        font-size: 42px;
        font-weight: 800;
        text-align: center;
        color: var(--ac);
        line-height: 1.1;
        margin: 6px 0;
      }
      .v3-phase-label {
        font-size: 16px;
        font-weight: 700;
        text-align: center;
      }
      .v3-phase-next {
        font-size: 13px;
        text-align: center;
        color: var(--mu);
        margin-top: 8px;
      }
      .v3-phase-steps {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        margin-top: 10px;
      }
      .v3-phase-dot {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--bg);
        border: 1px solid var(--bd);
        color: var(--mu);
      }
      .v3-phase-dot.active {
        border-color: var(--ac);
        color: var(--ac);
        font-weight: 700;
      }
      .v3-phase-dot.done {
        opacity: 0.55;
        text-decoration: line-through;
      }
      .v3-player-inputs {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        margin: 10px 0 12px !important;
        align-items: end !important;
      }
      .v3-player-inputs > div {
        min-width: 0;
      }
      .v3-stepper-row {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
      }
      .v3-stepper-row .stepper {
        min-width: 34px !important;
        width: 34px !important;
        height: 38px !important;
        padding: 0 !important;
        flex: 0 0 34px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .v3-stepper-row input[type="number"] {
        min-width: 0 !important;
        width: 100% !important;
        flex: 1 1 auto !important;
        text-align: center !important;
        padding: 6px 2px !important;
        height: 38px !important;
        font-weight: 700;
      }
      .v3-rpe-list, .v3-rpe-grid {
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        margin: 12px 0 !important;
      }
      .v3-rpe-btn {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100% !important;
        text-align: left !important;
        padding: 12px 14px !important;
        margin-bottom: 8px !important;
        border-radius: 12px !important;
        border: 2px solid var(--bd) !important;
        background: var(--card) !important;
        color: var(--tx) !important;
        transition: border-color .15s ease, background-color .15s ease, transform .1s ease !important;
        cursor: pointer;
      }
      .v3-rpe-list .v3-rpe-btn, .v3-rpe-grid .v3-rpe-btn {
        margin-bottom: 0 !important;
      }
      .v3-rpe-btn.on, .v3-rpe-btn.selected, .v3-rpe-btn[aria-pressed="true"] {
        border-color: var(--ac) !important;
        background: var(--ac2) !important;
        box-shadow: 0 0 0 1.5px var(--ac) inset !important;
        font-weight: 700 !important;
      }
      .v3-rpe-btn.on::after, .v3-rpe-btn.selected::after, .v3-rpe-btn[aria-pressed="true"]::after {
        content: '✓';
        font-weight: 800;
        font-size: 16px;
        color: var(--ac);
        margin-left: 8px;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(st);
  }

  window.v3OpenPhaseTimer = function (exId, targetVal, onCompleteCallback, subtitle = '') {
    const e = ex(exId);
    if (!e) return;
    v3ClosePhaseTimer(false);

    const phases = window.v3GetExercisePhases(e, targetVal);
    if (!phases.length) return;

    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      AC.resume && AC.resume();
    } catch (_) {}

    PT = {
      exId,
      e,
      subtitle,
      phases,
      phaseIdx: 0,
      phaseElapsedMs: 0,
      running: true,
      lastTick: performance.now(),
      rafId: 0,
      onComplete: onCompleteCallback,
      wl: null
    };

    try {
      if (navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(w => { if (PT) PT.wl = w; }).catch(() => {});
      }
    } catch (_) {}

    ensureWorkoutOverlayStyles();
    let ov = document.getElementById('v3PhaseOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'v3PhaseOv';
      ov.className = 'v3-phase-overlay';
      document.body.appendChild(ov);
    }
    ov.style.cssText = 'position:fixed;inset:0;z-index:9995;display:flex;align-items:center;justify-content:center;background:rgba(10,15,24,.86);padding:16px';

    v3RenderPhaseModal();
    PT.rafId = requestAnimationFrame(v3PhaseLoop);
  };

  function v3RenderPhaseModal() {
    const ov = document.getElementById('v3PhaseOv');
    if (!ov || !PT) return;
    const cur = PT.phases[PT.phaseIdx];
    const next = PT.phases[PT.phaseIdx + 1];
    const remSec = Math.max(0, Math.ceil((cur.sec * 1000 - PT.phaseElapsedMs) / 1000));
    const pctRemaining = Math.max(0, Math.min(100, (1 - PT.phaseElapsedMs / (cur.sec * 1000)) * 100));

    ov.innerHTML = `
      <div class="v3-phase-card">
        <div class="r" style="justify-content:space-between;flex-wrap:nowrap">
          <div>
            <small class="mu">${esc(PT.subtitle || PT.e.n)} · Phase ${PT.phaseIdx + 1}/${PT.phases.length}</small>
            <h3 style="margin:2px 0 0">${esc(PT.e.n)}</h3>
          </div>
          <button type="button" class="x" onclick="v3ClosePhaseTimer(false)" aria-label="Schließen">✕</button>
        </div>

        <div class="r" style="justify-content:center;gap:12px;margin:12px 0">
          ${fig(PT.e, 0, 96)}${fig(PT.e, 1, 96)}
        </div>

        <div class="v3-phase-current">
          <div class="v3-phase-label" id="v3PhLabel">${esc(cur.label)}</div>
          <div class="v3-phase-time" id="v3PhTime">${remSec} s</div>
          <div class="v3-shrink-bar-wrap" aria-label="Verbleibende Zeit">
            <div class="v3-shrink-bar" id="v3PhBar" style="width:${pctRemaining.toFixed(1)}%"></div>
          </div>
        </div>

        <div class="v3-phase-next" id="v3PhNext">
          ${next
            ? `⏭️ Danach: <b>${esc(next.label)}</b> (${next.sec} s)`
            : `🏁 Danach: <b>Satz abgeschlossen</b>`}
        </div>

        ${PT.phases.length > 1 ? `
        <div class="v3-phase-steps">
          ${PT.phases.map((p, idx) => `<span class="v3-phase-dot ${idx < PT.phaseIdx ? 'done' : idx === PT.phaseIdx ? 'active' : ''}">${idx + 1}. ${esc(p.label)} (${p.sec}s)</span>`).join('')}
        </div>` : ''}

        <div class="r" style="justify-content:center;gap:8px;margin-top:16px">
          <button type="button" class="b g" onclick="v3TogglePhasePause()" id="v3PhPauseBtn">${PT.running ? '⏸ Pause' : '▶ Weiter'}</button>
          <button type="button" class="chip" onclick="v3SkipPhase()">⏭️ ${next ? 'Nächste Stellung' : 'Sofort abschließen'}</button>
        </div>
      </div>`;
  }

  function v3PhaseLoop() {
    if (!PT || !PT.running) return;
    const now = performance.now();
    PT.phaseElapsedMs += (now - PT.lastTick);
    PT.lastTick = now;

    const cur = PT.phases[PT.phaseIdx];
    const totalMs = cur.sec * 1000;

    if (PT.phaseElapsedMs >= totalMs) {
      v3AdvancePhase();
      return;
    }

    const remSec = Math.max(0, Math.ceil((totalMs - PT.phaseElapsedMs) / 1000));
    const pctRemaining = Math.max(0, Math.min(100, (1 - PT.phaseElapsedMs / totalMs) * 100));

    const timeEl = document.getElementById('v3PhTime');
    const barEl = document.getElementById('v3PhBar');
    if (timeEl) timeEl.textContent = remSec + ' s';
    if (barEl) barEl.style.width = pctRemaining.toFixed(2) + '%';

    PT.rafId = requestAnimationFrame(v3PhaseLoop);
  }

  function v3AdvancePhase() {
    if (!PT) return;
    if (PT.phaseIdx < PT.phases.length - 1) {
      beep();
      PT.phaseIdx++;
      PT.phaseElapsedMs = 0;
      PT.lastTick = performance.now();
      v3RenderPhaseModal();
      PT.rafId = requestAnimationFrame(v3PhaseLoop);
    } else {
      // Alle Phasen geschafft
      if (typeof v27GoSound === 'function') v27GoSound();
      else beep();
      const cb = PT.onComplete;
      v3ClosePhaseTimer(false);
      if (typeof cb === 'function') cb();
    }
  }

  window.v3TogglePhasePause = function () {
    if (!PT) return;
    PT.running = !PT.running;
    if (PT.running) {
      PT.lastTick = performance.now();
      PT.rafId = requestAnimationFrame(v3PhaseLoop);
    } else {
      cancelAnimationFrame(PT.rafId);
    }
    v3RenderPhaseModal();
  };

  window.v3SkipPhase = function () {
    if (!PT) return;
    v3AdvancePhase();
  };

  window.v3ClosePhaseTimer = function () {
    if (PT) {
      cancelAnimationFrame(PT.rafId);
      try { PT.wl && PT.wl.release && PT.wl.release().catch(() => {}); } catch (_) {}
      PT = null;
    }
    const ov = document.getElementById('v3PhaseOv');
    if (ov) ov.style.display = 'none';
  };

  // Überschreibe holdT(dt, pid, i) aus app.js, damit auch auf Home der neue Mehrphasen-Halte-Timer startet
  window.holdT = holdT = function (dt, pid, i) {
    const p = S.plans.find(x => x.id === pid);
    if (!p || !p.items[i]) return;
    const it = effective(p.items[i], p);
    const e = ex(it.ex);
    if (!e) return;
    const doneSets = Number(((S.log[dt] || {})[pid] || {})[i]) || 0;
    const nextSet = Math.min(it.sets, doneSets + 1);
    const target = typeof window.v3GetSetTarget === 'function'
      ? window.v3GetSetTarget(dt, pid, i, nextSet)
      : { reps: it.reps, kg: it.kg };

    window.v3OpenPhaseTimer(
      e.id,
      target.reps,
      () => {
        tickNext(dt, pid, i, +it.sets);
      },
      `${p.name} · Satz ${nextSet}/${it.sets}`
    );
  };

  // =========================================================================
  // 3. GEFÜHRTER VOLLBILD-WORKOUT-PLAYER (v3OpenPlayer)
  // =========================================================================
  window.WP = null; // Globaler Workout-Player State

  function buildPlayerQueue(p, mode) {
    const queue = [];
    const effItems = p.items.map((it, idx) => ({
      itemIdx: idx,
      eff: effective(it, p),
      exObj: ex(it.ex)
    })).filter(x => !!x.exObj);

    if (mode === 'circuit') {
      const maxSets = Math.max(0, ...effItems.map(x => +x.eff.sets || 1));
      for (let s = 1; s <= maxSets; s++) {
        effItems.forEach(x => {
          if (s <= (+x.eff.sets || 1)) {
            queue.push({ itemIdx: x.itemIdx, setNum: s, totalSets: +x.eff.sets || 1, round: s, totalRounds: maxSets });
          }
        });
      }
    } else {
      effItems.forEach(x => {
        const totalSets = +x.eff.sets || 1;
        for (let s = 1; s <= totalSets; s++) {
          queue.push({ itemIdx: x.itemIdx, setNum: s, totalSets });
        }
      });
    }
    return queue;
  }

  function isStepDone(dt, pid, step) {
    const doneSets = Number(((S.log[dt] || {})[pid] || {})[step.itemIdx]) || 0;
    return doneSets >= step.setNum;
  }

  function findFirstOpenStepIndex(dt, pid, queue) {
    const idx = queue.findIndex(st => !isStepDone(dt, pid, st));
    return idx >= 0 ? idx : 0;
  }

  window.v3OpenPlayer = function (planId, dt = iso()) {
    const p = S.plans.find(x => x.id === planId);
    if (!p || !p.items.length) {
      toast('Plan enthält keine Übungen');
      return;
    }

    // Stoppe evtl. laufenden kleinen Basis-Timer
    if (typeof tmStop === 'function') tmStop();

    const mode = S.ui.v3PlayerMode || 'standard';
    const queue = buildPlayerQueue(p, mode);
    const cursor = findFirstOpenStepIndex(dt, p.id, queue);

    window.WP = {
      active: true,
      planId: p.id,
      dt,
      mode,
      queue,
      cursor,
      state: 'exercise', // 'exercise' | 'rest' | 'done'
      showDetails: false,
      restTotalSec: S.v27?.restSeconds || 45,
      restEndMs: 0,
      restPaused: false,
      restRemMs: 0,
      restRaf: 0,
      wl: null
    };

    try {
      if (navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(w => { if (window.WP) window.WP.wl = w; }).catch(() => {});
      }
    } catch (_) {}

    ensureWorkoutOverlayStyles();
    let ov = document.getElementById('v3PlayerOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'v3PlayerOv';
      ov.className = 'v3-player-overlay';
      document.body.appendChild(ov);
    }
    ov.style.cssText = 'position:fixed;inset:0;z-index:9990;display:block;background:var(--bg);overflow-y:auto';
    v3SyncPlayerInputs();
    v3RenderPlayer();
  };

  function v3SyncPlayerInputs() {
    if (!window.WP || !WP.queue.length) return;
    const step = WP.queue[WP.cursor];
    if (!step) return;
    const t = typeof window.v3GetSetTarget === 'function'
      ? window.v3GetSetTarget(WP.dt, WP.planId, step.itemIdx, step.setNum)
      : { reps: 10, kg: 0 };
    WP.curReps = t.reps;
    WP.curKg = t.kg;
  }

  window.v3ClosePlayer = function () {
    stopPlayerMorphLoop();
    if (window.WP) {
      cancelAnimationFrame(WP.restRaf);
      try { WP.wl && WP.wl.release && WP.wl.release().catch(() => {}); } catch (_) {}
      window.WP.active = false;
      window.WP = null;
    }
    const ov = document.getElementById('v3PlayerOv');
    if (ov) ov.style.display = 'none';
    render();
  };

  window.v3SetPlayerMode = function (newMode) {
    if (!window.WP) return;
    S.ui.v3PlayerMode = newMode;
    save();
    const p = S.plans.find(x => x.id === WP.planId);
    if (!p) return;
    WP.mode = newMode;
    WP.queue = buildPlayerQueue(p, newMode);
    WP.cursor = findFirstOpenStepIndex(WP.dt, p.id, WP.queue);
    WP.state = 'exercise';
    cancelAnimationFrame(WP.restRaf);
    v3SyncPlayerInputs();
    v3RenderPlayer();
  };

  window.v3PlayerNav = function (delta) {
    if (!window.WP) return;
    cancelAnimationFrame(WP.restRaf);
    WP.state = 'exercise';
    WP.cursor = Math.max(0, Math.min(WP.queue.length - 1, WP.cursor + delta));
    v3SyncPlayerInputs();
    v3RenderPlayer();
  };

  window.v3PlayerStepInput = function (field, delta) {
    if (!window.WP) return;
    const step = WP.queue[WP.cursor];
    if (!step) return;
    if (field === 'kg') {
      WP.curKg = Math.max(0, Math.round(((+WP.curKg || 0) + delta) * 10) / 10);
      if (typeof window.v3UpdateSetValue === 'function') {
        window.v3UpdateSetValue(WP.dt, WP.planId, step.itemIdx, step.setNum, 'kg', WP.curKg);
      }
    } else {
      WP.curReps = Math.max(1, Math.round(((+WP.curReps || 1) + delta) * 10) / 10);
      if (typeof window.v3UpdateSetValue === 'function') {
        window.v3UpdateSetValue(WP.dt, WP.planId, step.itemIdx, step.setNum, 'reps', WP.curReps);
      }
    }
    v3RenderPlayer();
  };

  window.v3PlayerChangeInput = function (field, rawVal) {
    if (!window.WP) return;
    const step = WP.queue[WP.cursor];
    if (!step) return;
    const val = Math.max(0, Number(rawVal) || 0);
    if (field === 'kg') {
      WP.curKg = val;
      if (typeof window.v3UpdateSetValue === 'function') {
        window.v3UpdateSetValue(WP.dt, WP.planId, step.itemIdx, step.setNum, 'kg', WP.curKg);
      }
    } else {
      WP.curReps = Math.max(1, val);
      if (typeof window.v3UpdateSetValue === 'function') {
        window.v3UpdateSetValue(WP.dt, WP.planId, step.itemIdx, step.setNum, 'reps', WP.curReps);
      }
    }
    v3RenderPlayer();
  };

  window.v3PlayerStartTimerForCurrent = function () {
    if (!window.WP) return;
    const p = S.plans.find(x => x.id === WP.planId);
    const step = WP.queue[WP.cursor];
    if (!p || !step) return;
    const e = ex(p.items[step.itemIdx]?.ex);
    if (!e) return;

    if (e.br) {
      brOpen(e.id, WP.curReps, WP.dt, WP.planId, step.itemIdx);
      return;
    }

    window.v3OpenPhaseTimer(
      e.id,
      WP.curReps,
      () => {
        v3CompletePlayerSet();
      },
      `${p.name} · Satz ${step.setNum}/${step.totalSets}`
    );
  };

  window.v3CompletePlayerSet = function () {
    if (!window.WP) return;
    const p = S.plans.find(x => x.id === WP.planId);
    const step = WP.queue[WP.cursor];
    if (!p || !step) return;

    const dt = WP.dt;
    const pid = WP.planId;
    const idx = step.itemIdx;
    const s = step.setNum;
    const beforePct = planPct(p, dt);

    // 1. Speichere aktuelle Stepper-Werte als Draft für diesen Satz
    if (typeof window.v3UpdateSetValue === 'function') {
      window.v3UpdateSetValue(dt, pid, idx, s, 'reps', WP.curReps);
      window.v3UpdateSetValue(dt, pid, idx, s, 'kg', WP.curKg);
    }

    // 2. Aktualisiere S.log[dt][pid][idx] und S.setLog[dt][pid][idx]
    S.log[dt] = S.log[dt] || {};
    S.log[dt][pid] = S.log[dt][pid] || {};
    S.log[dt][pid][idx] = Math.max(Number(S.log[dt][pid][idx]) || 0, s);

    if (typeof window.v3SyncSetLog === 'function') {
      window.v3SyncSetLog(dt, pid, idx, { set: s, reps: WP.curReps, kg: WP.curKg });
    }

    // Auch in S.exerciseHistory eintragen (für das Dashboard-Balkendiagramm aus v282.js)
    const e = ex(p.items[idx]?.ex);
    if (e) {
      const timed = isTimedExercise(e);
      S.exerciseHistory = Array.isArray(S.exerciseHistory) ? S.exerciseHistory : [];
      S.exerciseHistory.push({
        id: e.id,
        name: e.n,
        reps: timed ? 0 : Math.round(+WP.curReps || 1),
        seconds: timed ? (unit(e) === 'Min.' ? Math.round((+WP.curReps || 1) * 60) : Math.round(+WP.curReps || 1)) : 0,
        unit: timed ? 'seconds' : 'reps',
        at: new Date().toISOString(),
        planId: pid
      });
    }

    save();
    try { navigator.vibrate && navigator.vibrate(80); } catch (_) {}

    const afterPct = planPct(p, dt);

    // Prüfe auf 100% Plan-Abschluss (Meilensteine, Make-Me-Feel-It, Feier-Modal)
    if (beforePct < 100 && afterPct >= 100) {
      if (typeof finance281Apply === 'function') finance281Apply(p, 'plan');
      if (S.financeEnabled && typeof bookFinance === 'function') {
        bookFinance('plan-done:' + pid + ':' + dt, 'Plan', pid, p.name, 'done', cents(p.penaltyDone), new Date().toISOString());
      }
      if (typeof v27OnPlanProgress === 'function') {
        v27OnPlanProgress(dt, pid, beforePct);
      }
      save();
      WP.state = 'done';
      v3RenderPlayer();
      return;
    }

    // Nächsten offenen Schritt suchen
    let nextCursor = -1;
    for (let k = WP.cursor + 1; k < WP.queue.length; k++) {
      if (!isStepDone(dt, pid, WP.queue[k])) {
        nextCursor = k;
        break;
      }
    }
    if (nextCursor === -1) {
      nextCursor = WP.queue.findIndex(st => !isStepDone(dt, pid, st));
    }

    if (nextCursor === -1) {
      WP.state = 'done';
      v3RenderPlayer();
      return;
    }

    WP.cursor = nextCursor;
    v3SyncPlayerInputs();

    // Wenn automatische Pause aktiv ist, zeige den integrierten Pausen-Countdown im Player
    if (S.v27?.restOn !== false) {
      v3StartPlayerRest(S.v27?.restSeconds || 45);
    } else {
      WP.state = 'exercise';
      v3RenderPlayer();
    }
  };

  function v3StartPlayerRest(seconds) {
    if (!window.WP) return;
    cancelAnimationFrame(WP.restRaf);
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      AC.resume && AC.resume();
    } catch (_) {}

    WP.state = 'rest';
    WP.restPaused = false;
    WP.restTotalSec = Math.max(5, Number(seconds) || 45);
    WP.restRemMs = WP.restTotalSec * 1000;
    WP.restEndMs = performance.now() + WP.restRemMs;
    v3RenderPlayer();
    WP.restRaf = requestAnimationFrame(v3PlayerRestLoop);
  }

  function v3PlayerRestLoop() {
    if (!window.WP || WP.state !== 'rest' || WP.restPaused) return;
    const remMs = WP.restEndMs - performance.now();
    WP.restRemMs = remMs;
    if (remMs <= 0) {
      if (typeof v27GoSound === 'function') v27GoSound();
      else beep();
      WP.state = 'exercise';
      v3RenderPlayer();
      return;
    }

    const remSec = Math.ceil(remMs / 1000);
    const pctRemaining = Math.max(0, Math.min(100, (remMs / (WP.restTotalSec * 1000)) * 100));
    const timeEl = document.getElementById('v3RestTime');
    const barEl = document.getElementById('v3RestBar');
    if (timeEl) timeEl.textContent = remSec + ' s';
    if (barEl) barEl.style.width = pctRemaining.toFixed(2) + '%';

    WP.restRaf = requestAnimationFrame(v3PlayerRestLoop);
  }

  window.v3TogglePlayerRestPause = function () {
    if (!window.WP || WP.state !== 'rest') return;
    WP.restPaused = !WP.restPaused;
    if (WP.restPaused) {
      cancelAnimationFrame(WP.restRaf);
      WP.restRemMs = Math.max(0, WP.restEndMs - performance.now());
    } else {
      WP.restEndMs = performance.now() + (WP.restRemMs || 1000);
      WP.restRaf = requestAnimationFrame(v3PlayerRestLoop);
    }
    v3RenderPlayer();
  };

  window.v3AdjustPlayerRest = function (addSec) {
    if (!window.WP || WP.state !== 'rest') return;
    WP.restTotalSec = Math.max(5, WP.restTotalSec + addSec);
    if (WP.restPaused) {
      WP.restRemMs = Math.max(1000, (WP.restRemMs || 0) + addSec * 1000);
    } else {
      WP.restEndMs += addSec * 1000;
      WP.restRemMs = Math.max(0, WP.restEndMs - performance.now());
    }
    v3RenderPlayer();
  };

  window.v3SkipPlayerRest = function () {
    if (!window.WP) return;
    cancelAnimationFrame(WP.restRaf);
    WP.restPaused = false;
    WP.state = 'exercise';
    v3RenderPlayer();
  };

  let playerMorphRaf = 0;
  function stopPlayerMorphLoop() {
    if (playerMorphRaf) {
      cancelAnimationFrame(playerMorphRaf);
      playerMorphRaf = 0;
    }
  }

  function startPlayerMorphLoop() {
    stopPlayerMorphLoop();
    const box = document.querySelector('#v3PlayerOv .v3-player-morph[data-exid]');
    if (!box || !window.WP || !WP.active || WP.state !== 'exercise') return;
    const exId = box.getAttribute('data-exid');
    const e = ex(exId);
    if (!e || !Array.isArray(e.fig) || e.fig.length < 2) return;
    const f0 = e.fig[0];
    const fEnd = e.fig[1] || f0;
    const fMid = e.figMid || e.fig[2] || '';
    const frames = fMid ? [f0, fMid, fEnd] : [f0, fEnd];
    if (String(f0).startsWith('BR') || String(f0).startsWith('MD_')) return;

    function tickMorph(now) {
      const curBox = document.querySelector('#v3PlayerOv .v3-player-morph[data-exid]');
      if (!curBox || !window.WP || !WP.active || WP.state !== 'exercise') {
        playerMorphRaf = 0;
        return;
      }
      let figStr = frames[0];
      let phaseLabel = 'Start';
      if (typeof window.v3InterpolateFig === 'function') {
        if (frames.length === 2) {
          const cycle = (now % 2600) / 2600;
          const t = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
          figStr = window.v3InterpolateFig(frames[0], frames[1], t);
          phaseLabel = t < 0.25 ? 'Start' : t > 0.75 ? 'Ende' : 'Ablauf';
        } else {
          const segDur = 950;
          const pos = (now % (segDur * 4)) / segDur;
          const seg = Math.floor(pos);
          const lt = pos - seg;
          if (seg === 0) { figStr = window.v3InterpolateFig(frames[0], frames[1], lt); phaseLabel = 'Start ➔ Mitte'; }
          else if (seg === 1) { figStr = window.v3InterpolateFig(frames[1], frames[2], lt); phaseLabel = 'Mitte ➔ Ende'; }
          else if (seg === 2) { figStr = window.v3InterpolateFig(frames[2], frames[1], lt); phaseLabel = 'Ende ➔ Mitte'; }
          else { figStr = window.v3InterpolateFig(frames[1], frames[0], lt); phaseLabel = 'Mitte ➔ Start'; }
        }
      } else {
        const idx = Math.floor((now / 900) % frames.length);
        figStr = frames[idx];
        phaseLabel = idx === 0 ? 'Start' : idx === frames.length - 1 ? 'Ende' : 'Mitte';
      }
      const svgEl = curBox.querySelector('.v3-morph-svg');
      const lblEl = curBox.querySelector('.v3-morph-lbl');
      if (svgEl) svgEl.innerHTML = figSvg(figStr, e);
      if (lblEl) lblEl.textContent = phaseLabel;
      playerMorphRaf = requestAnimationFrame(tickMorph);
    }
    playerMorphRaf = requestAnimationFrame(tickMorph);
  }

  window.v3RenderPlayer = function () {
    const ov = document.getElementById('v3PlayerOv');
    if (!ov || !window.WP) return;
    const p = S.plans.find(x => x.id === WP.planId);
    if (!p) {
      v3ClosePlayer();
      return;
    }

    const totalSteps = WP.queue.length;
    const doneSteps = WP.queue.filter(st => isStepDone(WP.dt, WP.planId, st)).length;
    const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

    // 1. ABSCHLUSS-ANSICHT
    if (WP.state === 'done') {
      ov.innerHTML = `
        <div class="v3-player-wrap" style="text-align:center;padding-top:40px">
          <div style="font-size:56px">🏆</div>
          <h2>${S.lang === 'en' ? 'Workout complete!' : 'Workout abgeschlossen!'}</h2>
          <p class="mu">${esc(p.name)} · ${S.lang === 'en' ? `All ${totalSteps} sets completed for today.` : `Alle ${totalSteps} Sätze für heute erledigt.`}</p>
          <div class="bar" style="margin:16px 0"><i style="width:100%"></i></div>
          <button type="button" class="b" style="width:100%;margin-top:16px" onclick="v3ClosePlayer()">${S.lang === 'en' ? '✓ Back to overview' : '✓ Zurück zur Übersicht'}</button>
        </div>`;
      return;
    }

    const step = WP.queue[WP.cursor];
    const rawItem = p.items[step.itemIdx];
    const e = ex(rawItem?.ex);
    if (!e) return;

    // 2. PAUSEN-ANSICHT IM PLAYER
    if (WP.state === 'rest') {
      const remMsNow = WP.restPaused ? (WP.restRemMs || 0) : Math.max(0, WP.restEndMs - performance.now());
      const remSec = Math.max(0, Math.ceil(remMsNow / 1000));
      const remPct = Math.max(0, Math.min(100, (remMsNow / (WP.restTotalSec * 1000)) * 100));
      const u = unit(e);
      ov.innerHTML = `
        <div class="v3-player-wrap">
          <div class="r" style="justify-content:space-between;flex-wrap:nowrap">
            <b>⏳ ${S.lang === 'en' ? 'Rest timer' : 'Satzpause'} · ${esc(p.name)}</b>
            <button type="button" class="x" onclick="v3ClosePlayer()" aria-label="Schließen">✕</button>
          </div>
          <div class="bar" style="margin:8px 0"><i style="width:${pct}%"></i></div>

          <div class="c v3-rest-box">
            <div class="mu" style="font-size:13px">${WP.restPaused ? (S.lang === 'en' ? 'Paused' : 'Pausiert') : (S.lang === 'en' ? 'Breathe & loosen up' : 'Durchatmen & lockern')}</div>
            <div class="v3-rest-countdown" id="v3RestTime">${remSec} s</div>
            <div class="v3-shrink-bar-wrap">
              <div class="v3-shrink-bar" id="v3RestBar" style="width:${remPct.toFixed(1)}%"></div>
            </div>
            <div class="r" style="justify-content:center;gap:8px;margin-top:14px">
              <button type="button" class="b g" onclick="v3TogglePlayerRestPause()">${WP.restPaused ? (S.lang === 'en' ? '▶ Resume' : '▶ Weiter') : (S.lang === 'en' ? '⏸ Pause' : '⏸ Pause')}</button>
              <button type="button" class="chip" onclick="v3AdjustPlayerRest(-15)">−15 s</button>
              <button type="button" class="chip" onclick="v3AdjustPlayerRest(15)">+15 s</button>
              <button type="button" class="b" onclick="v3SkipPlayerRest()">${S.lang === 'en' ? '⏭️ Skip rest' : '⏭️ Überspringen'}</button>
            </div>
          </div>

          <div class="c">
            <div class="mu" style="font-size:12px">Als Nächstes (${WP.mode === 'circuit' ? `Runde ${step.round}/${step.totalRounds}` : `Satz ${step.setNum} von ${step.totalSets}`}):</div>
            <div class="r" style="margin-top:6px;flex-wrap:nowrap">
              ${fig(e, 0, 56)}${fig(e, 1, 56)}
              <div style="flex:1">
                <h3 style="margin:0">${esc(e.n)}</h3>
                <div class="mu" style="font-size:13px">Ziel: <b>${WP.curReps} ${u}</b>${+WP.curKg > 0 ? ` · <b>${WP.curKg} kg</b>` : ''}</div>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }

    // 3. AKTIVE ÜBUNGS-ANSICHT IM PLAYER
    const u = unit(e);
    const timed = isTimedExercise(e);
    const speed = isSpeedExercise(e);
    const lastPerf = typeof window.v3LastPerformance === 'function' ? window.v3LastPerformance(e.id, WP.dt) : null;
    const stepDone = isStepDone(WP.dt, WP.planId, step);
    const nextStep = WP.queue[WP.cursor + 1];
    const nextEx = nextStep ? ex(p.items[nextStep.itemIdx]?.ex) : null;

    ov.innerHTML = `
      <div class="v3-player-wrap">
        <!-- Top Header -->
        <div class="r" style="justify-content:space-between;flex-wrap:nowrap">
          <div>
            <small class="mu">${esc(p.name)} · ${getPlanLevel(p)}</small>
            <div style="font-weight:700;font-size:14px">${doneSteps} / ${totalSteps} Sätze (${pct}%)</div>
          </div>
          <button type="button" class="x" onclick="v3ClosePlayer()" aria-label="Player schließen">✕</button>
        </div>
        <div class="bar" style="margin:6px 0 10px"><i style="width:${pct}%"></i></div>

        <!-- Modus-Umschalter: Standard vs. Zirkel/Supersatz -->
        <div class="v3-mode-switch">
          <button type="button" class="chip ${WP.mode === 'standard' ? 'on' : ''}" onclick="v3SetPlayerMode('standard')">${S.lang === 'en' ? '📋 Standard (set by set)' : '📋 Standard (Satz für Satz)'}</button>
          <button type="button" class="chip ${WP.mode === 'circuit' ? 'on' : ''}" onclick="v3SetPlayerMode('circuit')">${S.lang === 'en' ? '🔄 Circuit / Superset' : '🔄 Zirkel / Supersatz'}</button>
        </div>

        <!-- Hauptkarte der aktuellen Übung -->
        <div class="c v3-player-card">
          <div class="r" style="justify-content:space-between;align-items:flex-start">
            <div style="flex:1">
              <span class="v3-set-badge">${WP.mode === 'circuit' ? `Runde ${step.round}/${step.totalRounds} · ` : ''}Satz ${step.setNum} von ${step.totalSets}</span>
              <h2 style="margin:6px 0 2px">${esc(e.n)}</h2>
              <div class="mu" style="font-size:13px">${esc(e.c)}${e.m && e.m !== '–' ? ' · ' + esc(e.m) : ''}</div>
            </div>
            ${stepDone ? `<span class="chip on" style="font-size:12px;padding:4px 10px">✓ Erledigt</span>` : ''}
          </div>

          ${lastPerf ? `<div class="v3-last-perf" style="margin-top:6px">🕒 ${esc(lastPerf.text)}</div>` : ''}

          <!-- Start, animierter Ablauf (Morph-SVG) & Ende -->
          <div class="r" style="justify-content:center;gap:10px;margin:12px 0 10px;flex-wrap:nowrap">
            ${fig(e, 0, 92)}
            ${(!e.br && Array.isArray(e.fig) && e.fig.length >= 2 && !String(e.fig[0]).startsWith('MD_')) ? `
              <div class="fg v3-player-morph" data-exid="${esc(e.id)}" style="width:112px;height:112px;border:2px solid var(--ac)">
                <div class="v3-morph-svg" style="width:100%;height:100%">${figSvg(e.fig[0], e)}</div>
                <span class="mu fl v3-morph-lbl" style="color:var(--ac);font-weight:700">Ablauf</span>
              </div>` : ''}
            ${fig(e, 1, 92)}
          </div>

          <p class="mu" style="font-size:13px;text-align:center;margin:4px 0 10px">${esc(e.d || '')}</p>

          <!-- Zusatz-Tools: Phasen-Timer / Atem-Guide / BPM / Details -->
          <div class="r" style="justify-content:center;gap:8px;margin-bottom:12px">
            ${e.br ? `<button type="button" class="b g" onclick="brOpen('${e.id}',${WP.curReps},'${WP.dt}','${WP.planId}',${step.itemIdx})">🌬️ Atem-Guide (${WP.curReps} Min.)</button>` : ''}
            ${timed && !e.br ? `<button type="button" class="b g" onclick="v3PlayerStartTimerForCurrent()">⏱️ Halte-Timer starten (${WP.curReps} ${u})</button>` : ''}
            ${speed ? `<button type="button" class="chip ${bpmTimer ? 'on' : ''}" onclick="v3OpenBpmModal('${e.id}')">🥁 BPM ${bpmTimer ? '(' + S.bpm + ' aktiv)' : ''}</button>` : ''}
            <button type="button" class="chip" style="font-size:12px;padding:6px 12px" onclick="WP.showDetails=!WP.showDetails;v3RenderPlayer()">${WP.showDetails ? '▲ Anleitung' : 'ℹ️ Anleitung'}</button>
          </div>

          ${WP.showDetails ? `<div class="c" style="background:var(--bg);margin-bottom:12px">${detTxt(e)}</div>` : ''}

          <!-- Direkte + / - Stepper für Wdh./Sek. und kg -->
          ${!e.br ? `
          <div class="v3-player-inputs">
            <div>
              <label class="mu" style="font-size:12px;display:block;margin-bottom:4px">${u === 'Wdh.' ? 'Wiederholungen' : 'Dauer (' + u + ')'}</label>
              <div class="v3-stepper-row">
                <button type="button" class="stepper" onclick="v3PlayerStepInput('reps',${u === 'Sek.' ? -5 : -1})" aria-label="Minus">−</button>
                <input type="number" min="1" step="${u === 'Min.' ? '0.5' : '1'}" value="${WP.curReps}" onchange="v3PlayerChangeInput('reps',this.value)" aria-label="${u}">
                <button type="button" class="stepper" onclick="v3PlayerStepInput('reps',${u === 'Sek.' ? 5 : 1})" aria-label="Plus">+</button>
              </div>
            </div>

            <div>
              <label class="mu" style="font-size:12px;display:block;margin-bottom:4px">Gewicht (kg)</label>
              <div class="v3-stepper-row">
                <button type="button" class="stepper" onclick="v3PlayerStepInput('kg',-2.5)" aria-label="Gewicht minus">−</button>
                <input type="number" min="0" step="0.5" value="${WP.curKg}" onchange="v3PlayerChangeInput('kg',this.value)" aria-label="Gewicht in kg">
                <button type="button" class="stepper" onclick="v3PlayerStepInput('kg',2.5)" aria-label="Gewicht plus">+</button>
              </div>
            </div>
          </div>` : ''}

          <!-- Haupt-Abschluss-Button -->
          <button type="button" class="b v3-player-complete-btn" onclick="v3CompletePlayerSet()">
            ✓ ${S.lang === 'en' ? `Complete set ${step.setNum}` : `Satz ${step.setNum} abschließen`} ${S.v27?.restOn !== false ? `(${S.v27?.restSeconds || 45}s ${S.lang === 'en' ? 'rest' : 'Pause'})` : ''}
          </button>
        </div>

        <!-- Fußzeile: Vor/Zurück Navigation & Vorschau -->
        <div class="r" style="justify-content:space-between;margin-top:8px">
          <button type="button" class="chip" ${WP.cursor <= 0 ? 'disabled style="opacity:.4"' : ''} onclick="v3PlayerNav(-1)">${S.lang === 'en' ? '← Previous set' : '← Vorheriger Satz'}</button>
          <span class="mu" style="font-size:12px">${S.lang === 'en' ? 'Step' : 'Schritt'} ${WP.cursor + 1} / ${totalSteps}</span>
          <button type="button" class="chip" ${WP.cursor >= totalSteps - 1 ? 'disabled style="opacity:.4"' : ''} onclick="v3PlayerNav(1)">${S.lang === 'en' ? 'Next set →' : 'Nächster Satz →'}</button>
        </div>

        ${nextEx ? `<div class="mu" style="text-align:center;font-size:12px;margin-top:8px">Danach: <b>${esc(nextEx.n)}</b> (Satz ${nextStep.setNum}/${nextStep.totalSets})</div>` : ''}
      </div>`;
    startPlayerMorphLoop();
  };

  // Back-Button Integration (damit ← im Header oder Android-Zurück den Player/Timer schließt)
  const _prevAppBack = appBack;
  appBack = function () {
    if (PT) {
      v3ClosePhaseTimer(false);
      return;
    }
    if (window.WP && WP.active) {
      v3ClosePlayer();
      return;
    }
    _prevAppBack();
  };

  // =========================================================================
  // 4. HOME & FAVORITEN ERWEITERN (WORKOUT-START-BUTTON & BPM-SHORTCUT)
  // =========================================================================
  const _prevVTodayWorkout = vToday;
  vToday = function () {
    const html = _prevVTodayWorkout();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    // 1. Bei jedem fälligen Plan auf Home den Button "▶ Workout starten" ergänzen
    const selects = tpl.content.querySelectorAll('select[onchange^="setPlanLevel(\'"]');
    selects.forEach(sel => {
      const m = (sel.getAttribute('onchange') || '').match(/^setPlanLevel\('([^']+)'/);
      if (!m) return;
      const pid = m[1];
      const levelRow = sel.closest('.r');
      if (!levelRow) return;

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'b v3-start-workout-btn';
      startBtn.setAttribute('onclick', `v3OpenPlayer('${pid}')`);
      startBtn.innerHTML = S.lang === 'en' ? '▶ Start workout' : '▶ Workout starten';
      levelRow.appendChild(startBtn);
    });

    // 2. Bei allen Schnelligkeits-Übungen auf Home den Button "🥁 BPM" ergänzen
    const titles = tpl.content.querySelectorAll('b[onclick^="tg(\'"]');
    titles.forEach(bEl => {
      const m = (bEl.getAttribute('onclick') || '').match(/^tg\('([^']+)_(\d+)'\)$/);
      if (!m) return;
      const pid = m[1];
      const idx = Number(m[2]);
      const p = S.plans.find(x => x.id === pid);
      const e = ex(p?.items?.[idx]?.ex);
      if (!e) return;

      const container = bEl.closest('.r')?.parentElement;
      const setBtn = container?.querySelector('button.set');
      const actionRow = setBtn?.parentElement;
      if (!actionRow) return;

      if (isSpeedExercise(e)) {
        const bpmBtn = document.createElement('button');
        bpmBtn.type = 'button';
        bpmBtn.className = 'chip' + (bpmTimer ? ' on' : '');
        bpmBtn.style.cssText = 'padding:6px 12px;min-height:38px;font-size:13px';
        bpmBtn.setAttribute('onclick', `v3OpenBpmModal('${e.id}')`);
        bpmBtn.innerHTML = '🥁 BPM';
        const editBtn = actionRow.querySelector('.v3-edit-btn');
        if (editBtn) editBtn.before(bpmBtn);
        else actionRow.appendChild(bpmBtn);
      }
    });

    return tpl.innerHTML;
  };

  // Auch in den Favoriten (favHtml) bei Schnelligkeits-Übungen den BPM-Button und bei Halte-Übungen den Phasen-Timer einbinden
  const _prevFavHtml = favHtml;
  favHtml = function () {
    const html = _prevFavHtml();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    const infoBtns = tpl.content.querySelectorAll('button[onclick^="tg(\'fav_"]');
    infoBtns.forEach(btn => {
      const m = (btn.getAttribute('onclick') || '').match(/^tg\('fav_([^']+)'\)$/);
      if (!m) return;
      const e = ex(m[1]);
      if (!e) return;
      const row = btn.parentElement;
      if (!row) return;

      if (isSpeedExercise(e)) {
        const bpmBtn = document.createElement('button');
        bpmBtn.type = 'button';
        bpmBtn.className = 'b g';
        bpmBtn.style.cssText = 'min-height:38px;padding:4px 8px;font-size:13px';
        bpmBtn.setAttribute('onclick', `v3OpenBpmModal('${e.id}')`);
        bpmBtn.innerHTML = '🥁 BPM';
        btn.before(bpmBtn);
      }
    });

    return tpl.innerHTML;
  };

  ensureWorkoutOverlayStyles();
})();
