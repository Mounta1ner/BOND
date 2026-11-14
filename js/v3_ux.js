/* Mein Training v3.0 - Modul 4: Streak-Freeze / Joker, Pausier-Modus, Plan-Duplizieren & Heatmap */
(function () {
  'use strict';

  const MAX_JOKERS_PER_MONTH = 2;

  // --- 1. STATE INITIALISIERUNG ---
  S.jokers = S.jokers || { usedDates: [], habitBackfills: [] };
  if (!Array.isArray(S.jokers.usedDates)) S.jokers.usedDates = [];
  if (!Array.isArray(S.jokers.habitBackfills)) S.jokers.habitBackfills = [];

  S.pauseMode = S.pauseMode || {
    active: false,
    since: '',
    until: '',
    reason: 'Krankheit / Erholung',
    pausedDates: []
  };
  if (!Array.isArray(S.pauseMode.pausedDates)) S.pauseMode.pausedDates = [];

  S.ui = S.ui || {};
  S.ui.v3HeatmapWeeks = S.ui.v3HeatmapWeeks || 26;
  // Standardmäßig beim App-Start eingeklappt (false)
  if (typeof S.ui.v3ExercisesOpen !== 'boolean') S.ui.v3ExercisesOpen = false;

  const EXTRA_HISTORY_LABELS = {
    heatmap: 'Aktivitäts-Heatmap (26/52 Wochen)',
    strengthChart: 'Kraft- & Leistungsverlauf'
  };

  function shiftDate(dateStr, deltaDays) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + deltaDays);
    return iso(d);
  }

  function formatShortDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return DAYS[wd(d)] + ', ' + d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  }

  function syncPauseModeDates() {
    const now = iso();
    if (!S.pauseMode.active) return;

    if (S.pauseMode.until && now > S.pauseMode.until) {
      S.pauseMode.active = false;
      save();
      return;
    }

    const start = S.pauseMode.since || now;
    const end = S.pauseMode.until && S.pauseMode.until < now ? S.pauseMode.until : now;
    let cur = start;
    let changed = false;
    for (let guard = 0; guard < 366 && cur <= end; guard++) {
      if (!S.pauseMode.pausedDates.includes(cur)) {
        S.pauseMode.pausedDates.push(cur);
        changed = true;
      }
      cur = shiftDate(cur, 1);
    }
    if (changed) save();
  }

  syncPauseModeDates();

  // --- 2. JOKER-KONTINGENT & SCHUTZ-PRÜFUNG ---
  window.v3GetJokerStats = function (monthPrefix = iso().slice(0, 7)) {
    const streakUsed = (S.jokers.usedDates || []).filter(d => String(d).slice(0, 7) === monthPrefix).length;
    const backfillUsed = (S.jokers.habitBackfills || []).filter(b => {
      const m = String(b?.usedAt || b?.date || '').slice(0, 7);
      return m === monthPrefix && b?.consumeJoker !== false;
    }).length;
    const used = streakUsed + backfillUsed;
    const remaining = Math.max(0, MAX_JOKERS_PER_MONTH - used);
    return { max: MAX_JOKERS_PER_MONTH, used, remaining, streakUsed, backfillUsed };
  };

  window.v3IsDatePaused = function (dateStr) {
    if ((S.pauseMode.pausedDates || []).includes(dateStr)) return true;
    if (S.pauseMode.active) {
      const since = S.pauseMode.since || iso();
      const until = S.pauseMode.until || '9999-12-31';
      if (dateStr >= since && dateStr <= until) return true;
    }
    return false;
  };

  window.v3IsDateProtected = function (dateStr) {
    return (S.jokers.usedDates || []).includes(dateStr) || window.v3IsDatePaused(dateStr);
  };

  function getDayCompletionInfo(d) {
    const dtObj = new Date(d + 'T12:00:00');
    const weekday = wd(dtObj);
    const born = obj => {
      if (typeof bornDay === 'function') return bornDay(obj);
      const ms = Number(String(obj.id || '').slice(1, 14));
      return ms > 1500000000000 ? iso(new Date(ms)) : '2020-01-01';
    };

    const duePlans = S.plans.filter(p => Array.isArray(p.days) && p.days.includes(weekday) && d >= born(p));
    const dueHabits = S.habits.filter(h => h.mode === 'days' && Array.isArray(h.targetDays) && h.targetDays.includes(weekday) && d >= born(h));

    const donePlans = duePlans.filter(p => planPct(p, d) >= 100);
    const doneHabits = dueHabits.filter(h => (typeof habitCountOn === 'function' ? habitCountOn(d, h.id) : (S.habitLog[d]?.[h.id] ? 1 : 0)) > 0);

    const missedPlans = duePlans.filter(p => planPct(p, d) < 100);
    const missedHabits = dueHabits.filter(h => (typeof habitCountOn === 'function' ? habitCountOn(d, h.id) : (S.habitLog[d]?.[h.id] ? 1 : 0)) <= 0);

    const due = duePlans.length + dueHabits.length;
    const done = donePlans.length + doneHabits.length;
    const protectedDay = window.v3IsDateProtected(d);

    return {
      date: d,
      due,
      done,
      missedPlans,
      missedHabits,
      isCompleteOrProtected: due > 0 && (done === due || protectedDay),
      isEndangered: due > 0 && done < due && !protectedDay
    };
  }

  function getRecentEndangeredDays(daysBack = 7) {
    const todayStr = iso();
    const list = [];
    for (let i = 1; i <= daysBack; i++) {
      const d = shiftDate(todayStr, -i);
      const info = getDayCompletionInfo(d);
      if (info.isEndangered) {
        list.push(info);
      }
    }
    return list;
  }

  // --- 3. EINSATZ 1: JOKER EINSETZEN, UM SERIE ZU RETTEN ---
  window.v3UseStreakJoker = function (dateStr) {
    if (!dateStr) return;
    if (window.v3IsDateProtected(dateStr)) {
      toast('Dieser Tag ist bereits geschützt.');
      return;
    }
    const jStats = window.v3GetJokerStats();
    if (jStats.remaining <= 0) {
      toast('Keine Joker mehr für diesen Monat übrig (max. 2 pro Monat).');
      return;
    }

    S.jokers.usedDates.push(dateStr);
    S.jokers.usedDates.sort();

    if (Array.isArray(S.financeLedger)) {
      S.financeLedger = S.financeLedger.filter(entry => !(entry.type === 'miss' && String(entry.id).endsWith(':' + dateStr)));
    }

    save();
    toast(`🃏 Joker für ${formatShortDate(dateStr)} eingesetzt – deine Serie bleibt bestehen!`);
    if (typeof v27CloseModal === 'function') v27CloseModal();
    render();
  };

  // --- 4. EINSATZ 2: VERPASSTE AKTIVITÄT NACHBUCHEN ---
  window.v3BackfillHabit = function (habitId, dateStr, useJoker = true) {
    const h = S.habits.find(x => x.id === habitId);
    if (!h || !dateStr) return;

    const jStats = window.v3GetJokerStats();
    if (useJoker && jStats.remaining <= 0) {
      toast('Keine Joker mehr für diesen Monat frei.');
      return;
    }

    S.habitLog[dateStr] = S.habitLog[dateStr] || {};
    const prev = S.habitLog[dateStr][habitId];
    const wasSkipped = prev === false;
    const prevCount = typeof prev === 'number' ? prev : (prev === true ? 1 : 0);

    S.habitLog[dateStr][habitId] = prevCount + 1;
    h.doneCount = (+h.doneCount || 0) + 1;
    if (wasSkipped && (+h.missedCount || 0) > 0) {
      h.missedCount = Math.max(0, h.missedCount - 1);
    }

    const eventTime = dateStr + 'T12:00:00.000Z';
    const uid = 'backfill-' + dateStr + '-' + habitId + '-' + Date.now();
    if (typeof addActivityEvent === 'function') {
      addActivityEvent(habitId, 'done', eventTime, 'joker', uid);
    } else {
      S.activityEvents = Array.isArray(S.activityEvents) ? S.activityEvents : [];
      S.activityEvents.push({ id: uid, habitId, name: h.name, type: 'done', at: eventTime, source: 'joker' });
    }

    if (Array.isArray(S.financeLedger)) {
      const missId = 'miss:h:' + habitId + ':' + dateStr;
      S.financeLedger = S.financeLedger.filter(e => e.id !== missId);
    }

    if (useJoker) {
      S.jokers.habitBackfills.push({
        id: uid,
        habitId,
        name: h.name,
        date: dateStr,
        usedAt: new Date().toISOString(),
        consumeJoker: true
      });
    }

    save();
    if (typeof syncWidgets === 'function') syncWidgets();
    toast(`🃏 „${h.name}“ für ${formatShortDate(dateStr)} nachgebucht!`);
    if (typeof v27CloseModal === 'function') v27CloseModal();
    render();
  };

  window.v3OpenBackfillModal = function (preselectedHabitId = '', preselectedDate = '') {
    if (!S.habits || !S.habits.length) {
      toast('Lege zuerst eine Aktivität an.');
      return;
    }
    const yesterday = shiftDate(iso(), -1);
    const defaultDate = preselectedDate || yesterday;
    const defaultHabit = preselectedHabitId || S.habits[0].id;
    const jStats = window.v3GetJokerStats();

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = shiftDate(iso(), -(i + 1));
      return { date: d, label: i === 0 ? `Gestern (${formatShortDate(d)})` : formatShortDate(d) };
    });

    v27Modal(`
      <h2>🃏 Aktivität nachbuchen</h2>
      <p class="mu" style="margin:0 0 10px">Hast du vergessen, eine erledigte Aktivität abzuhaken? Hier kannst du sie für die letzten 7 Tage nachtragen.</p>
      <div class="v3-joker-pill-bar" style="margin-bottom:12px">
        <span>🃏 Verfügbare Monats-Joker: <b>${jStats.remaining} von ${jStats.max}</b></span>
      </div>
      <label class="mu" style="font-size:13px">Aktivität auswählen
        <select id="v3BfHabit" style="margin-top:4px">
          ${S.habits.map(h => `<option value="${esc(h.id)}" ${h.id === defaultHabit ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
        </select>
      </label>
      <label class="mu" style="font-size:13px;margin-top:10px">Tag auswählen (letzte 7 Tage)
        <select id="v3BfDate" style="margin-top:4px">
          ${last7Days.map(d => `<option value="${d.date}" ${d.date === defaultDate ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
        </select>
      </label>
      <div class="r" style="margin-top:14px;gap:8px">
        <button type="button" class="b" style="flex:1" ${jStats.remaining <= 0 ? 'disabled style="opacity:.5"' : ''}
          onclick="v3BackfillHabit(document.getElementById('v3BfHabit').value, document.getElementById('v3BfDate').value, true)">
          🃏 Mit Joker nachbuchen (${jStats.remaining} frei)
        </button>
      </div>
      <button type="button" class="chip" style="width:100%;margin-top:10px" onclick="v27CloseModal()">Abbrechen</button>
    `, false);
  };

  // --- 5. PAUSIER-MODUS (KRANKHEIT / URLAUB) ---
  window.v3TogglePauseMode = function (active) {
    const reasonEl = document.getElementById('v3PauseReason');
    const untilEl = document.getElementById('v3PauseUntil');
    S.pauseMode.active = !!active;
    if (active) {
      S.pauseMode.since = iso();
      S.pauseMode.reason = reasonEl?.value?.trim() || 'Krankheit / Urlaub';
      S.pauseMode.until = untilEl?.value || shiftDate(iso(), 7);
      syncPauseModeDates();
      toast(`⏸️ Pausier-Modus aktiviert (${S.pauseMode.reason}) – deine Serien sind geschützt.`);
    } else {
      toast('▶️ Pausier-Modus beendet – willkommen zurück im Training!');
    }
    save();
    render();
  };

  window.v3SavePauseSettings = function () {
    const reasonEl = document.getElementById('v3PauseReason');
    const untilEl = document.getElementById('v3PauseUntil');
    if (reasonEl) S.pauseMode.reason = reasonEl.value.trim() || 'Krankheit / Urlaub';
    if (untilEl) S.pauseMode.until = untilEl.value || '';
    syncPauseModeDates();
    save();
    toast('Pausier-Einstellungen gespeichert');
    render();
  };

  // --- 6. ÜBERSCHREIBUNG DER STREAK- & MISS-LOGIK ---
  if (typeof scheduledMisses === 'function') {
    const _origScheduledMisses = scheduledMisses;
    scheduledMisses = function (today = iso()) {
      const raw = _origScheduledMisses(today);
      return raw.filter(m => !window.v3IsDateProtected(m.date));
    };
  }

  if (typeof stats === 'function') {
    stats = function () {
      let total = 0;
      Object.keys(S.log || {}).forEach(d => S.plans.forEach(p => { if (planPct(p, d) >= 100) total++; }));
      const fixed = S.plans.filter(p => p.days && p.days.length);
      const born = p => +String(p.id).slice(1, 14) || 0;
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      let run = 0, best = 0;
      const first = fixed.length ? Math.min(...fixed.map(born)) : Date.now();
      const n = Math.min(400, Math.max(0, Math.ceil((now.getTime() - first) / 864e5)));

      for (let k = n; k >= 0; k--) {
        const d = new Date(now);
        d.setDate(now.getDate() - k);
        const dStr = iso(d);
        const end = new Date(d);
        end.setHours(23, 59, 59);
        const pl = fixed.filter(p => p.days.includes(wd(d)) && born(p) <= end.getTime());
        if (!pl.length) continue;
        const ok = pl.every(p => planPct(p, dStr) >= 100);
        if (ok) {
          run++;
          best = Math.max(best, run);
        } else if (window.v3IsDateProtected(dStr) || k === 0) {
          continue;
        } else {
          run = 0;
        }
      }
      return { total, run, best };
    };
  }

  if (typeof v27Streak === 'function') {
    v27Streak = function (p) {
      let streak = 0;
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      const base = new Date(now);
      base.setDate(base.getDate() - wd(base));

      for (let k = 0; k < 52; k++) {
        const start = new Date(base);
        start.setDate(start.getDate() - 7 * k);
        let done = 0;
        let protectedCount = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const dStr = iso(d);
          if (planPct(p, dStr) >= 100) {
            done++;
          } else if (window.v3IsDateProtected(dStr) && (p.days?.length ? p.days.includes(wd(d)) : true)) {
            protectedCount++;
          }
        }
        const required = p.days?.length ? p.days.length : (+p.pw || 1);
        if (done + protectedCount >= required) {
          streak++;
        } else if (k === 0) {
          continue;
        } else {
          break;
        }
      }
      return streak;
    };
  }

  window.v3ComputeProtectedDashboardStats = function () {
    let run = 0, best = 0, miss = 0;
    const now = iso();
    for (let i = 364; i >= 0; i--) {
      const d = shiftDate(now, -i);
      const info = getDayCompletionInfo(d);
      if (!info.due) continue;

      if (info.done === info.due) {
        run++;
        best = Math.max(best, run);
      } else if (window.v3IsDateProtected(d)) {
        continue;
      } else if (i > 0) {
        miss += (info.due - info.done);
        run = 0;
      }
    }
    return { run, best, miss };
  };

  // --- 7. BANNER FÜR „SERIE IN GEFAHR“ / PAUSIER-MODUS ---
  function renderStreakRescueBannerHtml() {
    const jStats = window.v3GetJokerStats();
    let html = '';

    if (S.pauseMode.active) {
      html += `
        <div class="c v3-pause-banner">
          <div class="r" style="justify-content:space-between">
            <b>⏸️ Pausier-Modus aktiv: ${esc(S.pauseMode.reason || 'Regeneration')}</b>
            <span class="chip on" style="font-size:11px;padding:3px 8px">Serie geschützt 🛡️</span>
          </div>
          <p class="mu" style="font-size:13px;margin:4px 0 8px">
            Deine Trainings- und Aktivitätsserien sind${S.pauseMode.until ? ' bis ' + new Date(S.pauseMode.until + 'T12:00:00').toLocaleDateString('de-AT') : ''} eingefroren. Es werden keine Fehltage gezählt.
          </p>
          <button type="button" class="b g" style="padding:6px 12px;min-height:36px;font-size:13px" onclick="v3TogglePauseMode(false)">▶️ Pause jetzt beenden</button>
        </div>`;
    }

    const endangered = getRecentEndangeredDays(7);
    if (endangered.length > 0 && !S.pauseMode.active) {
      const target = endangered[0];
      const missedNames = [
        ...target.missedPlans.map(p => p.name),
        ...target.missedHabits.map(h => h.name)
      ].join(', ');

      html += `
        <div class="c v3-joker-alert">
          <div class="r" style="justify-content:space-between">
            <b>🃏 Serie in Gefahr!</b>
            <span class="chip" style="font-size:11px;padding:2px 8px">${jStats.remaining} von ${jStats.max} Jokern frei</span>
          </div>
          <p class="mu" style="font-size:13px;margin:6px 0 10px">
            Am <b>${esc(formatShortDate(target.date))}</b> blieben geplante Einheiten offen (<i>${esc(missedNames)}</i>). Setze einen Joker ein, um deine Serie zu retten, oder buche eine vergessene Aktivität nach:
          </p>
          <div class="r" style="gap:8px">
            <button type="button" class="b" ${jStats.remaining <= 0 ? 'disabled style="opacity:.5"' : ''} onclick="v3UseStreakJoker('${target.date}')">
              🃏 Joker einsetzen für ${esc(formatShortDate(target.date))} (${jStats.remaining} von ${jStats.max} diesen Monat frei)
            </button>
            ${target.missedHabits.length ? `
              <button type="button" class="b g" onclick="v3OpenBackfillModal('${target.missedHabits[0].id}','${target.date}')">
                ✓ Aktivität nachbuchen
              </button>` : ''}
          </div>
        </div>`;
    }

    return html;
  }

  // --- 8. PLAN DUPLIZIEREN (vPlans) ---
  window.v3DuplicatePlan = function (pid) {
    const p = S.plans.find(x => x.id === pid);
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = 'p' + Date.now();
    copy.name = p.name + ' (Kopie)';
    delete copy.intro;
    S.plans.push(copy);
    save();
    render();
    toast(`📋 Plan „${copy.name}“ angelegt`);
  };

  const _prevVPlansUx = vPlans;
  vPlans = function () {
    const html = _prevVPlansUx();
    if (ed) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    const editBtns = tpl.content.querySelectorAll('button[onclick^="editPlan(\'"]');
    editBtns.forEach(btn => {
      const m = (btn.getAttribute('onclick') || '').match(/^editPlan\('([^']+)'\)$/);
      if (!m) return;
      const pid = m[1];
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'b g';
      dupBtn.setAttribute('onclick', `v3DuplicatePlan('${pid}')`);
      dupBtn.innerHTML = '📋 Duplizieren';
      btn.after(dupBtn);
    });

    return tpl.innerHTML;
  };

  // --- 9. 26 / 52-WOCHEN AKTIVITÄTS-HEATMAP IM DASHBOARD ---
  function computeDailyActivityMap(daysCount = 370) {
    const map = {};
    const now = iso();
    for (let i = 0; i <= daysCount; i++) {
      const d = shiftDate(now, -i);
      map[d] = { sets: 0, exercises: 0, habits: 0, total: 0, joker: (S.jokers.usedDates || []).includes(d), paused: window.v3IsDatePaused(d) };
    }

    Object.keys(S.log || {}).forEach(d => {
      if (!map[d]) return;
      const dayLog = S.log[d] || {};
      Object.keys(dayLog).forEach(pid => {
        const pLog = dayLog[pid] || {};
        Object.values(pLog).forEach(cnt => {
          map[d].sets += Number(cnt) || 0;
        });
      });
    });

    (S.exerciseHistory || []).forEach(ev => {
      if (!ev || !ev.at) return;
      const d = iso(new Date(ev.at));
      if (map[d] && !ev.planId) {
        map[d].exercises += 1;
      }
    });

    Object.keys(S.habitLog || {}).forEach(d => {
      if (!map[d]) return;
      const hLog = S.habitLog[d] || {};
      Object.values(hLog).forEach(val => {
        const cnt = typeof val === 'number' ? val : (val === true ? 1 : 0);
        if (cnt > 0) map[d].habits += cnt;
      });
    });

    Object.values(map).forEach(entry => {
      entry.total = entry.sets + entry.exercises + entry.habits;
    });

    return map;
  }

  window.v3SetHeatmapWeeks = function (w) {
    S.ui.v3HeatmapWeeks = Number(w) === 52 ? 52 : 26;
    save();
    render();
  };

  window.v3HeatmapCard = function () {
    const weeks = S.ui.v3HeatmapWeeks === 52 ? 52 : 26;
    const actMap = computeDailyActivityMap(weeks * 7 + 14);
    const todayStr = iso();
    const todayDate = new Date(todayStr + 'T12:00:00');
    const currentWeekMonday = shiftDate(todayStr, -wd(todayDate));
    const startMonday = shiftDate(currentWeekMonday, -(weeks - 1) * 7);

    const cell = 12;
    const gap = 3;
    const step = cell + gap;
    const leftPad = 24;
    const topPad = 18;
    const svgWidth = leftPad + weeks * step + 6;
    const svgHeight = topPad + 7 * step + 4;

    const monthsShort = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    let monthLabels = '';
    let lastMonth = -1;
    let cellsSvg = '';
    let activeDaysCount = 0;

    for (let w = 0; w < weeks; w++) {
      const colMonday = shiftDate(startMonday, w * 7);
      const mIdx = new Date(colMonday + 'T12:00:00').getMonth();
      if (mIdx !== lastMonth && w < weeks - 1) {
        lastMonth = mIdx;
        monthLabels += `<text x="${leftPad + w * step}" y="12" font-size="9" fill="var(--mu)">${monthsShort[mIdx]}</text>`;
      }

      for (let dIdx = 0; dIdx < 7; dIdx++) {
        const curDate = shiftDate(colMonday, dIdx);
        if (curDate > todayStr) continue;

        const info = actMap[curDate] || { total: 0, sets: 0, habits: 0, joker: false, paused: false };
        if (info.total > 0) activeDaysCount++;

        const x = leftPad + w * step;
        const y = topPad + dIdx * step;

        let fill = 'var(--bd)';
        let fillOp = '0.45';
        if (info.total > 0) {
          fill = 'var(--ok)';
          fillOp = info.total >= 8 ? '1' : info.total >= 4 ? '0.78' : info.total >= 2 ? '0.56' : '0.36';
        } else if (info.joker || info.paused) {
          fill = 'var(--ac2)';
          fillOp = '0.9';
        }

        const stroke = (info.joker || info.paused)
          ? `stroke="var(--mc)" stroke-width="1.4"`
          : curDate === todayStr
            ? `stroke="var(--ac)" stroke-width="1.2"`
            : '';

        const statusNote = info.joker ? ' · 🃏 Joker' : info.paused ? ' · ⏸️ Pausiert' : '';
        const titleTxt = `${curDate}: ${info.total} Aktionen (${info.sets} Sätze, ${info.habits} Routinen)${statusNote}`;

        cellsSvg += `
          <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3"
            fill="${fill}" fill-opacity="${fillOp}" ${stroke}
            style="cursor:pointer" onclick="d282Day('${curDate}')">
            <title>${esc(titleTxt)}</title>
          </rect>`;
      }
    }

    const dayLabels = [
      [0, 'Mo'],
      [2, 'Mi'],
      [4, 'Fr'],
      [6, 'So']
    ].map(([idx, lbl]) => `<text x="0" y="${topPad + idx * step + 9}" font-size="9" fill="var(--mu)">${lbl}</text>`).join('');

    const jStats = window.v3GetJokerStats();

    return `
      <div class="c" data-v3-section="heatmap">
        <div class="r" style="justify-content:space-between;align-items:center">
          <div>
            <h3>🗓️ Aktivitäts-Heatmap (Letzte ${weeks} Wochen)</h3>
            <span class="mu" style="font-size:12px">${activeDaysCount} aktive Tage · 🃏 ${jStats.remaining}/${jStats.max} Joker frei</span>
          </div>
          <div class="r" style="gap:4px">
            <button type="button" class="chip ${weeks === 26 ? 'on' : ''}" style="padding:5px 10px;font-size:12px" onclick="v3SetHeatmapWeeks(26)">26 Wo.</button>
            <button type="button" class="chip ${weeks === 52 ? 'on' : ''}" style="padding:5px 10px;font-size:12px" onclick="v3SetHeatmapWeeks(52)">52 Wo.</button>
          </div>
        </div>

        <div class="v3-heatmap-scroll">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="Aktivitäts-Heatmap">
            ${monthLabels}
            ${dayLabels}
            ${cellsSvg}
          </svg>
        </div>

        <div class="r" style="justify-content:space-between;font-size:11px;margin-top:6px">
          <span class="mu">Kästchen antippen für Tages-Details & Nachbuchen</span>
          <span class="r" style="gap:4px;font-size:11px;color:var(--mu)">
            Weniger
            <i class="v3-hm-leg" style="background:var(--bd);opacity:.45"></i>
            <i class="v3-hm-leg" style="background:var(--ok);opacity:.38"></i>
            <i class="v3-hm-leg" style="background:var(--ok);opacity:.72"></i>
            <i class="v3-hm-leg" style="background:var(--ok);opacity:1"></i>
            Mehr · <span style="border:1.5px solid var(--mc);padding:0 4px;border-radius:4px">🃏/⏸️</span>
          </span>
        </div>
      </div>`;
  };

  if (typeof window.d282Day === 'function') {
    const _origD282Day = window.d282Day;
    window.d282Day = function (d) {
      _origD282Day(d);
      const modal = document.querySelector('#v27Overlay .v27Modal');
      if (!modal) return;

      const isJoker = (S.jokers.usedDates || []).includes(d);
      const isPaused = window.v3IsDatePaused(d);
      const info = getDayCompletionInfo(d);
      const jStats = window.v3GetJokerStats();

      const extraDiv = document.createElement('div');
      extraDiv.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid var(--bd)';

      let badges = '';
      if (isJoker) badges += `<div class="chip on" style="display:inline-block;font-size:12px;margin-bottom:8px">🃏 Durch Joker geschützt</div> `;
      if (isPaused) badges += `<div class="chip on" style="display:inline-block;font-size:12px;margin-bottom:8px">⏸️ Pausiert (${esc(S.pauseMode.reason || 'Ruhephase')})</div>`;

      let actions = '';
      if (d < iso()) {
        actions = `
          <div class="r" style="gap:6px;margin-top:6px">
            ${info.isEndangered && jStats.remaining > 0 ? `
              <button type="button" class="b" style="font-size:12px;padding:6px 12px;min-height:36px" onclick="v3UseStreakJoker('${d}')">
                🃏 Joker für diesen Tag einsetzen (${jStats.remaining} frei)
              </button>` : ''}
            ${S.habits.length ? `
              <button type="button" class="b g" style="font-size:12px;padding:6px 12px;min-height:36px" onclick="v3OpenBackfillModal('','${d}')">
                ✓ Aktivität für ${new Date(d + 'T12:00:00').toLocaleDateString('de-AT')} nachbuchen
              </button>` : ''}
          </div>`;
      }

      if (badges || actions) {
        extraDiv.innerHTML = badges + actions;
        const closeBtn = modal.querySelector('button[onclick="v27CloseModal()"]');
        if (closeBtn) closeBtn.before(extraDiv);
        else modal.appendChild(extraDiv);
      }
    };
  }

  // --- 10. INTEGRATION IN HOME (vToday), DASHBOARD (vHist) & SETTINGS (vSet) ---
  function ensureHeatmapInHistoryOrder() {
    S.ui.historyOrder = Array.isArray(S.ui.historyOrder) ? S.ui.historyOrder : [];
    if (!S.ui.historyOrder.includes('heatmap')) {
      const chartIdx = S.ui.historyOrder.indexOf('chart');
      if (chartIdx >= 0) S.ui.historyOrder.splice(chartIdx, 0, 'heatmap');
      else S.ui.historyOrder.unshift('heatmap');
    }
  }

  const _prevVTodayUx = vToday;
  vToday = function () {
    const html = _prevVTodayUx();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    const rescueHtml = renderStreakRescueBannerHtml();
    if (rescueHtml) {
      const planSec = tpl.content.querySelector('section[data-module="plans"]') || tpl.content;
      const wrap = document.createElement('template');
      wrap.innerHTML = rescueHtml;
      planSec.prepend(...wrap.content.children);
    }

    if (S.habits && S.habits.length > 0) {
      const yesterday = shiftDate(iso(), -1);
      const actHeaders = [...tpl.content.querySelectorAll('h3')].filter(h => /Aktivitäten & Routinen|Activities/i.test(h.textContent || ''));
      actHeaders.forEach(h3 => {
        const card = h3.closest('.c');
        const headerRow = h3.closest('.r');
        const btnGroup = headerRow?.querySelector('.r');
        if (btnGroup && !card.querySelector('.v3-backfill-home-btn')) {
          const bfBtn = document.createElement('button');
          bfBtn.type = 'button';
          bfBtn.className = 'chip v3-backfill-home-btn';
          bfBtn.style.cssText = 'font-size:12px;padding:4px 10px;min-height:36px';
          bfBtn.setAttribute('onclick', `v3OpenBackfillModal('','${yesterday}')`);
          bfBtn.innerHTML = '🃏 Gestern nachbuchen';
          btnGroup.prepend(bfBtn);
        }
      });
    }

    return tpl.innerHTML;
  };

  const _prevVHistUx = vHist;
  vHist = function () {
    ensureHeatmapInHistoryOrder();
    const html = _prevVHistUx();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    // 1. Top-Statistik-Kacheln mit geschützten Werten aktualisieren
    const pStats = window.v3ComputeProtectedDashboardStats();
    const firstStatsRow = tpl.content.querySelector('.d282-stats');
    if (firstStatsRow) {
      const tiles = firstStatsRow.querySelectorAll('.d282-stat strong');
      if (tiles[0]) tiles[0].textContent = pStats.run;
      if (tiles[1]) tiles[1].textContent = pStats.best;
      if (tiles[2]) tiles[2].textContent = pStats.miss;
    }

    // 2. Warnbanner oben im Dashboard einfügen
    const rescueHtml = renderStreakRescueBannerHtml();
    if (rescueHtml) {
      const h2 = tpl.content.querySelector('h2');
      const wrap = document.createElement('template');
      wrap.innerHTML = rescueHtml;
      if (h2) h2.after(...wrap.content.children);
      else tpl.content.prepend(...wrap.content.children);
    }

    // 3. Heatmap einfügen (unter Berücksichtigung von Sichtbarkeit & Reihenfolge)
    if (!tpl.content.querySelector('[data-v3-section="heatmap"]') && S.ui.historyVisible?.heatmap !== false) {
      const hmWrap = document.createElement('template');
      hmWrap.innerHTML = window.v3HeatmapCard();
      const chartCard = [...tpl.content.querySelectorAll('.c')].find(c => /trainingsentwicklung/i.test(c.querySelector('h3')?.textContent || ''));
      if (chartCard) chartCard.before(hmWrap.content.firstElementChild);
      else tpl.content.appendChild(hmWrap.content.firstElementChild);
    }

    // 4. „Absolvierte Einzelübungen“ einklappbar machen (beim Start eingeklappt)
    const exCard = [...tpl.content.querySelectorAll('.c')].find(c => /^Absolvierte Einzelübungen/i.test(c.querySelector(':scope > h3')?.textContent?.trim() || ''));
    if (exCard) {
      const h3 = exCard.querySelector(':scope > h3');
      const rows = [...exCard.querySelectorAll('.settingsRow')];
      const count = rows.length;
      const titleText = h3 ? h3.textContent.trim() : 'Absolvierte Einzelübungen';
      if (h3) h3.remove();
      const innerHtml = exCard.innerHTML;
      const openAttr = S.ui.v3ExercisesOpen ? 'open' : '';
      exCard.innerHTML = `<details ${openAttr} ontoggle="S.ui.v3ExercisesOpen=this.open;save()"><summary style="font-weight:700;cursor:pointer">${esc(titleText)} (${count})</summary><div style="margin-top:8px">${innerHtml}</div></details>`;
    }

    // 5. In der Aktivitäten-Karte im Dashboard „🃏 Gestern nachbuchen“ ergänzen
    const actCard = [...tpl.content.querySelectorAll('.c')].find(c => /⚡ Aktivitäten/i.test(c.querySelector('h3')?.textContent || ''));
    if (actCard && S.habits.length && !actCard.querySelector('.v3-backfill-hist-btn')) {
      const yesterday = shiftDate(iso(), -1);
      const h3 = actCard.querySelector('h3');
      const topRow = document.createElement('div');
      topRow.className = 'r';
      topRow.style.cssText = 'justify-content:space-between;margin-bottom:8px';
      topRow.innerHTML = `<h3 style="margin:0">${h3.innerHTML}</h3><button type="button" class="b g v3-backfill-hist-btn" style="padding:6px 12px;min-height:36px;font-size:12px" onclick="v3OpenBackfillModal('','${yesterday}')">🃏 Gestern nachbuchen</button>`;
      h3.replaceWith(topRow);
    }

    return tpl.innerHTML;
  };

  const _prevVSetUx = vSet;
  vSet = function () {
    ensureHeatmapInHistoryOrder();
    const html = _prevVSetUx();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    // 1. Repariere alle "undefined"-Labels in "Verlauf Reihung und Anzeige konfigurieren"
    const historyCheckboxes = tpl.content.querySelectorAll('input[onchange^="d282ToggleHistory("]');
    historyCheckboxes.forEach(cb => {
      const m = (cb.getAttribute('onchange') || '').match(/^d282ToggleHistory\('([^']+)'/);
      if (!m) return;
      const key = m[1];
      const lbl = cb.closest('label');
      if (!lbl) return;
      if (/undefined/i.test(lbl.textContent || '')) {
        const cleanName = EXTRA_HISTORY_LABELS[key] || key;
        lbl.innerHTML = '';
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + cleanName));
      }
    });

    // Falls 'heatmap' noch gar nicht in der Liste stand, ergänzen
    if (!tpl.content.querySelector('input[onchange^="d282ToggleHistory(\'heatmap\'"]')) {
      const histSummary = [...tpl.content.querySelectorAll('summary')].find(s => /Verlauf Reihung|Configure history/i.test(s.textContent || ''));
      const container = histSummary?.parentElement?.querySelector('div');
      if (container) {
        const idx = S.ui.historyOrder.indexOf('heatmap');
        const checked = S.ui.historyVisible?.heatmap === false ? '' : 'checked';
        const row = document.createElement('div');
        row.className = 'settingsRow';
        row.innerHTML = `<label style="flex:1"><input type="checkbox" ${checked} onchange="d282ToggleHistory('heatmap',this.checked)"> ${EXTRA_HISTORY_LABELS.heatmap}</label><button class="chip" onclick="d282MoveHistory(${idx},-1)">↑</button><button class="chip" onclick="d282MoveHistory(${idx},1)">↓</button>`;
        container.prepend(row);
      }
    }

    // 2. Einstellungen für „🛡️ Serien-Schutz: Joker & Pausier-Modus“ ergänzen
    const jStats = window.v3GetJokerStats();
    const pauseCard = document.createElement('div');
    pauseCard.className = 'c';
    pauseCard.innerHTML = `
      <h3>🛡️ Serien-Schutz: Joker & Pausier-Modus</h3>
      <p class="mu" style="font-size:13px;margin:4px 0 10px">
        Du erhältst jeden Monat <b>2 Joker</b>, um verpasste Pflichttage zu überbrücken oder vergessene Aktivitäten nachzubuchen. Bei Krankheit oder Urlaub kannst du deine Serien hier pausieren.
      </p>
      <div class="v3-joker-pill-bar" style="margin-bottom:10px">
        <span>🃏 Diesen Monat frei: <b>${jStats.remaining} von ${jStats.max}</b></span>
        <span class="mu" style="font-size:12px">Genutzt: ${jStats.used}×</span>
      </div>
      <label class="settingsRow">
        <input type="checkbox" ${S.pauseMode.active ? 'checked' : ''} onchange="v3TogglePauseMode(this.checked)">
        <b>⏸️ Pausier-Modus aktivieren (Krankheit / Urlaub / Verletzung)</b>
      </label>
      <div class="r" style="margin-top:8px">
        <div style="flex:1;min-width:150px">
          <label class="mu" style="font-size:12px">Grund</label>
          <input id="v3PauseReason" value="${esc(S.pauseMode.reason || 'Krankheit / Erholung')}" placeholder="z. B. Erkältung, Urlaub">
        </div>
        <div style="flex:1;min-width:140px">
          <label class="mu" style="font-size:12px">Pausiert bis (einschließlich)</label>
          <input id="v3PauseUntil" type="date" value="${esc(S.pauseMode.until || shiftDate(iso(), 7))}">
        </div>
      </div>
      <div class="r" style="margin-top:10px;gap:8px">
        <button type="button" class="b g" onclick="v3SavePauseSettings()">💾 Pause-Zeitraum speichern</button>
        ${S.habits.length ? `<button type="button" class="chip" onclick="v3OpenBackfillModal()">🃏 Aktivität nachbuchen</button>` : ''}
      </div>`;

    const trainingCard = [...tpl.content.querySelectorAll('.c')].find(c => /^Training$|^Workout$/i.test(c.querySelector('h3')?.textContent || ''));
    if (trainingCard) trainingCard.after(pauseCard);
    else tpl.content.appendChild(pauseCard);

    return tpl.innerHTML;
  };

  render();
})();