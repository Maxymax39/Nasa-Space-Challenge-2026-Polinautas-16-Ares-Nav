/**
 * BioSafetyCalculators — physiological consumption and EVA safety formulas.
 * Reference envelope: NASA-STD-3001 (Space Flight Human-System Standard).
 * Every function is pure and independently importable.
 */

/** Daily consumption per crew member inside the habitat (per sol). */
export const HABITAT_DAILY = Object.freeze({
  o2Kg: [0.84, 1.1],
  waterL: [2.5, 3.5],
  hygieneWaterL: [8.0, 9.0],
  foodKg: [1.5, 1.75],
  kcal: 3000,
});

/** Suit operating parameters during a 6–8 h EVA. */
export const SUIT = Object.freeze({
  pressurePsid: 4.3,
  pressureKpa: 29.6,
  o2Fraction: 1.0,
  maxPpCo2MmHg: 20, // for at most 1 h continuous
  hydrationMlPerHour: 240,
  radAlertMsvPerHour: 0.24,
  visorTransmission: 0.16, // counters ~57,000 lux Martian glare
  evaHours: [6, 8],
});

/** Traverse modes. Speeds are planning assumptions, not standards. */
export const TRAVERSE_MODES = Object.freeze({
  foot: { label: 'EVA a pie (pareja)', baseSpeedKmh: 2.5 },
  rover: { label: 'Con rover de apoyo', baseSpeedKmh: 6.0 },
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const scale = ([lo, hi], k) => [lo * k, hi * k];

/**
 * 1. Habitat consumables for a crew over a number of sols.
 * @returns ranges [min, max] for each consumable.
 */
export function habitatConsumables(crew = 1, sols = 1) {
  const k = Math.max(0, crew) * Math.max(0, sols);
  return {
    o2Kg: scale(HABITAT_DAILY.o2Kg, k),
    waterL: scale(HABITAT_DAILY.waterL, k),
    hygieneWaterL: scale(HABITAT_DAILY.hygieneWaterL, k),
    foodKg: scale(HABITAT_DAILY.foodKg, k),
    kcal: HABITAT_DAILY.kcal * k,
  };
}

/**
 * 2. Suit O2 depletion during EVA.
 *    Depletion (%) = (total distance [km] × 4.2) + (max slope [°] × 0.8)
 */
export function suitO2Depletion(distanceKm, maxSlopeDeg) {
  return clamp(distanceKm * 4.2 + maxSlopeDeg * 0.8, 0, 100);
}

/**
 * 3. Global EVA Safety Score (0–100).
 *    Score = 100 − (slope × 1.5) − (accumulated radiation [mSv] × 12) − (O2 depletion × 0.2)
 */
export function evaSafetyScore({ maxSlopeDeg, radiationMsv, o2DepletionPct }) {
  return clamp(100 - maxSlopeDeg * 1.5 - radiationMsv * 12 - o2DepletionPct * 0.2, 0, 100);
}

/** Qualitative band for a safety score. */
export function classifySafety(score) {
  if (score >= 75) return { level: 'nominal', label: 'NOMINAL', color: '#39ff14' };
  if (score >= 50) return { level: 'caution', label: 'PRECAUCIÓN', color: '#ffaa00' };
  return { level: 'danger', label: 'NO-GO', color: '#ff2255' };
}

/** Minimum in-helmet hydration for an EVA of the given duration (litres). */
export function evaHydrationL(hours) {
  return (SUIT.hydrationMlPerHour * Math.max(0, hours)) / 1000;
}

/**
 * Travel speed over a cell (km/h): slows exponentially with slope and
 * linearly with the terrain cost multiplier (sand, boulders, loose soil).
 */
export function traverseSpeedKmh(slopeDeg, costMultiplier = 1, mode = 'foot') {
  const base = (TRAVERSE_MODES[mode] ?? TRAVERSE_MODES.foot).baseSpeedKmh;
  return (base * Math.exp(-0.06 * slopeDeg)) / (1 + 0.25 * (costMultiplier - 1));
}

/** Simulated heart rate (bpm) from current slope and terrain effort. */
export function heartRateBpm(slopeDeg, costMultiplier = 1, moving = true) {
  if (!moving) return 72;
  return Math.round(clamp(88 + slopeDeg * 3.2 + (costMultiplier - 1) * 9, 60, 185));
}

/** Full biomedical summary for a planned route. */
export function evaSummary({ distanceKm, maxSlopeDeg, radiationMsv, durationH }) {
  const o2DepletionPct = suitO2Depletion(distanceKm, maxSlopeDeg);
  const score = evaSafetyScore({ maxSlopeDeg, radiationMsv, o2DepletionPct });
  return {
    o2DepletionPct,
    o2RemainingPct: 100 - o2DepletionPct,
    score,
    band: classifySafety(score),
    hydrationL: evaHydrationL(durationH),
    exceedsEvaWindow: durationH > SUIT.evaHours[1],
  };
}
