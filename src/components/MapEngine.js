/**
 * MapEngine — Canvas 2D tactical map.
 * Layers (toggleable): HiRISE optical (live NASA Mars Trek tiles over a
 * shaded-relief fallback), MOLA topo & gradient, CRISM spectral, RAD danger.
 * Also draws hazard markers, science waypoints, the route and the astronaut.
 */
import { isBlocked } from '../core/PathfindingAlgorithm.js';

const TILE_BASE =
  'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm';
const TILE_COVERAGE = { west: 77.2229331, east: 77.583964, south: 18.3067994, north: 18.669315 };
const MAX_TILE_ZOOM = 18;

const COLORS = { cyan: '#00f3ff', amber: '#ffaa00', red: '#ff2255', green: '#39ff14' };
const ZONE_GLYPH = { slope: '⛰', loose: '≋', sand: '∿', boulders: '◆', unstable: '⚠' };

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export class MapEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/TerrainModel.js').Terrain} terrain
   * @param {object} state shared app state (layers, waypoints, route, sim)
   * @param {{onMapClick:Function, onMarkerClick:Function, onHover:Function}} handlers
   */
  constructor(canvas, terrain, state, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
    this.state = state;
    this.handlers = handlers;
    this.tiles = new Map();
    this.tilesOnline = false;
    this.rotation = 0; // radians, heading-up in HUD follow mode
    this.follow = false;
    this.center = {
      lon: (terrain.bounds.west + terrain.bounds.east) / 2,
      lat: (terrain.bounds.north + terrain.bounds.south) / 2,
    };
    this.pxPerKm = 100;
    this.rasters = this.#buildRasters();
    this.#bindEvents();
    this.resize();
    this.fit();
  }

  /* ---------- view transform ---------- */

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // keep the whole area in view until the user pans or zooms
    if (!this.userMoved && !this.follow) this.fit();
  }

  fit() {
    if (!this.w) return;
    const t = this.terrain, b = t.bounds;
    const wKm = (b.east - b.west) * t.kmPerDegLon;
    const hKm = (b.north - b.south) * t.kmPerDegLat;
    this.pxPerKm = Math.min(this.w / wKm, this.h / hKm) * 0.98;
    this.center = { lon: (b.west + b.east) / 2, lat: (b.north + b.south) / 2 };
    this.rotation = 0;
  }

  get anchor() {
    // screen point that the view centre maps to (lower in follow mode)
    return { x: this.w / 2, y: this.follow ? this.h * 0.72 : this.h / 2 };
  }

  /** Unrotated projection (used inside the rotated raster context). */
  project(lon, lat) {
    const t = this.terrain, a = this.anchor;
    return {
      x: a.x + (lon - this.center.lon) * t.kmPerDegLon * this.pxPerKm,
      y: a.y - (lat - this.center.lat) * t.kmPerDegLat * this.pxPerKm,
    };
  }

  toScreen(lon, lat) {
    const p = this.project(lon, lat);
    if (!this.rotation) return p;
    const a = this.anchor, c = Math.cos(-this.rotation), s = Math.sin(-this.rotation);
    const dx = p.x - a.x, dy = p.y - a.y;
    return { x: a.x + dx * c - dy * s, y: a.y + dx * s + dy * c };
  }

  toWorld(x, y) {
    const t = this.terrain, a = this.anchor;
    let dx = x - a.x, dy = y - a.y;
    if (this.rotation) {
      const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
      [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    }
    return {
      lon: this.center.lon + dx / (t.kmPerDegLon * this.pxPerKm),
      lat: this.center.lat - dy / (t.kmPerDegLat * this.pxPerKm),
    };
  }

  /* ---------- static rasters built once from the terrain grids ---------- */

  #buildRasters() {
    const t = this.terrain;
    const make = (pixel) => {
      const cv = document.createElement('canvas');
      cv.width = t.ncols;
      cv.height = t.nrows;
      const c = cv.getContext('2d');
      const img = c.createImageData(t.ncols, t.nrows);
      for (let i = 0; i < t.size; i++) {
        const [r, g, b, a] = pixel(i);
        img.data.set([r, g, b, a], i * 4);
      }
      c.putImageData(img, 0, 0);
      return cv;
    };

    const span = t.maxElev - t.minElev;
    const relief = make((i) => {
      const c = i % t.ncols, r = (i - c) / t.ncols;
      const z = t.elev[i];
      const zx = t.elev[r * t.ncols + Math.min(t.ncols - 1, c + 1)] - z;
      const zy = t.elev[Math.min(t.nrows - 1, r + 1) * t.ncols + c] - z;
      const shade = Math.max(0.35, Math.min(1.35, 0.85 - zx * 0.05 + zy * 0.05));
      const k = (z - t.minElev) / span;
      return [(70 + 120 * k) * shade, (42 + 78 * k) * shade, (28 + 48 * k) * shade, 255];
    });

    const topo = make((i) => {
      const s = t.slope[i];
      if (s > 20) return [255, 34, 85, 200];
      if (s > 15) return [255, 170, 0, 170];
      if (s > 8) return [255, 225, 90, 95];
      const k = (t.elev[i] - t.minElev) / span;
      return [40 + 180 * k, 160 + 60 * k, 220 - 120 * k, 60];
    });

    const classRgb = Object.fromEntries(
      Object.entries(t.minerals.classes).map(([k, v]) => [k, hexToRgb(v.color)]),
    );
    const crism = make((i) => {
      const p = t.cellToLonLat(i);
      let best = 0, rgb = null;
      for (const d of t.minerals.deposits) {
        const w = d.strength * Math.exp(-((t.distanceKm(p, d) / (d.radiusKm * 0.6)) ** 2));
        if (w > best) { best = w; rgb = classRgb[d.class]; }
      }
      return best > 0.08 ? [...rgb, Math.min(190, best * 230)] : [0, 0, 0, 0];
    });

    const { baselineMsvPerHour: base, limitMsvPerHour: limit } = t.hazards.radiation;
    const rad = make((i) => {
      const v = t.rad[i];
      if (v > limit) return [255, 34, 85, 175];
      const k = (v - base) / (limit - base);
      return k > 0.1 ? [200 + 55 * k, 60, 255 - 170 * k, 30 + 110 * k] : [0, 0, 0, 0];
    });

    return { relief, topo, crism, rad };
  }

  /* ---------- NASA Mars Trek tiles ---------- */

  #tile(z, x, y) {
    const key = `${z}/${y}/${x}`;
    let t = this.tiles.get(key);
    if (!t) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      t = { img, ready: false, failed: false };
      img.onload = () => { t.ready = true; this.tilesOnline = true; };
      img.onerror = () => { t.failed = true; };
      img.src = `${TILE_BASE}/${key}.png`;
      this.tiles.set(key, t);
    }
    return t;
  }

  #drawTiles(ctx, viewBox) {
    const t = this.terrain;
    const degPerPx = 1 / (t.kmPerDegLon * this.pxPerKm * this.dpr);
    const ideal = Math.ceil(Math.log2(180 / (256 * degPerPx)));
    const zTop = Math.max(8, Math.min(MAX_TILE_ZOOM, ideal));
    const west = Math.max(viewBox.west, TILE_COVERAGE.west), east = Math.min(viewBox.east, TILE_COVERAGE.east);
    const south = Math.max(viewBox.south, TILE_COVERAGE.south), north = Math.min(viewBox.north, TILE_COVERAGE.north);
    if (west >= east || south >= north) return;

    // draw a coarser level first so there is always something under loading tiles
    for (const z of [zTop - 2, zTop]) {
      const deg = 180 / 2 ** z;
      const x0 = Math.floor((west + 180) / deg), x1 = Math.floor((east + 180) / deg);
      const y0 = Math.floor((90 - north) / deg), y1 = Math.floor((90 - south) / deg);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 120) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const tile = this.#tile(z, x, y);
          if (!tile.ready) continue;
          const a = this.project(x * deg - 180, 90 - y * deg);
          const b = this.project((x + 1) * deg - 180, 90 - (y + 1) * deg);
          ctx.drawImage(tile.img, a.x, a.y, b.x - a.x + 0.5, b.y - a.y + 0.5);
        }
      }
    }
  }

  /* ---------- interaction ---------- */

  #bindEvents() {
    const cv = this.canvas;
    let drag = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    cv.addEventListener('pointerdown', (e) => {
      if (this.follow) return;
      const p = pos(e);
      drag = { ...p, moved: false, lon: this.center.lon, lat: this.center.lat };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) {
          const t = this.terrain;
          this.userMoved = true;
          this.center.lon = drag.lon - dx / (t.kmPerDegLon * this.pxPerKm);
          this.center.lat = drag.lat + dy / (t.kmPerDegLat * this.pxPerKm);
        }
      }
      this.handlers.onHover?.(this.toWorld(p.x, p.y));
    });
    cv.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      if (wasDrag) return;
      const p = pos(e);
      const marker = this.#hitMarker(p);
      if (marker) this.handlers.onMarkerClick?.(marker, p);
      else this.handlers.onMapClick?.(this.toWorld(p.x, p.y), p);
    });
    cv.addEventListener('pointerleave', () => this.handlers.onHover?.(null));
    cv.addEventListener('wheel', (e) => {
      if (this.follow) return;
      e.preventDefault();
      const p = pos(e);
      this.userMoved = true;
      const before = this.toWorld(p.x, p.y);
      this.pxPerKm = Math.min(6000, Math.max(40, this.pxPerKm * Math.exp(-e.deltaY * 0.0015)));
      const after = this.toWorld(p.x, p.y);
      this.center.lon += before.lon - after.lon;
      this.center.lat += before.lat - after.lat;
    }, { passive: false });
  }

  #hitMarker(p) {
    const t = this.terrain;
    const near = (o) => {
      const s = this.toScreen(o.lon, o.lat);
      return Math.hypot(s.x - p.x, s.y - p.y) < 14;
    };
    if (near(t.habitat)) return { type: 'habitat', data: t.habitat };
    for (const z of t.hazards.zones) if (near(z)) return { type: 'zone', data: z };
    if (this.state.layers.crism) {
      for (const d of t.minerals.deposits) if (near(d)) return { type: 'mineral', data: d };
    }
    if (this.state.layers.rad) {
      for (const h of t.hazards.radiation.hotspots) if (near(h)) return { type: 'rad', data: h };
    }
    return null;
  }

  /* ---------- drawing ---------- */

  draw(now) {
    const { ctx, state, terrain: t } = this;
    if (!this.w) return;
    const sim = state.sim;
    if (this.follow && sim.pos) {
      this.center = { lon: sim.pos.lon, lat: sim.pos.lat };
      this.rotation = (sim.heading * Math.PI) / 180;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, this.w, this.h);

    // world-aligned rasters, drawn inside a rotated context
    const a = this.anchor;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(-this.rotation);
    ctx.translate(-a.x, -a.y);
    const nw = this.project(t.bounds.west, t.bounds.north);
    const se = this.project(t.bounds.east, t.bounds.south);
    const blit = (raster, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(raster, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
      ctx.globalAlpha = 1;
    };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    blit(this.rasters.relief);
    if (state.layers.hirise) {
      const reach = Math.hypot(this.w, this.h) / this.pxPerKm; // km, covers any rotation
      this.#drawTiles(ctx, {
        west: this.center.lon - reach / t.kmPerDegLon, east: this.center.lon + reach / t.kmPerDegLon,
        south: this.center.lat - reach / t.kmPerDegLat, north: this.center.lat + reach / t.kmPerDegLat,
      });
    }
    if (state.layers.topo) blit(this.rasters.topo);
    if (state.layers.crism) blit(this.rasters.crism, 0.75 + 0.15 * Math.sin(now / 600));
    if (state.layers.rad) blit(this.rasters.rad);
    ctx.strokeStyle = 'rgba(0,243,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y);
    ctx.restore();

    this.#drawZones(now);
    if (state.layers.crism) this.#drawMinerals();
    if (state.layers.rad) this.#drawRadLabels();
    this.#drawRoute(now);
    this.#drawHabitat(now);
    this.#drawWaypoints();
    this.#drawAstronaut(now);
    if (!this.follow) this.#drawScaleBar();
  }

  #label(text, x, y, color, align = 'left') {
    const { ctx } = this;
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const bx = align === 'center' ? x - w / 2 - 4 : x - 4;
    ctx.fillStyle = 'rgba(2,6,23,0.78)';
    ctx.fillRect(bx, y - 8, w + 8, 16);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  #drawZones(now) {
    const { ctx } = this;
    for (const z of this.terrain.hazards.zones) {
      const s = this.toScreen(z.lon, z.lat);
      const r = z.radiusKm * this.pxPerKm;
      const color = z.type === 'slope' || z.type === 'unstable' ? COLORS.red : COLORS.amber;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -now / 60;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // numbered warning triangle
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 12);
      ctx.lineTo(s.x + 11, s.y + 8);
      ctx.lineTo(s.x - 11, s.y + 8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(2,6,23,0.9)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '700 11px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(z.id), s.x, s.y + 2);
      if (!this.follow && this.pxPerKm > 60) this.#label(`${ZONE_GLYPH[z.type]} Z${z.id} ${z.name}`, s.x + 16, s.y, color);
    }
  }

  #drawMinerals() {
    const { ctx } = this;
    const classes = this.terrain.minerals.classes;
    for (const d of this.terrain.minerals.deposits) {
      const s = this.toScreen(d.lon, d.lat);
      const color = classes[d.class].color;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(2,6,23,0.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
      if (!this.follow && d.waypoint && this.pxPerKm > 90) this.#label(d.name.split(' - ')[0], s.x + 11, s.y - 12, color);
    }
  }

  #drawRadLabels() {
    for (const h of this.terrain.hazards.radiation.hotspots) {
      const s = this.toScreen(h.lon, h.lat);
      this.#label(`☢ ${h.peakMsvPerHour.toFixed(2)} mSv/h`, s.x, s.y, COLORS.red, 'center');
    }
  }

  #drawRoute(now) {
    const { ctx, state } = this;
    const route = state.route;
    if (!route?.points.length) return;
    const pts = route.points.map((p) => this.toScreen(p.lon, p.lat));
    const split = route.emergencyIndex ?? pts.length;
    const stroke = (from, to, color, dash) => {
      if (to - from < 1) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[from].x, pts[from].y);
      for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(2,6,23,0.8)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = -now / 30; }
      ctx.stroke();
      ctx.restore();
    };
    stroke(0, Math.min(split, pts.length - 1), COLORS.green, null);
    if (split < pts.length - 1) stroke(split, pts.length - 1, COLORS.red, [10, 7]);
  }

  #drawHabitat(now) {
    const { ctx } = this;
    const h = this.terrain.habitat;
    const s = this.toScreen(h.lon, h.lat);
    const pulse = 10 + 4 * Math.sin(now / 400);
    ctx.save();
    ctx.strokeStyle = COLORS.cyan;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, pulse + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(2,6,23,0.9)';
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 10);
    ctx.lineTo(s.x + 10, s.y - 1);
    ctx.lineTo(s.x + 7, s.y + 9);
    ctx.lineTo(s.x - 7, s.y + 9);
    ctx.lineTo(s.x - 10, s.y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (!this.follow) this.#label(this.pxPerKm > 60 ? 'HAB · Octavia E. Butler' : 'HAB', s.x + 16, s.y, COLORS.cyan);
  }

  #drawWaypoints() {
    const { ctx, state } = this;
    state.waypoints.forEach((w, i) => {
      const s = this.toScreen(w.lon, w.lat);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2,6,23,0.9)';
      ctx.fill();
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = COLORS.cyan;
      ctx.font = '700 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), s.x, s.y + 0.5);
    });
  }

  #drawAstronaut(now) {
    const { ctx, state } = this;
    const sim = state.sim;
    if (!sim.pos || !state.route) return;
    const s = this.toScreen(sim.pos.lon, sim.pos.lat);
    const ang = ((sim.heading * Math.PI) / 180) - this.rotation;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now / 250);
    ctx.beginPath();
    ctx.arc(0, 0, 14 + 3 * Math.sin(now / 250), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  #drawScaleBar() {
    const { ctx } = this;
    const targets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
    const km = targets.find((k) => k * this.pxPerKm >= 70) ?? 5;
    const len = km * this.pxPerKm;
    const x = 16, y = this.h - 20;
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len, y - 5);
    ctx.stroke();
    this.#label(km < 1 ? `${km * 1000} m` : `${km} km`, x + len + 8, y - 3, COLORS.cyan);
  }

  /** Is the cell under this coordinate impassable? (for click feedback) */
  blockedAt(lon, lat) {
    return isBlocked(this.terrain, this.terrain.lonLatToCell(lon, lat));
  }
}
