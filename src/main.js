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
  o2UptakeLpm, pointOfSafeReturn,
} from './core/BioSafetyCalculators.js';
import { unlockAudio, setMuted, sfx } from './core/AudioFeedback.js';
import { t, tr, applyI18n, getLang, setLang, onLangChange } from './core/i18n.js';
import {
  loadEnvironmentReference, deriveEnvironment, radiationFactor, formatHour,
} from './core/EnvironmentModel.js';
import { MapEngine } from './components/MapEngine.js';
import { SuitHudOverlay } from './components/SuitHudOverlay.js';
import { TelemetryPanel } from './components/TelemetryPanel.js';
import { ElevationProfile } from './components/ElevationProfile.js';
import { Terrain3D } from './components/Terrain3D.js';

const $ = (id) => document.getElementById(id);
const RAW_IMAGES_URL = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/';

const state = {
  layers: { hirise: true, topo: false, crism: true, rad: false, contours: false },
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
    metabolicW: 115, coreTempC: 36.9, leakPct: 0,
  },
  // automatic return-to-base: psr is the live Point of Safe Return, null when no EVA is under way
  rtb: { auto: true, leak: false, psr: null, warned: false },
  rover: null, // support rover state; null when the crew is on foot
  nav: null,
  alert: { level: 'none' },
  // environment controls (filled from the "nominal" preset at boot) and derived conditions
  env: { preset: 'nominal', tau: 0.4, windSpeed: 5, windDir: 300, startHour: 9, spaceWeather: 'quiet' },
  envNow: null,
};

let terrain, envRef, map, hud, panel, profile;
let view3d = null; // stays null without WebGL or three.js; the HUD then uses the tilted 2D map

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
  el.innerHTML = `<button class="close" aria-label="${t('popup.close')}">✕</button>${html}`;
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
  clearSafeReturn();
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
      // messages are stored as {key, vars} so they follow the interface language
      state.routeError = {
        key: 'route.error',
        vars: { wp: labels[plan.failedLeg], slope: LIMITS.maxSlopeDeg, rad: LIMITS.maxRadMsvPerHour },
      };
      if (playSound) sfx.blocked();
    } else {
      const speedFactor = planSpeedFactor();
      const analysis = analyzeRoute(terrain, plan.cells, state.mode, speedFactor);
      const summary = evaSummary(analysis);
      const notes = [];
      if (summary.o2DepletionPct >= 100) notes.push({ key: 'note.o2' });
      if (summary.exceedsEvaWindow) notes.push({ key: 'note.window', vars: { h: SUIT.evaHours[1] } });
      if (!notes.length) notes.push({ key: 'note.clear' });
      state.route = {
        ...analysis, summary, kind: 'plan', notes, speedFactor,
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
    toast(t('toast.outOfBounds'));
    return;
  }
  const raw = terrain.lonLatToCell(p.lon, p.lat);
  const safe = nearestPassable(terrain, raw);
  if (safe === -1) {
    toast(t('toast.noSafeCell'), true);
    sfx.blocked();
    return;
  }
  if (safe !== raw) {
    const why = terrain.slope[raw] > LIMITS.maxSlopeDeg
      ? t('why.slope', { v: terrain.slope[raw].toFixed(0), max: LIMITS.maxSlopeDeg })
      : t('why.rad', { v: terrain.rad[raw].toFixed(2), max: LIMITS.maxRadMsvPerHour });
    toast(t('toast.snapped', { why }));
    p = terrain.cellToLonLat(safe);
  }
  state.waypoints.push({ lon: p.lon, lat: p.lat });
  sfx.waypoint();
  recompute(false);
  if (state.routeError) toast(t(state.routeError.key, state.routeError.vars), true);
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

function triggerEmergency(auto = false) {
  const s = state.sim;
  let traveled = [];
  let from;
  if (state.route && s.km > 0) {
    traveled = state.route.points.slice(0, s.index + 1).map((p) => p.cell);
    from = s.pos;
  } else if (state.waypoints.length) {
    from = state.waypoints[state.waypoints.length - 1];
  } else {
    toast(t('toast.noEva'));
    return;
  }
  const ret = emergencyReturn(terrain, from);
  if (!ret.ok) {
    toast(t('toast.noReturn'), true);
    sfx.blocked();
    return;
  }
  const speedFactor = planSpeedFactor();
  const analysis = analyzeRoute(terrain, [...traveled, ...ret.cells], state.mode, speedFactor);
  const startIndex = traveled.length;
  state.route = {
    ...analysis,
    summary: evaSummary(analysis),
    kind: 'emergency',
    auto, // true when the O2 reserve limit turned the crew around, not the crew
    speedFactor,
    emergencyIndex: Math.max(0, startIndex - 1),
    notes: [{ key: ret.direct ? 'note.direct' : 'note.detour' }],
    wpMarks: [{ label: 'HAB', index: analysis.points.length - 1, distKm: analysis.distanceKm }],
  };
  state.routeError = null;
  s.index = Math.max(0, startIndex - 1);
  s.km = analysis.points[s.index].distKm;
  s.pos = { lon: analysis.points[s.index].lon, lat: analysis.points[s.index].lat };
  s.running = true;
  sfx.emergency();
  backClock = 0;
  toast(t(auto ? 'rtb.toast.auto' : 'toast.emergency', { km: (analysis.distanceKm - s.km).toFixed(2) }), true);
  panel.updateRoute();
  syncStartButtons();
}

/* ---------- EVA simulation ---------- */

function syncStartButtons() {
  const key = state.sim.running ? 'sim.pause' : state.sim.km > 0 ? 'sim.resume' : 'sim.start';
  $('start').textContent = t(key);
  $('hud-start').textContent = t(`${key}Short`);
}

function toggleSim() {
  if (!state.route) {
    toast(t('toast.needRoute'));
    return;
  }
  const s = state.sim;
  if (!s.running && s.km >= state.route.distanceKm) { s.km = 0; s.index = 0; clearSafeReturn(); }
  s.running = !s.running;
  sfx.toggle();
  syncStartButtons();
}

/**
 * Metabolic rate and core temperature from heart rate. Rough but in the right
 * range: ~115 W resting, 250-350 W for steady EVA work, and the cooling garment
 * keeps up until about 300 W, after which core temperature creeps upward.
 * Core temperature lags the workload by a few simulated minutes.
 */
function thermalState(tm, dtSec) {
  tm.metabolicW = 115 + Math.max(0, tm.hr - 72) * 4.2;
  tm.o2Lpm = o2UptakeLpm(tm.metabolicW);
  const target = 36.9 + Math.max(0, tm.metabolicW - 300) / 220;
  const k = dtSec ? Math.min(1, (dtSec * state.sim.speedX) / 600) : 1;
  tm.coreTempC += (target - tm.coreTempC) * k;
}

const angleLerp =(a, b, k) => (a + ((((b - a) % 360) + 540) % 360 - 180) * k + 360) % 360;

/** Advance the simulation and refresh telemetry, navigation and alerts. */
function updateSim(dtSec) {
  // `tm` (not `t`): `t` is the translation function in this module
  const { sim: s, telemetry: tm, route } = state;
  if (!route) {
    Object.assign(tm, {
      o2Pct: 100, hr: 72, ppCo2: 3.5, hydrationL: 0, doseMsv: 0, distKm: 0, hours: 0, score: 100,
      metabolicW: 115, coreTempC: 36.9,
    });
    const here = terrain.sample(s.pos.lon, s.pos.lat);
    Object.assign(tm, { slope: here.slope, elev: here.elev, radRate: here.rad });
    state.nav = null;
    clearSafeReturn();
    updateRover(null);
    state.envNow = deriveEnvironment(envRef, state.env, 0, s.heading);
    setAlert(environmentAlert(state.envNow) ?? { level: 'none' });
    return;
  }
  const pts = route.points;

  if (s.running) {
    const cur = pts[s.index];
    // same environment speed factor the plan was analysed with, so time and dose stay consistent
    s.km += (traverseSpeedKmh(cur.slope, cur.costMul, state.mode) * route.speedFactor * dtSec * s.speedX) / 3600;
    if (s.km >= route.distanceKm) {
      s.km = route.distanceKm;
      s.running = false;
      sfx.arrive();
      toast(t(route.kind === 'emergency' ? 'toast.safe' : 'toast.done'));
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

  if (state.rtb.leak && s.running) tm.leakPct += (SUIT.leakDrillPctPerHour * dtSec * s.speedX) / 3600;
  const o2Dep = Math.min(100, (s.km > 0 ? suitO2Depletion(s.km, a.maxSlopeSoFar) : 0) + tm.leakPct);
  const hrTarget = heartRateBpm(a.slope, a.costMul, s.running);
  tm.hr = Math.round(tm.hr + (hrTarget - tm.hr) * Math.min(1, dtSec * 1.5 + (dtSec ? 0 : 1)));
  tm.o2Pct = 100 - o2Dep;
  tm.pressurePsid = SUIT.pressurePsid + 0.015 * Math.sin(performance.now() / 1700);
  tm.ppCo2 = 3.5 + Math.max(0, tm.hr - 72) * 0.045;
  thermalState(tm, dtSec);
  tm.hours = mix('hours');
  tm.hydrationL = evaHydrationL(tm.hours);
  tm.doseMsv = mix('doseMsv');
  tm.radRate = a.rad;
  tm.slope = a.slope;
  tm.elev = mix('elev');
  tm.distKm = s.km;
  tm.score = evaSafetyScore({ maxSlopeDeg: a.maxSlopeSoFar, radiationMsv: tm.doseMsv, o2DepletionPct: o2Dep });

  // conditions at the current local time and heading
  state.envNow = deriveEnvironment(envRef, state.env, tm.hours, s.heading);

  // next waypoint vector
  const mark = route.wpMarks.find((m) => m.distKm > s.km + 1e-6) ?? route.wpMarks[route.wpMarks.length - 1];
  const target = pts[mark.index];
  state.nav = {
    label: mark.label,
    bearing: terrain.bearingDeg(s.pos, target),
    distKm: terrain.distanceKm(s.pos, target),
    etaMin: Math.max(0, (target.hours - tm.hours) * 60),
  };

  updateRover(pts, a);

  // terrain danger first, then a NO-GO environment, then terrain cautions
  const terrainAlert = s.km > 0 && s.km < route.distanceKm ? evaluateAlert(a, pts) : { level: 'none' };
  const envAlert = terrainAlert.level === 'danger' ? terrainAlert : environmentAlert(state.envNow) ?? terrainAlert;

  // last, because an automatic return swaps state.route under us
  setAlert(checkSafeReturn(a, dtSec) ?? envAlert);
}

/* ---------- support rover ---------- */

// The rover trails the crew on the same track and carries the samples.
// Battery and cargo figures are planning numbers for this simulation.
const ROVER = { followKm: 0.03, cargoMaxKg: 60, sampleKgPerStop: 6, batteryPctPerKm: 3.2 };

/** Position on the route at a given distance from the start. */
function routePointAt(pts, km) {
  let i = Math.min(state.sim.index, pts.length - 2);
  while (i > 0 && pts[i].distKm > km) i--;
  const a = pts[i], b = pts[i + 1];
  const seg = b.distKm - a.distKm;
  const k = seg > 0 ? Math.min(1, Math.max(0, (km - a.distKm) / seg)) : 0;
  return { lon: a.lon + (b.lon - a.lon) * k, lat: a.lat + (b.lat - a.lat) * k };
}

function updateRover(pts, here) {
  if (state.mode !== 'rover') {
    state.rover = null;
    return;
  }
  const s = state.sim;
  const onRoute = pts && pts.length > 1;
  const pos = onRoute ? routePointAt(pts, Math.max(0, s.km - ROVER.followKm)) : { ...terrain.habitat };
  const tetherM = terrain.distanceKm(pos, s.pos) * 1000;
  const stops = onRoute
    ? state.route.wpMarks.filter((m) => m.label !== 'HAB' && m.distKm <= s.km + 1e-6).length
    : 0;
  // samples stay on board if the plan is replaced by an emergency return
  const carried = s.km > 0 ? state.rover?.cargoKg ?? 0 : 0;
  state.rover = {
    pos,
    heading: tetherM > 1 ? terrain.bearingDeg(pos, s.pos) : s.heading,
    tetherM,
    batteryPct: Math.max(0, 100 - s.km * ROVER.batteryPctPerKm - (here?.maxSlopeSoFar ?? 0) * 0.5),
    cargoKg: Math.max(carried, Math.min(ROVER.cargoMaxKg, stops * ROVER.sampleKgPerStop)),
    cargoMaxKg: ROVER.cargoMaxKg,
    // heavy dust attenuates the UHF relay between suit, rover and habitat
    comms: state.envNow && state.envNow.tau >= 3 ? 'degraded' : 'ok',
  };
}

/* ---------- point of safe return / automatic RTB ---------- */

let backClock = 0; // seconds until the way home is re-planned
let lastMargin = null; // O2 margin at the previous update, to see how fast it is closing
let backLeg = null; // cached {distanceKm, durationH, maxSlopeDeg} of the way home

function clearSafeReturn() {
  state.rtb.psr = null;
  state.rtb.warned = false;
  state.telemetry.leakPct = 0;
  backLeg = null;
  lastMargin = null;
  backClock = 0;
}

/**
 * Keep the Point of Safe Return current and act on it.
 * With auto-return on, crossing the limit re-routes to the habitat. With it
 * off, the crew only gets the warning and keeps the route they chose.
 * @returns the HUD alert to show, or null
 */
function checkSafeReturn(here, dtSec) {
  const { sim: s, telemetry: tm, rtb } = state;
  let route = state.route;
  if (!(s.km > 0 && s.km < route.distanceKm)) {
    rtb.psr = null;
    return null;
  }

  // The way home is re-planned a couple of times per second, not every frame.
  // At high time compression that still has to mean every few simulated minutes.
  backClock -= dtSec * Math.max(1, s.speedX / 240);
  if (!backLeg || backClock <= 0) {
    backClock = 0.4;
    if (route.kind === 'emergency') {
      const pts = route.points;
      let maxSlopeDeg = 0;
      for (let i = s.index; i < pts.length; i++) maxSlopeDeg = Math.max(maxSlopeDeg, pts[i].slope);
      backLeg = { distanceKm: route.distanceKm - s.km, durationH: pts[pts.length - 1].hours - tm.hours, maxSlopeDeg };
    } else {
      const ret = emergencyReturn(terrain, s.pos);
      if (ret.ok) backLeg = analyzeRoute(terrain, ret.cells, state.mode, route.speedFactor);
    }
  }
  if (!backLeg) return null;

  const psr = pointOfSafeReturn({
    o2Pct: tm.o2Pct,
    returnKm: backLeg.distanceKm,
    returnMaxSlope: backLeg.maxSlopeDeg,
    maxSlopeSoFar: here.maxSlopeSoFar,
    returnHours: backLeg.durationH,
    leakPctPerHour: rtb.leak ? SUIT.leakDrillPctPerHour : 0,
  });
  // Turn around one step early rather than one step late: if the margin is
  // closing fast enough to be gone by the next update, treat it as reached.
  const closing = Math.max(0, (lastMargin ?? psr.marginPct) - psr.marginPct);
  lastMargin = psr.marginPct;
  if (route.kind !== 'emergency' && psr.marginPct - closing <= 0) psr.critical = true;
  rtb.psr = psr;

  if (psr.critical && route.kind !== 'emergency') {
    if (rtb.auto) {
      triggerEmergency(true);
      route = state.route;
    } else if (!rtb.warned) {
      rtb.warned = true;
      sfx.danger();
      toast(t('rtb.toast.manual'), true);
    }
  }

  const vars = {
    o2: tm.o2Pct.toFixed(0), need: psr.needPct.toFixed(0), margin: psr.reservePct, km: psr.returnKm.toFixed(2),
  };
  if (route.kind === 'emergency' && route.auto) {
    return { level: 'danger', title: t('rtb.activated'), detail: t('rtb.detail', vars) };
  }
  if (psr.critical && route.kind !== 'emergency') {
    return { level: 'danger', title: t('rtb.limit'), detail: t('rtb.manual', vars) };
  }
  return null;
}

/** HUD alert for a NO-GO environment (storm, particle event, extreme wind), or null. */
function environmentAlert(v) {
  const reason = v.status.reasons.find((r) => r.level === 'nogo');
  if (!reason) return null;
  const kinds = {
    'env.reason.spe': ['env.alert.spe', `×${v.radFactor.toFixed(1)}`],
    'env.reason.storm': ['env.alert.storm', `τ ${v.tau.toFixed(1)} · VIS ${v.visibilityKm.toFixed(0)} km`],
    'env.reason.windNoGo': ['env.alert.wind', `${v.windSpeed.toFixed(0)} m/s`],
  };
  const [title, detail] = kinds[reason.key];
  return { level: 'danger', title: t(title), detail: t('env.alert.detail', { detail }) };
}

/* ---------- environment ---------- */

/** Travel-speed factor used for planning: conditions at departure. */
const planSpeedFactor = () => deriveEnvironment(envRef, state.env, 0, 0).speedFactor;

/** Re-time the current route in place (same path) after the environment changes mid-EVA. */
function reanalyzeRoute() {
  const route = state.route;
  const speedFactor = planSpeedFactor();
  const analysis = analyzeRoute(terrain, route.points.map((p) => p.cell), state.mode, speedFactor);
  Object.assign(route, analysis, { summary: evaSummary(analysis), speedFactor });
  for (const m of route.wpMarks) m.distKm = analysis.points[m.index].distKm;
  panel.updateRoute();
}

function syncEnvControls() {
  const e = state.env;
  $('env-preset').value = e.preset;
  $('env-tau').value = e.tau;
  $('env-wind').value = e.windSpeed;
  $('env-dir').value = e.windDir;
  $('env-hour').value = e.startHour;
  $('env-sw').value = e.spaceWeather;
  $('env-tau-val').textContent = e.tau.toFixed(1);
  $('env-wind-val').textContent = `${e.windSpeed} m/s`;
  $('env-dir-val').textContent = `${String(e.windDir).padStart(3, '0')}°`;
  $('env-hour-val').textContent = formatHour(e.startHour);
}

/** Push the environment controls into the radiation field, the route and the views. */
function applyEnvironment() {
  syncEnvControls();
  const radChanged = terrain.setRadiationFactor(radiationFactor(envRef, state.env.spaceWeather));
  if (radChanged) map.refreshRasters();
  if (state.route && state.sim.km > 0) {
    reanalyzeRoute(); // EVA under way: keep the path, the alerts tell the crew to turn back
  } else {
    recompute(false);
    if (radChanged && state.waypoints.length) toast(t('env.toast.rad'));
  }
}

function setPreset(name) {
  Object.assign(state.env, envRef.presets[name], { preset: name });
  applyEnvironment();
}

/** Hazard proximity logic for the HUD alert box. */
function evaluateAlert(here, pts) {
  const zoneOf = (id) => terrain.hazards.zones.find((z) => z.id === id);
  if (here.rad > 0.2) {
    return { level: 'danger', title: t('alert.rad.title'), detail: t('alert.rad.detail', { v: here.rad.toFixed(2), max: SUIT.radAlertMsvPerHour }) };
  }
  if (here.slope > 15) {
    return { level: 'danger', title: t('alert.slope.title'), detail: t('alert.slope.detail', { v: here.slope.toFixed(0), max: LIMITS.maxSlopeDeg }) };
  }
  if (here.zoneId) {
    const z = zoneOf(here.zoneId);
    return { level: 'danger', title: t('alert.zone.title', { id: z.id, name: tr(z, 'name').toUpperCase() }), detail: tr(z, 'risk') };
  }
  // look ahead 150 m along the route
  for (let i = state.sim.index + 1; i < pts.length && pts[i].distKm - here.distKm <= 0.15; i++) {
    const m = Math.round((pts[i].distKm - here.distKm) * 1000);
    if (pts[i].slope > 15) return { level: 'caution', title: t('alert.aheadSlope.title'), detail: t('alert.aheadSlope.detail', { v: pts[i].slope.toFixed(0), m }) };
    if (pts[i].zoneId) return { level: 'caution', title: t('alert.aheadZone.title', { id: pts[i].zoneId }), detail: t('alert.aheadZone.detail', { name: tr(zoneOf(pts[i].zoneId), 'name'), m }) };
  }
  const near = terrain.nearestZone(here);
  if (near && near.edgeKm < 0.12) {
    return { level: 'caution', title: t('alert.near.title', { id: near.zone.id }), detail: t('alert.aheadZone.detail', { name: tr(near.zone, 'name'), m: Math.max(0, Math.round(near.edgeKm * 1000)) }) };
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
    if (view3d && !setView.hinted) { setView.hinted = true; toast(t('hud3d.hint')); }
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
  view3d?.resize();
  hud.resize();
  profile.resize();
}

/* ---------- crew stations ---------- */

// Each station opens the app the way that person would use it. There is no
// login: the selector only changes the starting view and layers.
const ROLE_KEY = 'ares-nav-role';
const ROLES = {
  capcom: { view: 'plan', layers: { hirise: true, topo: false, crism: true, rad: true } },
  rover: { view: 'plan', mode: 'rover', layers: { hirise: true, topo: true, crism: false, rad: true } },
  commander: { view: 'hud' },
  scientist: { view: 'plan', layers: { hirise: true, topo: false, crism: true, rad: false } },
};

function savedRole() {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return ROLES[r] ? r : 'capcom';
  } catch {
    return 'capcom';
  }
}

function applyRole(name, announce = true) {
  const role = ROLES[name] ?? ROLES.capcom;
  $('role').value = name;
  try { localStorage.setItem(ROLE_KEY, name); } catch { /* private window: just don't remember it */ }
  if (role.layers) {
    Object.assign(state.layers, role.layers);
    document.querySelectorAll('[data-layer]').forEach((box) => { box.checked = state.layers[box.dataset.layer]; });
  }
  if (role.mode && role.mode !== state.mode) {
    state.mode = role.mode;
    $('mode').value = role.mode;
    recompute(false);
  }
  setView(role.view);
  if (announce) toast(t(`role.toast.${name}`));
}

/* ---------- popups ---------- */

function showMarker(marker, at) {
  const d = marker.data;
  if (marker.type === 'zone') {
    openPopup(`
      <h3>Z${d.id} · ${tr(d, 'name')}</h3>
      <p><b>${t('popup.risk')}</b> ${tr(d, 'risk')}</p>
      <p><b>${t('popup.mitigation')}</b> ${tr(d, 'mitigation')}</p>
      <p><b>${t('popup.pov')}</b> ${tr(d, 'pov')}.<br>
      <a href="${RAW_IMAGES_URL}" target="_blank" rel="noopener">${t('popup.rawImages')}</a></p>`, at);
  } else if (marker.type === 'mineral') {
    const cls = terrain.minerals.classes[d.class];
    const el = openPopup(`
      <h3 style="color:${cls.color}">${tr(d, 'name')}</h3>
      <p><b>${tr(cls, 'label')}</b> · ${t('popup.bands')} ${cls.bands}</p>
      <p><b>${t('popup.bio')}</b> ${tr(cls, 'biosignature')}</p>
      <p>${fmtCoord(d)}</p>
      <button class="btn btn-green" data-add>${t('popup.addWp')}</button>`, at);
    el.querySelector('[data-add]').addEventListener('click', () => addWaypoint(d));
  } else if (marker.type === 'rad') {
    openPopup(`
      <h3 style="color:#e5534b">☢ ${tr(d, 'name')}</h3>
      <p>${t('popup.radBody', { peak: (d.peakMsvPerHour * terrain.radFactor).toFixed(2), max: LIMITS.maxRadMsvPerHour })}</p>`, at);
  } else {
    openPopup(`
      <h3>Octavia E. Butler Landing</h3>
      <p>${t('popup.habBody')}</p>
      <p>${fmtCoord(d)}</p>`, at);
  }
  sfx.click();
}

/* ---------- boot ---------- */

async function boot() {
  [terrain, envRef] = await Promise.all([loadTerrain(), loadEnvironmentReference()]);
  state.sim.pos = { ...terrain.habitat };
  Object.assign(state.env, envRef.presets.nominal);
  state.envNow = deriveEnvironment(envRef, state.env, 0, 0);

  map = new MapEngine($('map'), terrain, state, {
    onMapClick: (p) => { closePopup(); if (state.view === 'plan') addWaypoint(p); },
    onMarkerClick: showMarker,
    onHover: (p) => {
      if (!p || !terrain.inBounds(p.lon, p.lat)) { $('coords').textContent = '—'; return; }
      const c = terrain.sample(p.lon, p.lat);
      const flag = isBlocked(terrain, c.cell) ? ` · ${t('coords.blocked')}` : '';
      $('coords').textContent = `${fmtCoord(p)} · ${c.elev.toFixed(0)} m · ${c.slope.toFixed(1)}° · ${c.rad.toFixed(3)} mSv/h${flag}`;
    },
  });
  if (Terrain3D.supported) {
    try {
      view3d = new Terrain3D($('terrain3d'), terrain, state, map);
      document.body.classList.add('gl');
    } catch (err) {
      console.warn('3D terrain unavailable, using the 2D HUD view:', err.message);
    }
  }
  hud = new SuitHudOverlay($('hud'), terrain, state);
  hud.view3d = view3d; // lets the HUD pin labels to the astronaut and rover in the 3D scene

  // on-screen camera pad for the 3D view (mouse drag and wheel work too)
  $('cam-controls').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cam]');
    if (!btn || !view3d) return;
    const on = view3d.command(btn.dataset.cam);
    if (btn.dataset.cam === 'orbit') btn.setAttribute('aria-pressed', String(on));
    if (btn.dataset.cam === 'home') $('cam-controls').querySelector('[data-cam=orbit]').setAttribute('aria-pressed', 'false');
    sfx.click();
  });
  panel = new TelemetryPanel($('right'), state);
  profile = new ElevationProfile($('profile'), state);

  // hazard list (re-rendered on language change)
  const renderZoneList = () => {
    $('zone-list').innerHTML = terrain.hazards.zones
      .map((z) => `<li><button data-zone="${z.id}"><span class="num">Z${z.id}</span><span>${tr(z, 'name')}<small>${tr(z, 'risk')}</small></span></button></li>`)
      .join('');
  };
  renderZoneList();

  // language dropdown: static text is handled by applyI18n(); the rest is refreshed here
  const visorLabel = () => { $('hud-visor').textContent = t(state.visorOn ? 'visor.closed' : 'visor.open'); };
  applyI18n();
  $('lang').value = getLang();
  $('lang').addEventListener('change', (e) => { setLang(e.target.value); sfx.toggle(); });
  onLangChange(() => {
    closePopup();
    $('toast').hidden = true;
    renderZoneList();
    syncStartButtons();
    visorLabel();
  });

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
  $('emergency').addEventListener('click', () => triggerEmergency());
  $('hud-emergency').addEventListener('click', () => triggerEmergency());
  // auto-return has a switch in both views; they stay in step
  const setAutoRtb = (on) => {
    state.rtb.auto = on;
    state.rtb.warned = false;
    $('auto-rtb').checked = on;
    $('hud-rtb').setAttribute('aria-pressed', String(on));
    $('hud-rtb').textContent = t(on ? 'rtb.hudOn' : 'rtb.hudOff');
    $('hud-rtb').classList.toggle('btn-off', !on);
  };
  $('auto-rtb').addEventListener('change', (e) => { setAutoRtb(e.target.checked); sfx.toggle(); });
  $('hud-rtb').addEventListener('click', () => { setAutoRtb(!state.rtb.auto); sfx.toggle(); });
  $('leak').addEventListener('change', (e) => { state.rtb.leak = e.target.checked; backClock = 0; sfx.toggle(); });
  onLangChange(() => setAutoRtb(state.rtb.auto));
  setAutoRtb(true);
  $('view-plan').addEventListener('click', () => setView('plan'));
  $('view-hud').addEventListener('click', () => setView('hud'));
  $('hud-visor').addEventListener('click', (e) => {
    state.visorOn = !state.visorOn;
    document.body.classList.toggle('visor-open', !state.visorOn);
    e.currentTarget.setAttribute('aria-pressed', String(state.visorOn));
    visorLabel();
    sfx.toggle();
  });
  $('mute').addEventListener('click', (e) => {
    const muted = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setMuted(muted);
    e.currentTarget.setAttribute('aria-pressed', String(muted));
    e.currentTarget.textContent = muted ? '♪ OFF' : '♪ ON';
  });
  // environment controls: a preset fills every control; touching one switches to "custom"
  $('env-preset').addEventListener('change', (e) => {
    if (e.target.value === 'custom') { state.env.preset = 'custom'; return; }
    setPreset(e.target.value);
    sfx.toggle();
  });
  const envInputs = { 'env-tau': 'tau', 'env-wind': 'windSpeed', 'env-dir': 'windDir', 'env-hour': 'startHour' };
  for (const [id, key] of Object.entries(envInputs)) {
    $(id).addEventListener('input', (e) => {
      state.env[key] = Number(e.target.value);
      state.env.preset = 'custom';
      applyEnvironment();
    });
  }
  $('env-sw').addEventListener('change', (e) => {
    state.env.spaceWeather = e.target.value;
    state.env.preset = 'custom';
    applyEnvironment();
    sfx.toggle();
  });

  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select')) return;
    if (e.key === 'Escape') closePopup();
    if (e.key.toLowerCase() === 'h') setView(state.view === 'hud' ? 'plan' : 'hud');
  });
  new ResizeObserver(resizeAll).observe($('stage'));
  new ResizeObserver(resizeAll).observe($('profile-wrap'));

  applyEnvironment(); // also plans the (empty) initial route

  $('role').addEventListener('change', (e) => applyRole(e.target.value));
  applyRole(savedRole(), false);

  // 60 FPS render loop
  let last = performance.now(), lastUi = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    updateSim(dt);
    if (state.view === 'hud' && view3d) view3d.draw(now);
    else map.draw(now);
    if (state.view === 'hud') hud.draw(now);
    if (now - lastUi > 120) {
      lastUi = now;
      panel.updateLive();
      panel.updateEnvironment();
      profile.draw();
      // red edge pulse on the stage while an automatic return is in progress
      document.body.classList.toggle('rtb-active', !!state.route?.auto && state.sim.running);
      const chip = $('tile-status');
      // drives the chip through data-i18n so a language switch updates it too
      chip.dataset.i18n = map.tilesOnline ? 'tiles.online' : 'tiles.offline';
      chip.textContent = t(chip.dataset.i18n);
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
    `<div class="toast red" style="top:60px">${t('boot.error', { msg: err.message })}</div>`,
  );
});
