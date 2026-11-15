/**
 * ElevationProfile — cross-section of the planned route: elevation against
 * distance, coloured by slope, with waypoint ticks and the astronaut cursor.
 */
import { t } from '../core/i18n.js';
import { suitO2Depletion } from '../core/BioSafetyCalculators.js';

const FONT = '"JetBrains Mono", ui-monospace, monospace';

const slopeColor = (s) => (s > 20 ? '#e5534b' : s > 15 ? '#e2a13a' : s > 8 ? '#e6d27a' : '#5fb878');

export class ElevationProfile {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  draw() {
    const { ctx, w, h, state } = this;
    if (!w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `500 10px ${FONT}`;
    ctx.textBaseline = 'middle';

    const route = state.route;
    if (!route || route.points.length < 2) {
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(t('profile.empty'), w / 2, h / 2);
      return;
    }

    const pts = route.points;
    const pad = { l: 52, r: 14, t: 14, b: 22 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p.elev); hi = Math.max(hi, p.elev); }
    const margin = Math.max(4, (hi - lo) * 0.12);
    lo -= margin;
    hi += margin;
    const X = (d) => pad.l + (d / route.distanceKm) * pw;
    const Y = (z) => pad.t + (1 - (z - lo) / (hi - lo)) * ph;

    // grid and axis labels
    ctx.strokeStyle = 'rgba(111, 182, 217,0.12)';
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const z = lo + ((hi - lo) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(z));
      ctx.lineTo(w - pad.r, Y(z));
      ctx.stroke();
      ctx.fillText(`${z.toFixed(0)} m`, pad.l - 6, Y(z));
    }
    ctx.textAlign = 'center';
    const stepKm = route.distanceKm > 8 ? 2 : route.distanceKm > 3 ? 1 : 0.5;
    for (let d = 0; d <= route.distanceKm; d += stepKm) ctx.fillText(`${d} km`, X(d), h - 9);

    // filled area
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, 'rgba(111, 182, 217,0.28)');
    grad.addColorStop(1, 'rgba(111, 182, 217,0.02)');
    ctx.beginPath();
    ctx.moveTo(X(0), pad.t + ph);
    for (const p of pts) ctx.lineTo(X(p.distKm), Y(p.elev));
    ctx.lineTo(X(route.distanceKm), pad.t + ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // slope-coloured line
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = slopeColor(pts[i].slope);
      ctx.beginPath();
      ctx.moveTo(X(pts[i - 1].distKm), Y(pts[i - 1].elev));
      ctx.lineTo(X(pts[i].distKm), Y(pts[i].elev));
      ctx.stroke();
    }

    // suit O2 depletion curve along the route (right-hand scale, 0-100 %)
    const O2 = (p) => pad.t + (suitO2Depletion(p.distKm, p.maxSlopeSoFar) / 100) * ph;
    ctx.save();
    ctx.strokeStyle = '#6fb6d9';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.distKm), O2(p)) : ctx.moveTo(X(p.distKm), O2(p))));
    ctx.stroke();
    ctx.restore();
    const last = pts[pts.length - 1];
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6fb6d9';
    ctx.fillText(`O₂ ${(100 - suitO2Depletion(last.distKm, last.maxSlopeSoFar)).toFixed(0)} %`, w - pad.r - 2, O2(last) - 8);

    // waypoint ticks
    ctx.textAlign = 'center';
    for (const m of route.wpMarks ?? []) {
      const x = X(m.distKm);
      ctx.strokeStyle = 'rgba(111, 182, 217,0.5)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6fb6d9';
      ctx.fillText(m.label, x, pad.t - 5);
    }

    // astronaut cursor
    const km = state.sim.km;
    if (km > 0) {
      const x = X(Math.min(km, route.distanceKm));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, Y(state.telemetry.elev), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
