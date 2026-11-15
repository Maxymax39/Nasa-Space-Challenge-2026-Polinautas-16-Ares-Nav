/**
 * TerrainModel — turns the raw data files into per-cell grids used by the
 * routing engine and the map layers: elevation, slope, radiation dose rate,
 * terrain cost multiplier and nearest hazard zone.
 */

const MARS_RADIUS_KM = 3389.5;
const DEG = Math.PI / 180;

export class Terrain {
  constructor(dem, hazards, minerals) {
    this.meta = dem.meta;
    this.bounds = dem.bounds;
    this.ncols = dem.ncols;
    this.nrows = dem.nrows;
    this.size = this.ncols * this.nrows;
    this.hazards = hazards;
    this.minerals = minerals;
    this.habitat = hazards.habitat;

    const midLat = (this.bounds.north + this.bounds.south) / 2;
    this.kmPerDegLat = MARS_RADIUS_KM * DEG;
    this.kmPerDegLon = this.kmPerDegLat * Math.cos(midLat * DEG);
    this.cellKmX = ((this.bounds.east - this.bounds.west) * this.kmPerDegLon) / this.ncols;
    this.cellKmY = ((this.bounds.north - this.bounds.south) * this.kmPerDegLat) / this.nrows;

    this.elev = new Float32Array(this.size);
    for (let r = 0; r < this.nrows; r++) this.elev.set(dem.elevations[r], r * this.ncols);
    this.minElev = Infinity;
    this.maxElev = -Infinity;
    for (const z of this.elev) {
      if (z < this.minElev) this.minElev = z;
      if (z > this.maxElev) this.maxElev = z;
    }

    this.slope = this.#computeSlope();
    this.rad = new Float32Array(this.size);
    this.costMul = new Float32Array(this.size).fill(1);
    this.zoneId = new Uint8Array(this.size);
    this.#rasterizeHazards();
    this.radBase = Float32Array.from(this.rad); // quiet-Sun dose rate
    this.radFactor = 1;
  }

  /** Scale the dose-rate field for the current space weather (1 = quiet Sun). */
  setRadiationFactor(factor) {
    if (factor === this.radFactor) return false;
    this.radFactor = factor;
    for (let i = 0; i < this.size; i++) this.rad[i] = this.radBase[i] * factor;
    return true;
  }

  /** Horn (1981) 3×3 slope in degrees. */
  #computeSlope() {
    const { ncols, nrows, elev } = this;
    const out = new Float32Array(this.size);
    const dx = this.cellKmX * 1000;
    const dy = this.cellKmY * 1000;
    const at = (c, r) =>
      elev[Math.min(nrows - 1, Math.max(0, r)) * ncols + Math.min(ncols - 1, Math.max(0, c))];
    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < ncols; c++) {
        const a = at(c - 1, r - 1), b = at(c, r - 1), d = at(c + 1, r - 1);
        const e = at(c - 1, r), f = at(c + 1, r);
        const g = at(c - 1, r + 1), h = at(c, r + 1), i = at(c + 1, r + 1);
        const dzdx = (d + 2 * f + i - (a + 2 * e + g)) / (8 * dx);
        const dzdy = (g + 2 * h + i - (a + 2 * b + d)) / (8 * dy);
        out[r * ncols + c] = Math.atan(Math.hypot(dzdx, dzdy)) / DEG;
      }
    }
    return out;
  }

  #rasterizeHazards() {
    const { radiation, zones } = this.hazards;
    for (let i = 0; i < this.size; i++) {
      const p = this.cellToLonLat(i);
      let rate = radiation.baselineMsvPerHour;
      for (const h of radiation.hotspots) {
        const d = this.distanceKm(p, h);
        rate += (h.peakMsvPerHour - radiation.baselineMsvPerHour) * Math.exp(-((d / (h.radiusKm * 0.6)) ** 2));
      }
      this.rad[i] = rate;
      for (const z of zones) {
        if (z.type === 'slope') continue; // slope hazards come straight from the DEM
        if (this.distanceKm(p, z) <= z.radiusKm && z.costMultiplier > this.costMul[i]) {
          this.costMul[i] = z.costMultiplier;
          this.zoneId[i] = z.id;
        }
      }
    }
  }

  inBounds(lon, lat) {
    const b = this.bounds;
    return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
  }

  lonLatToCell(lon, lat) {
    const b = this.bounds;
    const c = Math.floor(((lon - b.west) / (b.east - b.west)) * this.ncols);
    const r = Math.floor(((b.north - lat) / (b.north - b.south)) * this.nrows);
    return (
      Math.min(this.nrows - 1, Math.max(0, r)) * this.ncols + Math.min(this.ncols - 1, Math.max(0, c))
    );
  }

  cellToLonLat(idx) {
    const b = this.bounds;
    const c = idx % this.ncols;
    const r = (idx - c) / this.ncols;
    return {
      lon: b.west + ((c + 0.5) / this.ncols) * (b.east - b.west),
      lat: b.north - ((r + 0.5) / this.nrows) * (b.north - b.south),
    };
  }

  /** Planar distance in km (valid at this local scale). */
  distanceKm(a, b) {
    return Math.hypot((a.lon - b.lon) * this.kmPerDegLon, (a.lat - b.lat) * this.kmPerDegLat);
  }

  /** Compass bearing from a to b in degrees (0 = north, 90 = east). */
  bearingDeg(a, b) {
    const e = (b.lon - a.lon) * this.kmPerDegLon;
    const n = (b.lat - a.lat) * this.kmPerDegLat;
    return (Math.atan2(e, n) / DEG + 360) % 360;
  }

  /** Elevation (m) interpolated between cell centres; used for meshes and contours. */
  elevAt(lon, lat) {
    const b = this.bounds;
    const fx = ((lon - b.west) / (b.east - b.west)) * this.ncols - 0.5;
    const fy = ((b.north - lat) / (b.north - b.south)) * this.nrows - 0.5;
    const cx = Math.min(this.ncols - 1, Math.max(0, fx)), cy = Math.min(this.nrows - 1, Math.max(0, fy));
    const c0 = Math.floor(cx), r0 = Math.floor(cy);
    const c1 = Math.min(this.ncols - 1, c0 + 1), r1 = Math.min(this.nrows - 1, r0 + 1);
    const kx = cx - c0, ky = cy - r0;
    const e = this.elev, n = this.ncols;
    const top = e[r0 * n + c0] * (1 - kx) + e[r0 * n + c1] * kx;
    const bottom = e[r1 * n + c0] * (1 - kx) + e[r1 * n + c1] * kx;
    return top * (1 - ky) + bottom * ky;
  }

  /** Everything known about the cell under a coordinate. */
  sample(lon, lat) {
    const i = this.lonLatToCell(lon, lat);
    return {
      cell: i,
      elev: this.elev[i],
      slope: this.slope[i],
      rad: this.rad[i],
      costMul: this.costMul[i],
      zoneId: this.zoneId[i],
    };
  }

  /** Nearest hazard zone and distance to its edge (km, negative when inside). */
  nearestZone(p) {
    let best = null;
    for (const z of this.hazards.zones) {
      const edge = this.distanceKm(p, z) - z.radiusKm;
      if (!best || edge < best.edgeKm) best = { zone: z, edgeKm: edge };
    }
    return best;
  }
}

/** Fetch the three data files and build the terrain model. */
export async function loadTerrain(base = 'assets/data/') {
  const get = async (f) => {
    const res = await fetch(base + f);
    if (!res.ok) throw new Error(`No se pudo cargar ${f} (${res.status})`);
    return res.json();
  };
  const [dem, hazards, minerals] = await Promise.all([
    get('jezero_dem_sample.json'),
    get('hazard_zones.json'),
    get('crism_minerals.json'),
  ]);
  return new Terrain(dem, hazards, minerals);
}
