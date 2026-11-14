/**
 * PathfindingAlgorithm — tactical routing engine.
 * A* over the terrain grid (8-connected) with Mars-specific constraints:
 * any cell with slope > 20° or dose rate > 0.24 mSv/h has infinite cost,
 * so the route is forced around it.
 */
import { traverseSpeedKmh } from './BioSafetyCalculators.js';

export const LIMITS = Object.freeze({ maxSlopeDeg: 20, maxRadMsvPerHour: 0.24 });

/** True when the cell can never be entered. */
export function isBlocked(terrain, idx, limits = LIMITS) {
  return terrain.slope[idx] > limits.maxSlopeDeg || terrain.rad[idx] > limits.maxRadMsvPerHour;
}

/** Cost multiplier for entering a cell; Infinity when blocked. */
export function cellCost(terrain, idx, limits = LIMITS) {
  if (isBlocked(terrain, idx, limits)) return Infinity;
  const slopePenalty = 1 + (terrain.slope[idx] / limits.maxSlopeDeg) * 1.5;
  return slopePenalty * terrain.costMul[idx];
}

/** Binary min-heap keyed by f-score. */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, priority) {
    const a = this.items;
    a.push({ node, priority });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].priority <= a[i].priority) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority < a[m].priority) m = l;
        if (r < a.length && a[r].priority < a[m].priority) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.node;
  }
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * A* between two cells. Returns an array of cell indices (start → goal),
 * or null when the goal cannot be reached without entering a blocked cell.
 * @param {object} [opts] limits: override LIMITS; shortest: ignore terrain cost (distance only).
 */
export function findPath(terrain, start, goal, opts = {}) {
  const limits = opts.limits ?? LIMITS;
  const { ncols, nrows, cellKmX, cellKmY } = terrain;
  if (isBlocked(terrain, start, limits) || isBlocked(terrain, goal, limits)) return null;

  const g = new Float32Array(terrain.size).fill(Infinity);
  const came = new Int32Array(terrain.size).fill(-1);
  const closed = new Uint8Array(terrain.size);
  const gc = goal % ncols, gr = (goal - gc) / ncols;
  // admissible: straight-line distance at the minimum possible multiplier (1)
  const h = (c, r) => Math.hypot((c - gc) * cellKmX, (r - gr) * cellKmY);

  const open = new MinHeap();
  g[start] = 0;
  open.push(start, h(start % ncols, Math.floor(start / ncols)));

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const path = [];
      for (let n = goal; n !== -1; n = came[n]) path.push(n);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % ncols, cr = (cur - cc) / ncols;

    for (const [dc, dr] of NEIGHBORS) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= ncols || nr >= nrows) continue;
      const next = nr * ncols + nc;
      if (closed[next]) continue;
      const mul = cellCost(terrain, next, limits);
      if (mul === Infinity) continue;
      // no corner-cutting past blocked cells on diagonal moves
      if (dc && dr && (isBlocked(terrain, cr * ncols + nc, limits) || isBlocked(terrain, nr * ncols + cc, limits))) continue;
      const step = Math.hypot(dc * cellKmX, dr * cellKmY);
      const tentative = g[cur] + step * (opts.shortest ? 1 : mul);
      if (tentative < g[next]) {
        g[next] = tentative;
        came[next] = cur;
        open.push(next, tentative + h(nc, nr));
      }
    }
  }
  return null;
}

/** Closest passable cell to idx (ring search), or -1. */
export function nearestPassable(terrain, idx, limits = LIMITS, maxRing = 12) {
  if (!isBlocked(terrain, idx, limits)) return idx;
  const { ncols, nrows } = terrain;
  const c0 = idx % ncols, r0 = (idx - c0) / ncols;
  for (let ring = 1; ring <= maxRing; ring++) {
    let best = -1, bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= ncols || r >= nrows) continue;
        const n = r * ncols + c;
        const d = dc * dc + dr * dr;
        if (!isBlocked(terrain, n, limits) && d < bestD) { best = n; bestD = d; }
      }
    }
    if (best !== -1) return best;
  }
  return -1;
}

/** Cells crossed by the straight segment between two cells (Bresenham). */
export function lineCells(terrain, a, b) {
  const { ncols } = terrain;
  let c = a % ncols, r = (a - c) / ncols;
  const c1 = b % ncols, r1 = (b - c1) / ncols;
  const dc = Math.abs(c1 - c), dr = Math.abs(r1 - r);
  const sc = c < c1 ? 1 : -1, sr = r < r1 ? 1 : -1;
  let err = dc - dr;
  const out = [];
  for (;;) {
    out.push(r * ncols + c);
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 < dc) { err += dc; r += sr; }
  }
  return out;
}

/**
 * Convert a list of cells into route points with cumulative distance, time
 * and radiation dose.
 */
export function analyzeRoute(terrain, cells, mode = 'foot') {
  const points = [];
  let distKm = 0, hours = 0, doseMsv = 0, maxSlope = 0;
  let prev = null;
  for (const idx of cells) {
    const p = terrain.cellToLonLat(idx);
    const slope = terrain.slope[idx];
    if (prev) {
      const d = terrain.distanceKm(prev, p);
      const dt = d / traverseSpeedKmh(slope, terrain.costMul[idx], mode);
      distKm += d;
      hours += dt;
      doseMsv += terrain.rad[idx] * dt;
    }
    maxSlope = Math.max(maxSlope, slope);
    points.push({
      ...p, cell: idx, elev: terrain.elev[idx], slope, rad: terrain.rad[idx],
      costMul: terrain.costMul[idx], zoneId: terrain.zoneId[idx],
      distKm, hours, doseMsv, maxSlopeSoFar: maxSlope,
    });
    prev = p;
  }
  return { points, distanceKm: distKm, durationH: hours, radiationMsv: doseMsv, maxSlopeDeg: maxSlope };
}

/**
 * Route through an ordered list of waypoints ({lon, lat}).
 * Waypoints that fall on a blocked cell are snapped to the nearest safe one.
 * @returns {{ok:boolean, failedLeg?:number, cells:number[], wpCells:number[], snapped:number[]}}
 */
export function planRoute(terrain, waypoints, opts = {}) {
  const limits = opts.limits ?? LIMITS;
  const snapped = [];
  const wpCells = waypoints.map((w, i) => {
    const raw = terrain.lonLatToCell(w.lon, w.lat);
    const safe = nearestPassable(terrain, raw, limits);
    if (safe !== raw) snapped.push(i);
    return safe;
  });
  if (wpCells.includes(-1)) return { ok: false, failedLeg: wpCells.indexOf(-1), cells: [], wpCells, snapped };

  const cells = wpCells.length ? [wpCells[0]] : [];
  for (let i = 1; i < wpCells.length; i++) {
    const leg = findPath(terrain, wpCells[i - 1], wpCells[i], opts);
    if (!leg) return { ok: false, failedLeg: i, cells, wpCells, snapped };
    cells.push(...leg.slice(1));
  }
  return { ok: true, cells, wpCells, snapped };
}

/**
 * Emergency Return: fastest safe way back to the habitat.
 * Uses the straight line when every cell on it is safe; otherwise falls back
 * to the shortest safe path around the blocked terrain.
 */
export function emergencyReturn(terrain, from, opts = {}) {
  const limits = opts.limits ?? LIMITS;
  const start = nearestPassable(terrain, terrain.lonLatToCell(from.lon, from.lat), limits);
  const goal = nearestPassable(terrain, terrain.lonLatToCell(terrain.habitat.lon, terrain.habitat.lat), limits);
  if (start === -1 || goal === -1) return { ok: false, cells: [], direct: false };

  const line = lineCells(terrain, start, goal);
  if (line.every((c) => !isBlocked(terrain, c, limits))) return { ok: true, cells: line, direct: true };

  const cells = findPath(terrain, start, goal, { limits, shortest: true });
  return { ok: !!cells, cells: cells ?? [], direct: false };
}
