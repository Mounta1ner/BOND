/* Offline-first & Over-the-Air (OTA) Catalog Loader for GitHub Pages and Capacitor APK (v3.0) */
(async function () {
  'use strict';

  const CATALOG_CACHE_KEY = 'mt_catalog_cache_v1';
  const CATALOG_META_KEY = 'mt_catalog_meta_v1';
  const REMOTE_URL_KEY = 'mt_remote_data_url';
  const ADMIN_STORAGE_KEY = 'mt_admin_catalog_overrides_v1';

  // HIER deine feste GitHub-Pages URL eintragen (wird von der installierten Android-APK automatisch genutzt):
  const DEFAULT_REMOTE_DATA_BASE = 'https://DEIN-GITHUB-USERNAME.github.io/DEIN-REPO/data/';

  const paths = ['exercises', 'plans', 'translations'];
  const modules = [
    'app',
    'features',
    'tracking-advanced',
    'v27',
    'v28',
    'v282',
    'v3_tracking',
    'v3_workout',
    'v3_progression',
    'v3_ux',
    'v3_admin'
  ];

  function normalizeBaseUrl(url) {
    const clean = String(url || '').trim();
    if (!clean) return '';
    return clean.endsWith('/') ? clean : clean + '/';
  }

  // Ermittelt die beste Quelle für Online-Updates (in der APK -> GitHub Pages, im Web -> ./data/ oder Custom-URL)
  window.v3GetRemoteDataBase = function () {
    const custom = normalizeBaseUrl(localStorage.getItem(REMOTE_URL_KEY));
    if (custom) return custom;
    const isCapacitorOrLocal =
      !!window.Capacitor ||
      !!window.AndroidBridge ||
      location.protocol === 'capacitor:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (isCapacitorOrLocal && !DEFAULT_REMOTE_DATA_BASE.includes('DEIN-GITHUB-USERNAME')) {
      return normalizeBaseUrl(DEFAULT_REMOTE_DATA_BASE);
    }
    return './data/';
  };

  function validateCatalogData(data) {
    return (
      Array.isArray(data) &&
      Array.isArray(data[0]) &&
      data[0].length > 0 &&
      data[1] &&
      Array.isArray(data[1].templates) &&
      Array.isArray(data[1].curated) &&
      data[2] &&
      data[2].de
    );
  }

  function readCachedCatalog() {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validateCatalogData(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeCachedCatalog(dataArray) {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(dataArray));
    } catch (e) {
      console.warn('Katalog-Cache konnte nicht gespeichert werden:', e);
    }
  }

  function readCatalogMeta() {
    try {
      return JSON.parse(localStorage.getItem(CATALOG_META_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeCatalogMeta(metaPatch) {
    try {
      const next = Object.assign(readCatalogMeta(), metaPatch);
      localStorage.setItem(CATALOG_META_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return {};
    }
  }

  async function fetchBundledCatalog() {
    const data = await Promise.all(
      paths.map(async key => {
        const response = await fetch('./data/' + key + '.json', { cache: 'no-cache' });
        if (!response.ok) throw Error(key + ' HTTP ' + response.status);
        return response.json();
      })
    );
    if (!validateCatalogData(data)) {
      throw Error('Ungueltig strukturierte Daten');
    }
    return data;
  }

  // Entfernt doppelte "Laufen"-Einträge (falls ADD6_RAW aus app.js und exercises.json aufeinandertreffen)
  // und wendet lokale Admin-Bearbeitungen (mt_admin_catalog_overrides_v1) wieder darüber an.
  function buildCleanOfficialExerciseList(rawExercises) {
    const list = [];
    const seenIds = new Set();
    let laufenSeen = false;

    for (const item of rawExercises) {
      if (!item || !item.id || String(item.id)[0] === 'c') continue;
      if (item.n === 'Laufen') {
        if (laufenSeen) continue;
        laufenSeen = true;
        if (!item.yt) {
          item.yt = { id: 'XQ0hB29DMpo', t: 'Joggen: Meine 5 Tipps zum Einstieg ins Lauftraining (ARD Gesund, Dr. Julia Fischer)' };
        }
      }
      if (seenIds.has(item.id)) {
        const idx = list.findIndex(x => x.id === item.id);
        if (idx >= 0) list[idx] = item;
      } else {
        seenIds.add(item.id);
        list.push(item);
      }
    }

    // Falls "Laufen" noch nicht in der geladenen JSON war, aber in EX (aus ADD6_RAW) existiert, behalten
    if (!laufenSeen && typeof EX !== 'undefined' && Array.isArray(EX)) {
      const existingLaufen = EX.find(x => x && x.n === 'Laufen');
      if (existingLaufen) {
        const copy = Object.assign({}, existingLaufen);
        if (seenIds.has(copy.id)) {
          const maxNum = Math.max(131, ...list.map(x => Number(String(x.id).replace(/\D/g, '')) || 0));
          copy.id = 'e' + (maxNum + 1);
        }
        list.push(copy);
      }
    }

    // Lokale Admin-Overrides (vom Ersteller lokal gespeicherte Übungen) darüberlegen
    try {
      const adminRaw = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (adminRaw) {
        const adminList = JSON.parse(adminRaw);
        if (Array.isArray(adminList)) {
          adminList.forEach(ov => {
            if (!ov || !ov.id) return;
            const idx = list.findIndex(x => x.id === ov.id);
            if (idx >= 0) list[idx] = Object.assign({}, list[idx], ov);
            else list.push(ov);
          });
        }
      }
    } catch (_) {}

    return list;
  }

  function computeCatalogFingerprint(exercisesArray) {
    try {
      return exercisesArray.length + ':' + JSON.stringify(exercisesArray).length;
    } catch (_) {
      return String(exercisesArray.length);
    }
  }

  // --- OTA HINTERGRUND-SYNCHRONISATION ---
  let syncInProgress = false;
  window.v3SyncCatalogNow = async function (silent = true) {
    if (syncInProgress) return false;
    syncInProgress = true;
    const base = window.v3GetRemoteDataBase();

    try {
      const bust = '?t=' + Date.now();
      const exRes = await fetch(base + 'exercises.json' + bust, { cache: 'no-store' });
      if (!exRes.ok) throw Error('HTTP ' + exRes.status);
      const remoteExercises = await exRes.json();
      if (!Array.isArray(remoteExercises) || !remoteExercises.length) {
        throw Error('Ungueltiges exercises.json Format');
      }

      // Optional auch plans.json und translations.json aktualisieren (falls erreichbar)
      let remotePlans = window.FITNESS_CATALOG?.plans;
      let remoteTrans = window.FITNESS_CATALOG?.translations;
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(base + 'plans.json' + bust, { cache: 'no-store' }),
          fetch(base + 'translations.json' + bust, { cache: 'no-store' })
        ]);
        if (pRes.ok) {
          const pJson = await pRes.json();
          if (pJson && Array.isArray(pJson.templates)) remotePlans = pJson;
        }
        if (tRes.ok) {
          const tJson = await tRes.json();
          if (tJson && tJson.de) remoteTrans = tJson;
        }
      } catch (_) {}

      const mergedOfficial = buildCleanOfficialExerciseList(remoteExercises);
      const oldCount = typeof EX !== 'undefined' ? EX.length : 0;
      const oldFp = readCatalogMeta().fingerprint || computeCatalogFingerprint(typeof EX !== 'undefined' ? EX : []);
      const newFp = computeCatalogFingerprint(mergedOfficial);

      // Speichere im Offline-Cache
      writeCachedCatalog([mergedOfficial, remotePlans, remoteTrans]);
      writeCatalogMeta({
        lastCheck: new Date().toISOString(),
        lastSource: base,
        count: mergedOfficial.length,
        fingerprint: newFp
      });

      // Aktualisiere EX in-place (alle Referenzen in app.js bleiben erhalten, S.custom bleibt in all() unberührt!)
      if (typeof EX !== 'undefined' && Array.isArray(EX)) {
        EX.splice(0, EX.length, ...mergedOfficial);
      }
      if (window.FITNESS_CATALOG) {
        window.FITNESS_CATALOG.exercises = mergedOfficial;
        if (remotePlans) window.FITNESS_CATALOG.plans = remotePlans;
        if (remoteTrans) window.FITNESS_CATALOG.translations = remoteTrans;
      }

      const diff = Math.max(0, mergedOfficial.length - oldCount);
      const hasChanged = newFp !== oldFp || diff > 0;

      if (hasChanged) {
        if (typeof render === 'function') render();
        if (typeof toast === 'function') {
          toast(
            diff > 0
              ? `✨ Übungskatalog aktualisiert (+${diff} neue ${diff === 1 ? 'Übung' : 'Übungen'})`
              : '✨ Übungskatalog aktualisiert'
          );
        }
      } else if (!silent) {
        if (typeof render === 'function') render();
        if (typeof toast === 'function') {
          toast(`✓ Übungskatalog ist auf dem neuesten Stand (${mergedOfficial.length} Übungen)`);
        }
      }
      return true;
    } catch (err) {
      console.warn('OTA Katalog-Sync Hinweis:', err.message);
      if (!silent && typeof toast === 'function') {
        toast('⚠️ Online-Katalog derzeit nicht erreichbar – lokaler Offline-Stand aktiv.');
      }
      return false;
    } finally {
      syncInProgress = false;
    }
  };

  window.v3SaveRemoteUrl = function (urlValue) {
    const clean = normalizeBaseUrl(urlValue);
    if (!clean) {
      localStorage.removeItem(REMOTE_URL_KEY);
      if (typeof toast === 'function') toast('Standard-Update-Quelle wiederhergestellt');
    } else {
      localStorage.setItem(REMOTE_URL_KEY, clean);
      if (typeof toast === 'function') toast('Update-URL gespeichert: ' + clean);
    }
    window.v3SyncCatalogNow(false);
  };

  // --- UI-INJEKTION FÜR EINSTELLUNGEN (MANUELLER SYNC) & ADMIN-MODUS (URL-FELD) ---
  function installOtaSettingsUi() {
    if (typeof vSet !== 'function') return;
    const _prevVSetOta = vSet;
    vSet = function () {
      const html = _prevVSetOta();
      const tpl = document.createElement('template');
      tpl.innerHTML = html;

      const meta = readCatalogMeta();
      const lastCheckLabel = meta.lastCheck
        ? new Date(meta.lastCheck).toLocaleString('de-AT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'Noch nicht online geprüft';
      const exCount = typeof EX !== 'undefined' ? EX.length : 0;
      const customCount = typeof S !== 'undefined' && Array.isArray(S.custom) ? S.custom.length : 0;
      const savedUrl = localStorage.getItem(REMOTE_URL_KEY) || '';

      // 1. Karte für manuelles Katalog-Update in den Einstellungen
      const syncCard = document.createElement('div');
      syncCard.className = 'c';
      syncCard.innerHTML = `
        <h3>🔄 Übungskatalog & Online-Updates</h3>
        <p class="mu" style="font-size:13px;margin:4px 0 8px">
          Stand: <b>${exCount} offizielle Übungen</b>${customCount ? ` (+ ${customCount} eigene)` : ''} · Zuletzt geprüft: <b>${lastCheckLabel}</b>
        </p>
        <div class="r" style="gap:8px">
          <button type="button" class="b g" onclick="v3SyncCatalogNow(false)">🔄 Übungskatalog jetzt prüfen</button>
        </div>`;

      const adminCard = tpl.content.querySelector('#v3AdminStudioCard');
      if (adminCard) {
        adminCard.before(syncCard);

        // 2. Im Admin-Studio das Eingabefeld für die REMOTE_DATA_BASE-URL (GitHub Pages) ergänzen
        const adminDetailsBody = adminCard.querySelector('details > div');
        if (adminDetailsBody && !adminDetailsBody.querySelector('#v3RemoteUrlInput')) {
          const otaBox = document.createElement('div');
          otaBox.className = 'v3-admin-box';
          otaBox.style.marginTop = '10px';
          otaBox.innerHTML = `
            <b>🌐 Over-the-Air Update-Server (GitHub Pages URL für APK & Web)</b>
            <p class="mu" style="font-size:12px;margin:4px 0 6px">
              Ordner-URL, unter der deine exportierte <code>exercises.json</code> online liegt (aktiv: <code>${ window.v3GetRemoteDataBase() }</code>):
            </p>
            <div class="r" style="gap:6px">
              <input id="v3RemoteUrlInput" style="flex:1" value="${savedUrl.replace(/"/g, '"')}" placeholder="https://dein-name.github.io/mein-training/data/">
              <button type="button" class="chip" onclick="v3SaveRemoteUrl(document.getElementById('v3RemoteUrlInput').value)">💾 URL speichern & testen</button>
            </div>`;
          adminDetailsBody.appendChild(otaBox);
        }
      } else {
        tpl.content.appendChild(syncCard);
      }

      return tpl.innerHTML;
    };
  }

  // --- STARTUP: 1. SOFORTIGER OFFLINE-START (0 ms) -> 2. MODULE LADEN -> 3. HINTERGRUND-SYNC ---
  try {
    let initialData = readCachedCatalog();
    if (!initialData) {
      initialData = await fetchBundledCatalog();
      writeCachedCatalog(initialData);
    }

    window.FITNESS_CATALOG = {
      exercises: initialData[0],
      plans: initialData[1],
      translations: initialData[2]
    };

    for (const file of modules) {
      await new Promise((resolve, reject) => {
        const element = document.createElement('script');
        element.src = './js/' + file + '.js';
        element.onload = resolve;
        element.onerror = () => reject(Error(file + ' konnte nicht geladen werden'));
        document.body.appendChild(element);
      });
    }

    // Bereinige unmittelbar nach dem Laden von app.js eventuelle "Laufen"-Duplikate aus dem Cache
    if (typeof EX !== 'undefined' && Array.isArray(EX)) {
      const cleanInitial = buildCleanOfficialExerciseList(EX);
      EX.splice(0, EX.length, ...cleanInitial);
    }

    installOtaSettingsUi();
    if (typeof render === 'function') render();

    // Service Worker für Offline-PWA registrieren (falls noch nicht aktiv)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Hintergrund-Sync beim App-Start & bei Rückkehr in die App (Focus / Visibility)
    setTimeout(() => window.v3SyncCatalogNow(true), 900);
    window.addEventListener('focus', () => window.v3SyncCatalogNow(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') window.v3SyncCatalogNow(true);
    });
  } catch (error) {
    console.error(error);
    document.getElementById('app').innerHTML =
      '<section class="c"><h2>App konnte nicht starten</h2><p>Die Trainingsdaten konnten nicht geladen werden. Oeffne die Web-App ueber GitHub Pages oder einen Webserver, nicht direkt als Datei.</p><p class="mu"></p></section>';
    document.querySelector('#app .mu').textContent = error.message;
  }
})();