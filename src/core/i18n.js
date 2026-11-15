/**
 * i18n — Spanish / English interface text.
 * - t(key, vars)      translated string, with {placeholders} filled from vars
 * - tr(obj, field)    text field of a data record (uses `<field>_en` in English)
 * - applyI18n(root)   fills every [data-i18n], [data-i18n-title], [data-i18n-aria]
 * - setLang(lang)     switches language, persists it and notifies listeners
 */

const STORAGE_KEY = 'ares-nav-lang';
export const LANGS = ['es', 'en'];

const STRINGS = {
  es: {
    'ui.link': 'ENLACE TIERRA 4–24 min · NAVEGACIÓN AUTÓNOMA',
    'ui.viewPlan': 'Hábitat · Planificación',
    'ui.viewHud': 'Traje · HUD',
    'ui.viewMode': 'Modo de vista',
    'ui.mute': 'Silenciar sonido',
    'ui.lang': 'Idioma',
    'ui.layers': 'Capas GIS',
    'ui.evaPlan': 'Plan de EVA',
    'ui.mode': 'Modo de travesía',
    'ui.roundTrip': 'Retorno al hábitat',
    'ui.suggest': 'Ruta científica sugerida',
    'ui.undo': 'Deshacer WP',
    'ui.clear': 'Limpiar',
    'ui.emergency': '⚠ Regreso de emergencia',
    'ui.speed': 'Velocidad de simulación',
    'ui.hint': 'Clic en el mapa: añadir waypoint. Arrastrar: mover. Rueda: zoom. Clic en un marcador: detalles.',
    'ui.hazards': 'Marcadores de riesgo',
    'ui.mapLabel': 'Mapa táctico de Jezero',
    'ui.profileLabel': 'Perfil de elevación',
    'mode.foot': 'EVA a pie (pareja)',
    'mode.rover': 'Con rover de apoyo',
    'legend.blocked': '>20° bloqueado',
    'legend.clays': 'Arcillas',
    'legend.carbonates': 'Carbonatos',
    'legend.sulfates': 'Sulfatos',
    'legend.silica': 'Sílice',

    'sim.start': '▶ Iniciar EVA',
    'sim.pause': '❚❚ Pausar EVA',
    'sim.resume': '▶ Reanudar EVA',
    'sim.startShort': '▶ EVA',
    'sim.pauseShort': '❚❚ Pausar',
    'sim.resumeShort': '▶ Reanudar',
    'visor.closed': 'Visor 16%',
    'visor.open': 'Visor abierto',
    'tiles.connecting': 'HiRISE: conectando…',
    'tiles.online': 'HiRISE 25 cm · NASA Mars Trek',
    'tiles.offline': 'HiRISE sin conexión · relieve local',

    'toast.outOfBounds': 'Fuera del área cartografiada.',
    'toast.noSafeCell': 'Zona intransitable: no hay celda segura cercana.',
    'toast.snapped': 'Celda bloqueada ({why}). Waypoint reubicado a la celda segura más cercana.',
    'why.slope': 'pendiente {v}° > {max}°',
    'why.rad': 'radiación {v} > {max} mSv/h',
    'toast.noEva': 'No hay EVA en curso: el astronauta está en el hábitat.',
    'toast.noReturn': 'No existe trayecto seguro al hábitat desde esta posición.',
    'toast.emergency': 'REGRESO DE EMERGENCIA · {km} km al hábitat',
    'toast.safe': 'Astronauta a salvo en el hábitat.',
    'toast.done': 'EVA completada.',
    'toast.needRoute': 'Primero traza una ruta (o usa "Ruta científica sugerida").',

    'route.error': 'Sin ruta segura hacia {wp}: el terreno intermedio supera {slope}° o {rad} mSv/h.',
    'note.o2': 'O₂ insuficiente para esta ruta.',
    'note.window': 'Supera la ventana EVA de {h} h.',
    'note.clear': 'Ruta libre de celdas >20° y >0.24 mSv/h.',
    'note.direct': 'Línea recta segura hacia Octavia E. Butler.',
    'note.detour': 'Línea recta bloqueada: desvío seguro más corto hacia Octavia E. Butler.',

    'alert.rad.title': 'RADIACIÓN ELEVADA',
    'alert.rad.detail': '{v} mSv/h — límite {max} mSv/h',
    'alert.slope.title': 'PENDIENTE INESTABLE',
    'alert.slope.detail': '{v}° — riesgo de deslizamiento (límite {max}°)',
    'alert.zone.title': 'ZONA {id} · {name}',
    'alert.aheadSlope.title': 'PENDIENTE PRONUNCIADA',
    'alert.aheadSlope.detail': '{v}° a {m} m en ruta',
    'alert.aheadZone.title': 'ZONA {id} EN RUTA',
    'alert.aheadZone.detail': '{name} a {m} m',
    'alert.near.title': 'PROXIMIDAD ZONA {id}',

    'popup.close': 'Cerrar',
    'popup.risk': 'Riesgo:',
    'popup.mitigation': 'Mitigación:',
    'popup.pov': 'Vista en superficie:',
    'popup.rawImages': 'Imágenes crudas de Mars 2020 ↗',
    'popup.bands': 'bandas CRISM',
    'popup.bio': 'Potencial de biofirmas:',
    'popup.addWp': '+ Añadir como waypoint',
    'popup.radBody': 'Pico modelado de <b>{peak} mSv/h</b> (escenario SPE). Las celdas sobre {max} mSv/h son intransitables.',
    'popup.habBody': 'Hábitat y punto de inicio/retorno de toda EVA.',
    'coords.blocked': 'BLOQUEADA',

    'panel.score': 'Índice Global de Seguridad EVA',
    'panel.noRoute': 'SIN RUTA',
    'panel.blocked': 'RUTA BLOQUEADA',
    'panel.clickHint': 'Haz clic en el mapa para trazar waypoints.',
    'panel.emergency': 'REGRESO DE EMERGENCIA',
    'panel.route': 'Ruta planificada',
    'panel.dist': 'Distancia total',
    'panel.slope': 'Pendiente máx.',
    'panel.dur': 'Duración est.',
    'panel.o2dep': 'Depleción O₂',
    'panel.dose': 'Dosis acumulada',
    'panel.water': 'Hidratación mín.',
    'panel.suit': 'Soporte vital del traje',
    'panel.o2left': 'O₂ restante',
    'panel.press': 'Presión interna',
    'panel.hr': 'Frec. cardíaca',
    'panel.radRate': 'Tasa RAD',
    'panel.progress': 'Recorrido',
    'panel.time': 'Tiempo EVA',
    'panel.habitat': 'Consumibles en hábitat',
    'panel.crew': 'Tripulación',
    'panel.sols': 'Soles',
    'panel.hO2': 'Oxígeno',
    'panel.hWater': 'Agua potable',
    'panel.hHyg': 'Agua higiene/traje',
    'panel.hFood': 'Alimentos',
    'panel.kcal': '{kcal} kcal en total · {crew} tripulante(s) × {sols} sol(es)',
    'band.nominal': 'NOMINAL',
    'band.caution': 'PRECAUCIÓN',
    'band.danger': 'NO-GO',

    'hud.o2': 'O₂ RESTANTE',
    'hud.press': 'PRESIÓN TRAJE',
    'hud.hr': 'FREC. CARDÍACA',
    'hud.hydration': 'HIDRATACIÓN',
    'hud.nextWp': 'SIGUIENTE WP',
    'hud.slope': 'PENDIENTE',
    'hud.rad': 'RADIACIÓN',
    'hud.dose': 'DOSIS ACUM.',
    'hud.score': 'ÍNDICE SEGURIDAD',
    'hud.radar': 'RADAR {m} m · ● HAB {km} km',
    'hud.visorOn': 'VISOR {pct}% T · ANTIRREFLEJO',
    'hud.visorOff': 'VISOR ABIERTO · 57 000 lux',
    'hud.link': 'ENLACE TIERRA 4–24 min · NAV AUTÓNOMA',
    'hud.cardinals': 'N,NE,E,SE,S,SO,O,NO',

    'profile.empty': 'PERFIL DE ELEVACIÓN — traza una ruta para ver el corte topográfico',
    'boot.error': 'Error al iniciar ARES-NAV: {msg}. Sirve la carpeta con un servidor local (ver README).',
  },

  en: {
    'ui.link': 'EARTH LINK 4–24 min · AUTONOMOUS NAVIGATION',
    'ui.viewPlan': 'Habitat · Planning',
    'ui.viewHud': 'Suit · HUD',
    'ui.viewMode': 'View mode',
    'ui.mute': 'Mute sound',
    'ui.lang': 'Language',
    'ui.layers': 'GIS Layers',
    'ui.evaPlan': 'EVA Plan',
    'ui.mode': 'Traverse mode',
    'ui.roundTrip': 'Return to habitat',
    'ui.suggest': 'Suggested science route',
    'ui.undo': 'Undo WP',
    'ui.clear': 'Clear',
    'ui.emergency': '⚠ Emergency return',
    'ui.speed': 'Simulation speed',
    'ui.hint': 'Click the map: add a waypoint. Drag: pan. Wheel: zoom. Click a marker: details.',
    'ui.hazards': 'Hazard markers',
    'ui.mapLabel': 'Jezero tactical map',
    'ui.profileLabel': 'Elevation profile',
    'mode.foot': 'EVA on foot (pair)',
    'mode.rover': 'With support rover',
    'legend.blocked': '>20° blocked',
    'legend.clays': 'Clays',
    'legend.carbonates': 'Carbonates',
    'legend.sulfates': 'Sulfates',
    'legend.silica': 'Silica',

    'sim.start': '▶ Start EVA',
    'sim.pause': '❚❚ Pause EVA',
    'sim.resume': '▶ Resume EVA',
    'sim.startShort': '▶ EVA',
    'sim.pauseShort': '❚❚ Pause',
    'sim.resumeShort': '▶ Resume',
    'visor.closed': 'Visor 16%',
    'visor.open': 'Visor open',
    'tiles.connecting': 'HiRISE: connecting…',
    'tiles.online': 'HiRISE 25 cm · NASA Mars Trek',
    'tiles.offline': 'HiRISE offline · local relief',

    'toast.outOfBounds': 'Outside the mapped area.',
    'toast.noSafeCell': 'Impassable area: no safe cell nearby.',
    'toast.snapped': 'Blocked cell ({why}). Waypoint moved to the nearest safe cell.',
    'why.slope': 'slope {v}° > {max}°',
    'why.rad': 'radiation {v} > {max} mSv/h',
    'toast.noEva': 'No EVA in progress: the astronaut is at the habitat.',
    'toast.noReturn': 'No safe path to the habitat from this position.',
    'toast.emergency': 'EMERGENCY RETURN · {km} km to the habitat',
    'toast.safe': 'Astronaut safe at the habitat.',
    'toast.done': 'EVA complete.',
    'toast.needRoute': 'Plot a route first (or use "Suggested science route").',

    'route.error': 'No safe route to {wp}: the terrain in between exceeds {slope}° or {rad} mSv/h.',
    'note.o2': 'Not enough O₂ for this route.',
    'note.window': 'Exceeds the {h} h EVA window.',
    'note.clear': 'Route free of cells >20° and >0.24 mSv/h.',
    'note.direct': 'Safe straight line to Octavia E. Butler.',
    'note.detour': 'Straight line blocked: shortest safe detour to Octavia E. Butler.',

    'alert.rad.title': 'HIGH RADIATION',
    'alert.rad.detail': '{v} mSv/h — limit {max} mSv/h',
    'alert.slope.title': 'UNSTABLE SLOPE',
    'alert.slope.detail': '{v}° — landslide risk (limit {max}°)',
    'alert.zone.title': 'ZONE {id} · {name}',
    'alert.aheadSlope.title': 'STEEP SLOPE AHEAD',
    'alert.aheadSlope.detail': '{v}° in {m} m on route',
    'alert.aheadZone.title': 'ZONE {id} ON ROUTE',
    'alert.aheadZone.detail': '{name} in {m} m',
    'alert.near.title': 'ZONE {id} NEARBY',

    'popup.close': 'Close',
    'popup.risk': 'Risk:',
    'popup.mitigation': 'Mitigation:',
    'popup.pov': 'Surface view:',
    'popup.rawImages': 'Mars 2020 raw images ↗',
    'popup.bands': 'CRISM bands',
    'popup.bio': 'Biosignature potential:',
    'popup.addWp': '+ Add as waypoint',
    'popup.radBody': 'Modeled peak of <b>{peak} mSv/h</b> (SPE scenario). Cells above {max} mSv/h are impassable.',
    'popup.habBody': 'Habitat and start/return point of every EVA.',
    'coords.blocked': 'BLOCKED',

    'panel.score': 'Global EVA Safety Score',
    'panel.noRoute': 'NO ROUTE',
    'panel.blocked': 'ROUTE BLOCKED',
    'panel.clickHint': 'Click the map to plot waypoints.',
    'panel.emergency': 'EMERGENCY RETURN',
    'panel.route': 'Planned route',
    'panel.dist': 'Total distance',
    'panel.slope': 'Max slope',
    'panel.dur': 'Est. duration',
    'panel.o2dep': 'O₂ depletion',
    'panel.dose': 'Accumulated dose',
    'panel.water': 'Min. hydration',
    'panel.suit': 'Suit life support',
    'panel.o2left': 'O₂ remaining',
    'panel.press': 'Internal pressure',
    'panel.hr': 'Heart rate',
    'panel.radRate': 'RAD rate',
    'panel.progress': 'Distance covered',
    'panel.time': 'EVA time',
    'panel.habitat': 'Habitat consumables',
    'panel.crew': 'Crew',
    'panel.sols': 'Sols',
    'panel.hO2': 'Oxygen',
    'panel.hWater': 'Drinking water',
    'panel.hHyg': 'Hygiene/suit water',
    'panel.hFood': 'Food',
    'panel.kcal': '{kcal} kcal in total · {crew} crew × {sols} sol(s)',
    'band.nominal': 'NOMINAL',
    'band.caution': 'CAUTION',
    'band.danger': 'NO-GO',

    'hud.o2': 'O₂ REMAINING',
    'hud.press': 'SUIT PRESSURE',
    'hud.hr': 'HEART RATE',
    'hud.hydration': 'HYDRATION',
    'hud.nextWp': 'NEXT WP',
    'hud.slope': 'SLOPE',
    'hud.rad': 'RADIATION',
    'hud.dose': 'ACCUM. DOSE',
    'hud.score': 'SAFETY SCORE',
    'hud.radar': 'RADAR {m} m · ● HAB {km} km',
    'hud.visorOn': 'VISOR {pct}% T · ANTI-GLARE',
    'hud.visorOff': 'VISOR OPEN · 57,000 lux',
    'hud.link': 'EARTH LINK 4–24 min · AUTONOMOUS NAV',
    'hud.cardinals': 'N,NE,E,SE,S,SW,W,NW',

    'profile.empty': 'ELEVATION PROFILE — plot a route to see the terrain cross-section',
    'boot.error': 'ARES-NAV failed to start: {msg}. Serve the folder with a local server (see README).',
  },
};

function storedLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

let lang = storedLang() ?? 'es';
const listeners = new Set();

export const getLang = () => lang;

/** Translated string; unknown keys fall back to Spanish, then to the key itself. */
export function t(key, vars) {
  const s = STRINGS[lang][key] ?? STRINGS.es[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/** Text field of a data record: `<field>_en` in English when present. */
export function tr(obj, field) {
  return (lang === 'en' && obj[`${field}_en`]) || obj[field];
}

/** Fill translatable elements under root (defaults to the whole document). */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

/** Register a callback run after every language change. */
export function onLangChange(fn) {
  listeners.add(fn);
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable: keep in memory */ }
  document.documentElement.lang = lang;
  applyI18n();
  listeners.forEach((fn) => fn(lang));
}

document.documentElement.lang = lang;
