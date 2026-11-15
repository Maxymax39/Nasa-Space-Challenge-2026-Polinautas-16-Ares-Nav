/**
 * EnvironmentModel — Martian surface conditions for the EVA simulation:
 * dust and storms, air temperature and pressure, space weather and wind.
 *
 * Reference values come from assets/data/environment_reference.json
 * (MEDA temperature ranges are measured; the rest are planning values or
 * scenarios). The curves below are deliberately simple models:
 *   - temperature: one sinusoid per sol between the MEDA min and max,
 *     flattened by dust (storms cool the day and warm the night)
 *   - pressure: mean plus diurnal and semi-diurnal tides that grow with dust
 *   - visibility: Koschmieder range, 3.9 / (tau / dust scale height)
 *   - illumination: clear-sky lux x sun elevation x exp(-0.25 tau)
 */

const SOL_HOURS = 24.66; // one sol in Earth hours
const CO2_GAS_CONSTANT = 188.9; // J/(kg K)
const EARTH_AIR_DENSITY = 1.225; // kg/m3
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const SPACE_WEATHER_LEVELS = ['quiet', 'active', 'spe'];

/** Fetch the reference data file. */
export async function loadEnvironmentReference(base = 'assets/data/') {
  const res = await fetch(`${base}environment_reference.json`);
  if (!res.ok) throw new Error(`environment_reference.json (${res.status})`);
  return res.json();
}

/** Local true solar time (0-24 h) after `evaHours` Earth hours of EVA. */
export function localHour(startHour, evaHours = 0) {
  return (((startHour + evaHours * (24 / SOL_HOURS)) % 24) + 24) % 24;
}

/** Dust optical depth including dust lifted by strong wind. */
export function effectiveTau(ref, tau, windSpeed) {
  const lift = Math.max(0, windSpeed - ref.dust.liftingWindMs) * ref.dust.liftingTauPerMs;
  return tau + lift;
}

function diurnal(min, max, peakHour, hour, damping) {
  const mean = (min + max) / 2;
  const amp = ((max - min) / 2) * damping;
  return mean + amp * Math.cos(((hour - peakHour) / 24) * 2 * Math.PI);
}

/** Radiation dose-rate multiplier for a space-weather level. */
export function radiationFactor(ref, level) {
  return ref.radiation.factors[level] ?? 1;
}

/**
 * Everything the simulation, panel and HUD need for one instant.
 * @param {object} ref   environment_reference.json
 * @param {object} env   controls: {tau, windSpeed, windDir, startHour, spaceWeather}
 * @param {number} evaHours  elapsed EVA time (Earth hours)
 * @param {number} heading   astronaut heading, degrees (for head/cross wind)
 */
export function deriveEnvironment(ref, env, evaHours = 0, heading = 0) {
  const hour = localHour(env.startHour, evaHours);
  const tau = effectiveTau(ref, env.tau, env.windSpeed);
  const T = ref.temperature;

  // dust flattens the diurnal temperature swing
  const damping = clamp(Math.exp(-0.22 * Math.max(0, tau - 0.4)), 0.3, 1);
  const airTempC = diurnal(T.airMinC, T.airMaxC, T.airPeakHour, hour, damping);
  const groundTempC = diurnal(T.groundMinC, T.groundMaxC, T.groundPeakHour, hour, damping);

  // thermal tides: diurnal + semi-diurnal, stronger in dusty air
  const P = ref.pressure;
  const tide = Math.min(P.maxAmpPa, P.diurnalAmpPa + P.dustTideAmpPaPerTau * tau);
  const pressurePa = P.meanPa
    + tide * (0.6 * Math.cos(((hour - 7) / 24) * 2 * Math.PI) + 0.4 * Math.cos(((hour - 9) / 12) * 2 * Math.PI));

  const airDensity = pressurePa / (CO2_GAS_CONSTANT * (airTempC + 273.15));
  const dynamicPressurePa = 0.5 * airDensity * env.windSpeed ** 2;
  const earthEquivalentWindMs = env.windSpeed * Math.sqrt(airDensity / EARTH_AIR_DENSITY);

  const visibilityKm = Math.min(99, 3.9 / (tau / ref.dust.scaleHeightKm));
  const sunElevation = hour > 6 && hour < 18 ? Math.sin(((hour - 6) / 12) * Math.PI) : 0;
  const illuminationLux = ref.dust.clearSkyLux * sunElevation * Math.exp(-0.25 * tau);

  // wind relative to the direction of travel (windDir = direction it blows FROM)
  const rel = (env.windDir - heading) * DEG;
  const headwindMs = env.windSpeed * Math.cos(rel);
  const crosswindMs = env.windSpeed * Math.sin(rel);

  const L = ref.limits;
  const dark = illuminationLux < L.darkLux;
  // travel slows in poor visibility and in the dark; wind force itself is negligible
  // in Mars' thin air, it matters through the dust it lifts
  const speedFactor = clamp(visibilityKm / (L.visibilityNoGoKm * 1.5), 0.45, 1) * (dark ? 0.6 : 1);

  const dustDevils = hour >= 11 && hour <= 15 && tau < L.tauCaution
    ? (env.windSpeed >= 4 ? 'high' : 'medium')
    : 'low';

  const radFactor = radiationFactor(ref, env.spaceWeather);

  // GO / CAUTION / NO-GO with the reasons behind it
  const reasons = [];
  let level = 'go';
  const raise = (lvl, key) => {
    reasons.push({ level: lvl, key });
    if (lvl === 'nogo' || level === 'go') level = lvl;
  };
  if (env.spaceWeather === 'spe') raise('nogo', 'env.reason.spe');
  if (tau >= L.tauNoGo || visibilityKm <= L.visibilityNoGoKm) raise('nogo', 'env.reason.storm');
  if (env.windSpeed >= L.windNoGoMs) raise('nogo', 'env.reason.windNoGo');
  if (env.spaceWeather === 'active') raise('caution', 'env.reason.active');
  if (tau >= L.tauCaution && tau < L.tauNoGo) raise('caution', 'env.reason.dust');
  if (env.windSpeed >= L.windCautionMs && env.windSpeed < L.windNoGoMs) raise('caution', 'env.reason.wind');
  if (env.windSpeed >= ref.dust.liftingWindMs) raise('caution', 'env.reason.lifting');
  if (airTempC <= L.coldCautionC) raise('caution', 'env.reason.cold');
  if (dark) raise('caution', 'env.reason.dark');

  return {
    hour, tau, airTempC, groundTempC, pressurePa, airDensity,
    dynamicPressurePa, earthEquivalentWindMs, visibilityKm, illuminationLux,
    windSpeed: env.windSpeed, windDir: env.windDir, headwindMs, crosswindMs,
    speedFactor, dustDevils, radFactor, spaceWeather: env.spaceWeather,
    status: { level, reasons },
  };
}

/** "HH:MM" for a local hour. */
export function formatHour(hour) {
  const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
