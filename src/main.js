/**
 * ARES-NAV entry point — wires data, routing, simulation and the two views
 * (habitat planning map and in-helmet HUD) together.
 */
import { loadTerrain } from './core/TerrainModel.js';
import {
  planRoute, analyzeRoute, emergencyReturn, nearestPassable, isBlocked, LIMITS,
} from './core/PathfindingAlgorithm.js';
import {
  evaSummary, suitO2Depletion, evaSafetyScore, evaHydrationL, traverseSpeedKmh, heartRateBpm, SUIT,
} from './core/BioSafetyCalculators.js';
import { unlockAudio, setMuted, sfx } from './core/AudioFeedback.js';
import { MapEngine } from './components/MapEngine.js';
import { SuitHudOverlay } from './components/SuitHudOverlay.js';
import { TelemetryPanel } from './components/TelemetryPanel.js';
import { ElevationProfile } from './components/ElevationProfile.js';

const $ = (id) => document.getElementById(id);
const RAW_IMAGES_URL = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/';

const state = {
  layers: { hirise: true, topo: false, crism: true, rad: false },
  waypoints: [], // user waypoints; the habitat is always the implicit start
  roundTrip: true,
  mode: 'foot',
  route: null,
  routeError: null,
  view: 'plan',
  visorOn: true,
  sim: { running: false, km: 0, index: 0, pos: null, heading: 0, speedX: 240 },
  telemetry: {
    o2Pct: 100, pressurePsid: SUIT.pressurePsid, hr: 72, ppCo2: 3.5, hydrationL: 0,
    doseMsv: 0, radRate: 0, slope: 0, elev: 0, distKm: 0, hours: 0, score: 100,
  },
  nav: null,
  alert: { level: 'none' },
};

let terrain, map, hud, panel, profile;

/* ---------- small UI helpers ---------- */

let toastTimer;
function toast(msg, red = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('red', red);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

function closePopup() { $('popup').hidden = true; }

function openPopup(html, at) {
  const el = $('popup');
  el.innerHTML = `<button class="close" aria-label="Cerrar">✕</button>${html}`;
  el.hidden = false;
  const stage = $('stage');
  el.style.left = `${Math.max(8, Math.min(stage.clientWidth - 286, at.x + 14))}px`;
  el.style.top = `${Math.max(8, Math.min(stage.clientHeight - el.offsetHeight - 8, at.y - 20))}px`;
  el.querySelector('.close').addEventListener('click', closePopup);
  return el;
}

const fmtCoord = (p) => `${p.lat.toFixed(4)}°N ${p.lon.toFixed(4)}°E`;

/* ---------- route planning ---------- */

function resetSim() {
  const s = state.sim;
  s.running = false;
  s.km = 0;
  s.index = 0;
  s.pos = { ...terrain.habitat };
  if (state.route?.points.length > 1) s.heading = terrain.bearingDeg(state.route.points[0], state.route.points[1]);
  syncStartButtons();
}

/** Distance marks for each waypoint along an analysed route. */
function waypointMarks(points, wpCells, labels) {
  const marks = [];
  let j = 0;
  wpCells.forEach((cell, k) => {
    while (j < points.length - 1 && points[j].cell !== cell) j++;
    marks.push({ label: labels[k], index: j, distKm: points[j].distKm });
  });
  return marks;
}

function recompute(playSound = true) {
  closePopup();
  state.routeError = null;
  state.route = null;
  if (state.waypoints.length) {
    const hab = terrain.habitat;
    const stops = [hab, ...state.waypoints, ...(state.roundTrip ? [hab] : [])];
    const labels = ['HAB', ...state.waypoints.map((_, i) => `WP${i + 1}`), ...(state.roundTrip ? ['HAB'] : [])];
    const plan = planRoute(terrain, stops);
    if (!plan.ok) {
      state.routeError = `Sin ruta segura hacia ${labels[plan.failedLeg]}: el terreno intermedio supera ${LIMITS.maxSlopeDeg}° o ${LIMITS.maxRadMsvPerHour} mSv/h.`;
      if (playSound) sfx.blocked();
    } else {
      const analysis = analyzeRoute(terrain, plan.cells, state.mode);
      const summary = evaSummary(analysis);
      const notes = [];
      if (summary.o2DepletionPct >= 100) notes.push('O₂ insuficiente para esta ruta.');
      if (summary.exceedsEvaWindow) notes.push(`Supera la ventana EVA de ${SUIT.evaHours[1]} h.`);
      if (!notes.length) notes.push('Ruta libre de celdas >20° y >0.24 mSv/h.');
      state.route = {
        ...analysis, summary, kind: 'plan', note: notes.join(' '),
        wpMarks: waypointMarks(analysis.points, plan.wpCells, labels),
      };
      if (playSound) sfx.route();
    }
  }
  resetSim();
  updateSim(0);
  panel.updateRoute();
}

function addWaypoint(p) {
  if (!terrain.inBounds(p.lon, p.lat)) {
    toast('Fuera del área cartografiada.');
    return;
  }
  const raw = terrain.lonLatToCell(p.lon, p.lat);
  const safe = nearestPassable(terrain, raw);
  if (safe === -1) {
    toast('Zona intransitable: no hay celda segura cercana.', true);
    sfx.blocked();
    return;
  }
  if (safe !== raw) {
    const why = terrain.slope[raw] > LIMITS.maxSlopeDeg
      ? `pendiente ${terrain.slope[raw].toFixed(0)}° > ${LIMITS.maxSlopeDeg}°`
      : `radiación ${terrain.rad[raw].toFixed(2)} > ${LIMITS.maxRadMsvPerHour} mSv/h`;
    toast(`Celda bloqueada (${why}). Waypoint reubicado a la celda segura más cercana.`);
    p = terrain.cellToLonLat(safe);
  }
  state.waypoints.push({ lon: p.lon, lat: p.lat });
  sfx.waypoint();
  recompute(false);
  if (state.routeError) toast(state.routeError, true);
}

function suggestedRoute() {
  const pick = (id) => terrain.minerals.deposits.find((d) => d.id === id);
  state.waypoints = [
    { lon: 77.4349, lat: 18.4584 }, // firm-rock corridor between dunes and boulder field
    pick('three-forks-clay'),
    pick('sulfate-vein'),
    pick('delta-toe-carbonate'),
  ].map(({ lon, lat }) => ({ lon, lat }));
  state.roundTrip = true;
  $('round-trip').checked = true;
  recompute();
}

function triggerEmergency() {
  const s = state.sim;
  let traveled = [];
  let from;
  if (state.route && s.km > 0) {
    traveled = state.route.points.slice(0, s.index + 1).map((p) => p.cell);
    from = s.pos;
  } else if (state.waypoints.length) {
    from = state.waypoints[state.waypoints.length - 1];
  } else {
    toast('No hay EVA en curso: el astronauta está en el hábitat.');
    return;
  }
  const ret = emergencyReturn(terrain, from);
  if (!ret.ok) {
    toast('No existe trayecto seguro al hábitat desde esta posición.', true);
    sfx.blocked();
    return;
  }
  const analysis = analyzeRoute(terrain, [...traveled, ...ret.cells], state.mode);
  const startIndex = traveled.length;
  state.route = {
    ...analysis,
    summary: evaSummary(analysis),
    kind: 'emergency',
    emergencyIndex: Math.max(0, startIndex - 1),
    note: ret.direct
      ? 'Línea recta segura hacia Octavia E. Butler.'
      : 'Línea recta bloqueada: desvío seguro más corto hacia Octavia E. Butler.',
    wpMarks: [{ label: 'HAB', index: analysis.points.length - 1, distKm: analysis.distanceKm }],
  };
  state.routeError = null;
  s.index = Math.max(0, startIndex - 1);
  s.km = analysis.points[s.index].distKm;
  s.pos = { lon: analysis.points[s.index].lon, lat: analysis.points[s.index].lat };
  s.running = true;
  sfx.emergency();
  toast(`REGRESO DE EMERGENCIA · ${(analysis.distanceKm - s.km).toFixed(2)} km al hábitat`, true);
  panel.updateRoute();
  syncStartButtons();
}

/* ---------- EVA simulation ---------- */

function syncStartButtons() {
  const label = state.sim.running ? '❚❚ Pausar EVA' : state.sim.km > 0 ? '▶ Reanudar EVA' : '▶ Iniciar EVA';
  $('start').textContent = label;
  $('hud-start').textContent = label.replace(' EVA', '');
}

function toggleSim() {
  if (!state.route) {
    toast('Primero traza una ruta (o usa "Ruta científica sugerida").');
    return;
  }
  const s = state.sim;
  if (!s.running && s.km >= state.route.distanceKm) { s.km = 0; s.index = 0; }
  s.running = !s.running;
  sfx.toggle();
  syncStartButtons();
}

const angleLerp = (a, b, k) => (a + ((((b - a) % 360) + 540) % 360 - 180) * k + 360) % 360;

/** Advance the simulation and refresh telemetry, navigation and alerts. */
function updateSim(dtSec) {
  const { sim: s, telemetry: t, route } = state;
  if (!route) {
    Object.assign(t, { o2Pct: 100, hr: 72, ppCo2: 3.5, hydrationL: 0, doseMsv: 0, distKm: 0, hours: 0, score: 100 });
    const here = terrain.sample(s.pos.lon, s.pos.lat);
    Object.assign(t, { slope: here.slope, elev: here.elev, radRate: here.rad });
    state.nav = null;
    setAlert({ level: 'none' });
    return;
  }
  const pts = route.points;

  if (s.running) {
    const cur = pts[s.index];
    s.km += (traverseSpeedKmh(cur.slope, cur.costMul, state.mode) * dtSec * s.speedX) / 3600;
    if (s.km >= route.distanceKm) {
      s.km = route.distanceKm;
      s.running = false;
      sfx.arrive();
      toast(route.kind === 'emergency' ? 'Astronauta a salvo en el hábitat.' : 'EVA completada.');
      syncStartButtons();
    }
  }
  while (s.index < pts.length - 2 && pts[s.index + 1].distKm <= s.km) s.index++;
  while (s.index > 0 && pts[s.index].distKm > s.km) s.index--;

  const a = pts[s.index], b = pts[Math.min(pts.length - 1, s.index + 1)];
  const seg = b.distKm - a.distKm;
  const k = seg > 0 ? Math.min(1, (s.km - a.distKm) / seg) : 0;
  const mix = (key) => a[key] + (b[key] - a[key]) * k;
  s.pos = { lon: mix('lon'), lat: mix('lat') };
  if (seg > 0) s.heading = angleLerp(s.heading, terrain.bearingDeg(a, b), s.running ? Math.min(1, dtSec * 4) : 1);

  const o2Dep = s.km > 0 ? suitO2Depletion(s.km, a.maxSlopeSoFar) : 0;
  const hrTarget = heartRateBpm(a.slope, a.costMul, s.running);
  t.hr = Math.round(t.hr + (hrTarget - t.hr) * Math.min(1, dtSec * 1.5 + (dtSec ? 0 : 1)));
  t.o2Pct = 100 - o2Dep;
  t.pressurePsid = SUIT.pressurePsid + 0.015 * Math.sin(performance.now() / 1700);
  t.ppCo2 = 3.5 + Math.max(0, t.hr - 72) * 0.045;
  t.hours = mix('hours');
  t.hydrationL = evaHydrationL(t.hours);
  t.doseMsv = mix('doseMsv');
  t.radRate = a.rad;
  t.slope = a.slope;
  t.elev = mix('elev');
  t.distKm = s.km;
  t.score = evaSafetyScore({ maxSlopeDeg: a.maxSlopeSoFar, radiationMsv: t.doseMsv, o2DepletionPct: o2Dep });

  // next waypoint vector
  const mark = route.wpMarks.find((m) => m.distKm > s.km + 1e-6) ?? route.wpMarks[route.wpMarks.length - 1];
  const target = pts[mark.index];
  state.nav = {
    label: mark.label,
    bearing: terrain.bearingDeg(s.pos, target),
    distKm: terrain.distanceKm(s.pos, target),
    etaMin: Math.max(0, (target.hours - t.hours) * 60),
  };

  setAlert(s.km > 0 && s.km < route.distanceKm ? evaluateAlert(a, pts) : { level: 'none' });
}

/** Hazard proximity logic for the HUD alert box. */
function evaluateAlert(here, pts) {
  const zoneOf = (id) => terrain.hazards.zones.find((z) => z.id === id);
  if (here.rad > 0.2) {
    return { level: 'danger', title: 'RADIACIÓN ELEVADA', detail: `${here.rad.toFixed(2)} mSv/h — límite ${SUIT.radAlertMsvPerHour} mSv/h` };
  }
  if (here.slope > 15) {
    return { level: 'danger', title: 'PENDIENTE INESTABLE', detail: `${here.slope.toFixed(0)}° — riesgo de deslizamiento (límite ${LIMITS.maxSlopeDeg}°)` };
  }
  if (here.zoneId) {
    const z = zoneOf(here.zoneId);
    return { level: 'danger', title: `ZONA ${z.id} · ${z.name.toUpperCase()}`, detail: z.risk };
  }
  // look ahead 150 m along the route
  for (let i = state.sim.index + 1; i < pts.length && pts[i].distKm - here.distKm <= 0.15; i++) {
    const m = Math.round((pts[i].distKm - here.distKm) * 1000);
    if (pts[i].slope > 15) return { level: 'caution', title: 'PENDIENTE PRONUNCIADA', detail: `${pts[i].slope.toFixed(0)}° a ${m} m en ruta` };
    if (pts[i].zoneId) return { level: 'caution', title: `ZONA ${pts[i].zoneId} EN RUTA`, detail: `${zoneOf(pts[i].zoneId).name} a ${m} m` };
  }
  const near = terrain.nearestZone(here);
  if (near && near.edgeKm < 0.12) {
    return { level: 'caution', title: `PROXIMIDAD ZONA ${near.zone.id}`, detail: `${near.zone.name} a ${Math.max(0, Math.round(near.edgeKm * 1000))} m` };
  }
  return { level: 'none' };
}

function setAlert(next) {
  const prev = state.alert;
  if (next.level !== prev.level || next.title !== prev.title) {
    if (next.level === 'danger') sfx.danger();
    else if (next.level === 'caution') sfx.caution();
  }
  state.alert = next;
}

/* ---------- views ---------- */

let savedView = null;
function setView(view) {
  if (view === state.view) return;
  state.view = view;
  closePopup();
  const hudOn = view === 'hud';
  document.body.classList.toggle('hud', hudOn);
  $('view-plan').classList.toggle('active', !hudOn);
  $('view-hud').classList.toggle('active', hudOn);
  $('view-plan').setAttribute('aria-selected', String(!hudOn));
  $('view-hud').setAttribute('aria-selected', String(hudOn));
  if (hudOn) {
    savedView = { center: { ...map.center }, pxPerKm: map.pxPerKm };
    map.follow = true;
    map.pxPerKm = 620;
  } else {
    map.follow = false;
    map.rotation = 0;
    if (savedView) Object.assign(map, savedView);
  }
  sfx.toggle();
  requestAnimationFrame(resizeAll);
}

function resizeAll() {
  map.resize();
  hud.resize();
  profile.resize();
}

/* ---------- popups ---------- */

function showMarker(marker, at) {
  const d = marker.data;
  if (marker.type === 'zone') {
    openPopup(`
      <h3>Z${d.id} · ${d.name}</h3>
      <p><b>Riesgo:</b> ${d.risk}</p>
      <p><b>Mitigación:</b> ${d.mitigation}</p>
      <p><b>Vista en superficie:</b> ${d.pov}.<br>
      <a href="${RAW_IMAGES_URL}" target="_blank" rel="noopener">Imágenes crudas de Mars 2020 ↗</a></p>`, at);
  } else if (marker.type === 'mineral') {
    const cls = terrain.minerals.classes[d.class];
    const el = openPopup(`
      <h3 style="color:${cls.color}">${d.name}</h3>
      <p><b>${cls.label}</b> · bandas CRISM ${cls.bands}</p>
      <p><b>Potencial de biofirmas:</b> ${cls.biosignature}</p>
      <p>${fmtCoord(d)}</p>
      <button class="btn btn-green" data-add>+ Añadir como waypoint</button>`, at);
    el.querySelector('[data-add]').addEventListener('click', () => addWaypoint(d));
  } else if (marker.type === 'rad') {
    openPopup(`
      <h3 style="color:#ff2255">☢ ${d.name}</h3>
      <p>Pico modelado de <b>${d.peakMsvPerHour.toFixed(2)} mSv/h</b> (escenario SPE). Las celdas sobre ${LIMITS.maxRadMsvPerHour} mSv/h son intransitables.</p>`, at);
  } else {
    openPopup(`
      <h3>Octavia E. Butler Landing</h3>
      <p>Hábitat y punto de inicio/retorno de toda EVA.</p>
      <p>${fmtCoord(d)}</p>`, at);
  }
  sfx.click();
}

/* ---------- boot ---------- */

async function boot() {
  terrain = await loadTerrain();
  state.sim.pos = { ...terrain.habitat };

  map = new MapEngine($('map'), terrain, state, {
    onMapClick: (p) => { closePopup(); if (state.view === 'plan') addWaypoint(p); },
    onMarkerClick: showMarker,
    onHover: (p) => {
      if (!p || !terrain.inBounds(p.lon, p.lat)) { $('coords').textContent = '—'; return; }
      const c = terrain.sample(p.lon, p.lat);
      const flag = isBlocked(terrain, c.cell) ? ' · BLOQUEADA' : '';
      $('coords').textContent = `${fmtCoord(p)} · ${c.elev.toFixed(0)} m · ${c.slope.toFixed(1)}° · ${c.rad.toFixed(3)} mSv/h${flag}`;
    },
  });
  hud = new SuitHudOverlay($('hud'), terrain, state);
  panel = new TelemetryPanel($('right'), state);
  profile = new ElevationProfile($('profile'), state);

  // hazard list
  $('zone-list').innerHTML = terrain.hazards.zones
    .map((z) => `<li><button data-zone="${z.id}"><span class="num">Z${z.id}</span><span>${z.name}<small>${z.risk}</small></span></button></li>`)
    .join('');
  $('zone-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zone]');
    if (!btn) return;
    const z = terrain.hazards.zones.find((x) => x.id === Number(btn.dataset.zone));
    map.center = { lon: z.lon, lat: z.lat };
    map.pxPerKm = Math.max(map.pxPerKm, 260);
    showMarker({ type: 'zone', data: z }, map.toScreen(z.lon, z.lat));
  });

  // controls
  document.querySelectorAll('[data-layer]').forEach((box) => {
    box.addEventListener('change', () => { state.layers[box.dataset.layer] = box.checked; sfx.toggle(); });
  });
  $('mode').addEventListener('change', (e) => { state.mode = e.target.value; recompute(); });
  $('round-trip').addEventListener('change', (e) => { state.roundTrip = e.target.checked; recompute(); });
  $('speed').addEventListener('change', (e) => { state.sim.speedX = Number(e.target.value); });
  $('suggest').addEventListener('click', suggestedRoute);
  $('undo').addEventListener('click', () => { state.waypoints.pop(); sfx.click(); recompute(false); });
  $('clear').addEventListener('click', () => { state.waypoints = []; sfx.click(); recompute(false); });
  $('start').addEventListener('click', toggleSim);
  $('hud-start').addEventListener('click', toggleSim);
  $('emergency').addEventListener('click', triggerEmergency);
  $('hud-emergency').addEventListener('click', triggerEmergency);
  $('view-plan').addEventListener('click', () => setView('plan'));
  $('view-hud').addEventListener('click', () => setView('hud'));
  $('hud-visor').addEventListener('click', (e) => {
    state.visorOn = !state.visorOn;
    document.body.classList.toggle('visor-open', !state.visorOn);
    e.currentTarget.setAttribute('aria-pressed', String(state.visorOn));
    e.currentTarget.textContent = state.visorOn ? 'Visor 16%' : 'Visor abierto';
    sfx.toggle();
  });
  $('mute').addEventListener('click', (e) => {
    const muted = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setMuted(muted);
    e.currentTarget.setAttribute('aria-pressed', String(muted));
    e.currentTarget.textContent = muted ? '♪ OFF' : '♪ ON';
  });
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select')) return;
    if (e.key === 'Escape') closePopup();
    if (e.key.toLowerCase() === 'h') setView(state.view === 'hud' ? 'plan' : 'hud');
  });
  new ResizeObserver(resizeAll).observe($('stage'));
  new ResizeObserver(resizeAll).observe($('profile-wrap'));

  recompute(false);

  // 60 FPS render loop
  let last = performance.now(), lastUi = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    updateSim(dt);
    map.draw(now);
    if (state.view === 'hud') hud.draw(now);
    if (now - lastUi > 120) {
      lastUi = now;
      panel.updateLive();
      profile.draw();
      const chip = $('tile-status');
      chip.textContent = map.tilesOnline ? 'HiRISE 25 cm · NASA Mars Trek' : 'HiRISE sin conexión · relieve local';
      chip.classList.toggle('ok', map.tilesOnline);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="toast red" style="top:60px">Error al iniciar ARES-NAV: ${err.message}. Sirve la carpeta con un servidor local (ver README).</div>`,
  );
});
