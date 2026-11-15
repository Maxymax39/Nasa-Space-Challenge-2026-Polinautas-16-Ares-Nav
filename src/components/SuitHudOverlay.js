/**
 * SuitHudOverlay — in-helmet augmented-reality HUD.
 * Ultra-high-contrast symbology drawn over the heading-up terrain view:
 * rotating compass tape, waypoint vector, suit telemetry, tactical radar and
 * a flashing red alert box near unstable slopes, deep sand or radiation.
 */
import { SUIT } from '../core/BioSafetyCalculators.js';
import { formatHour } from '../core/EnvironmentModel.js';
// imported as L: several methods use `t` for telemetry or terrain
import { t as L } from '../core/i18n.js';

const C = { cyan: '#6fb6d9', amber: '#e2a13a', red: '#e5534b', green: '#5fb878', dim: 'rgba(111, 182, 217,0.45)' };
const FONT = '"JetBrains Mono", ui-monospace, monospace';
/** Cardinal letter for a heading that is a multiple of 45°, in the current language. */
const cardinal = (deg) => (deg % 45 === 0 ? L('hud.cardinals').split(',')[deg / 45] : undefined);
const RADAR_RANGE_KM = 0.6;

export class SuitHudOverlay {
  constructor(canvas, terrain, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
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

  #text(str, x, y, { size = 12, color = C.cyan, align = 'left', weight = 600 } = {}) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  draw(now) {
    const { ctx, w, h, state } = this;
    if (!w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 3;

    this.#visorFrame();
    this.#compass(state.sim.heading, state.nav, state.envNow);
    this.#environment(state.envNow);
    this.#reticle(state.nav);
    this.#suitColumn(state.telemetry);
    this.#navColumn(state.telemetry, state.nav);
    this.#radar(now);
    this.#windRose(state.envNow, state.sim.heading);
    this.#footer(state);
    this.#badges(state);
    this.#alert(state.alert, now);
    ctx.shadowBlur = 0;
  }

  /** Helmet curvature: dark vignette plus a curved visor rim. */
  #visorFrame() {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.42, w / 2, h * 0.52, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(17,19,21,0)');
    g.addColorStop(1, 'rgba(17,19,21,0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // darker bands behind the two readout columns so they hold up over bright ground
    for (const [x0, x1] of [[0, w * 0.3], [w, w * 0.7]]) {
      const side = ctx.createLinearGradient(x0, 0, x1, 0);
      side.addColorStop(0, 'rgba(17,19,21,0.7)');
      side.addColorStop(1, 'rgba(17,19,21,0)');
      ctx.fillStyle = side;
      ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
    }
    ctx.restore();

    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.2);
    ctx.quadraticCurveTo(w / 2, -h * 0.06, w * 0.94, h * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.86);
    ctx.quadraticCurveTo(w / 2, h * 1.05, w * 0.94, h * 0.86);
    ctx.stroke();
  }

  /** Rotating compass tape with heading readout and next-waypoint bug. */
  #compass(heading, nav, env) {
    const { ctx, w } = this;
    const tapeW = Math.min(620, w * 0.5), cx = w / 2, y = 62;
    const pxPerDeg = tapeW / 90;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - tapeW / 2, y - 26, tapeW, 52);
    ctx.clip();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1.5;
    const first = Math.floor((heading - 45) / 5) * 5;
    for (let d = first; d <= heading + 45; d += 5) {
      const x = cx + (d - heading) * pxPerDeg;
      const deg = ((d % 360) + 360) % 360;
      const major = deg % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + (major ? 16 : 10));
      ctx.stroke();
      if (major) {
        const card = cardinal(deg);
        this.#text(card ?? String(deg).padStart(3, '0'), x, y - 8, {
          size: card ? 15 : 11, align: 'center', weight: card ? 800 : 500, color: card ? '#ffffff' : C.cyan,
        });
      }
    }
    ctx.restore();

    ctx.strokeStyle = C.dim;
    ctx.beginPath();
    ctx.moveTo(cx - tapeW / 2, y + 20);
    ctx.lineTo(cx + tapeW / 2, y + 20);
    ctx.stroke();

    // heading box
    const hdg = String(Math.round(heading) % 360).padStart(3, '0');
    ctx.fillStyle = 'rgba(17,19,21,0.9)';
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(cx - 46, y + 26, 92, 28);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 7, y + 26);
    ctx.lineTo(cx, y + 18);
    ctx.lineTo(cx + 7, y + 26);
    ctx.stroke();
    this.#text(`HDG ${hdg}°`, cx, y + 41, { size: 15, align: 'center', color: '#ffffff', weight: 800 });

    // wind bug: amber wedge above the tape at the bearing the wind blows from
    if (env && env.windSpeed >= 1) {
      const rel = ((env.windDir - heading + 540) % 360) - 180;
      const x = cx + Math.max(-45, Math.min(45, rel)) * pxPerDeg;
      ctx.save();
      ctx.fillStyle = C.amber;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.globalAlpha = Math.abs(rel) > 45 ? 0.45 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x - 6, y - 31);
      ctx.lineTo(x + 6, y - 31);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // waypoint bearing bug (clamped to the tape ends)
    if (nav) {
      const rel = ((nav.bearing - heading + 540) % 360) - 180;
      const clamped = Math.max(-45, Math.min(45, rel));
      const x = cx + clamped * pxPerDeg;
      ctx.fillStyle = C.green;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.moveTo(x, y + 20);
      ctx.lineTo(x - 7, y + 32);
      ctx.lineTo(x + 7, y + 32);
      ctx.closePath();
      ctx.fill();
      if (Math.abs(rel) > 45) this.#text(rel > 0 ? '▶' : '◀', x + (rel > 0 ? 14 : -14), y + 26, { color: C.green, align: 'center' });
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    }
  }

  /** Weather strip under the visor rim: air, dust, wind relative to travel, local time. */
  #environment(v) {
    if (!v) return;
    const { w, h } = this;
    const xl = Math.max(28, w * 0.07), xr = w - xl, y = h * 0.21;
    const tone = { go: C.cyan, caution: C.amber, nogo: C.red }[v.status.level];
    const small = { size: 11, weight: 600 };
    this.#text(L('hud.env', { t: v.airTempC.toFixed(0), p: v.pressurePa.toFixed(0) }), xl, y, { ...small, color: '#ffffff' });
    this.#text(L('hud.dust', { tau: v.tau.toFixed(1), vis: v.visibilityKm >= 99 ? '>99' : v.visibilityKm.toFixed(0) }), xl, y + 16, { ...small, color: tone });
    this.#text(L('hud.wind', { v: v.windSpeed.toFixed(0), dir: String(v.windDir).padStart(3, '0') }), xr, y, { ...small, align: 'right', color: C.amber });
    this.#text(L('hud.windRel', { h: v.headwindMs.toFixed(0), c: Math.abs(v.crosswindMs).toFixed(0) }), xr, y + 16, { ...small, align: 'right' });
  }

  /** Centre reticle plus an arrow pointing at the next waypoint. */
  #reticle(nav) {
    const { ctx, w, h, state } = this;
    const cx = w / 2, cy = h * 0.5;
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 14, cy + dy * 14);
      ctx.lineTo(cx + dx * 30, cy + dy * 30);
      ctx.stroke();
    }
    if (!nav) return;
    const rel = (((nav.bearing - state.sim.heading + 540) % 360) - 180) * (Math.PI / 180);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rel);
    ctx.fillStyle = C.green;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, -78);
    ctx.lineTo(9, -58);
    ctx.lineTo(-9, -58);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.#text(`${nav.label} · ${Math.round(nav.distKm * 1000)} m`, cx, cy + 56, { align: 'center', color: C.green, size: 13 });
  }

  #row(label, value, x, y, { align = 'left', color = '#ffffff' } = {}) {
    this.#text(label, x, y, { size: 10, color: C.cyan, align, weight: 500 });
    this.#text(value, x, y + 17, { size: 18, color, align, weight: 800 });
  }

  /** Left column: life support. */
  #suitColumn(t) {
    const { ctx, w, h } = this;
    const x = Math.max(28, w * 0.07), y0 = h * 0.3;
    const o2Color = t.o2Pct < 25 ? C.red : t.o2Pct < 50 ? C.amber : C.green;
    this.#row(L('hud.o2'), `${t.o2Pct.toFixed(1)} %`, x, y0, { color: o2Color });
    ctx.strokeStyle = C.dim;
    ctx.strokeRect(x, y0 + 32, 120, 7);
    ctx.fillStyle = o2Color;
    ctx.fillRect(x, y0 + 32, 120 * (t.o2Pct / 100), 7);
    this.#row(L('hud.press'), `${t.pressurePsid.toFixed(2)} psid`, x, y0 + 62);
    this.#row(L('hud.hr'), `${t.hr} bpm`, x, y0 + 106, { color: t.hr > 150 ? C.amber : '#ffffff' });
    this.#row('ppCO₂', `${t.ppCo2.toFixed(1)} mmHg`, x, y0 + 150, { color: t.ppCo2 > SUIT.maxPpCo2MmHg ? C.red : '#ffffff' });
    this.#row(L('hud.hydration'), `${Math.round(t.hydrationL * 1000)} mL`, x, y0 + 194);
  }

  /** Right column: navigation and environment. */
  #navColumn(t, nav) {
    const { w, h } = this;
    const x = w - Math.max(28, w * 0.07), y0 = h * 0.3;
    const o = { align: 'right' };
    this.#row(L('hud.nextWp'),nav ? `${nav.label}  ${String(Math.round(nav.bearing)).padStart(3, '0')}°` : '—', x, y0, { ...o, color: C.green });
    this.#row('ETA', nav ? `${Math.max(1, Math.round(nav.etaMin))} min` : '—', x, y0 + 44, o);
    this.#row(L('hud.slope'), `${t.slope.toFixed(1)}°`, x, y0 + 88, { ...o, color: t.slope > 15 ? C.red : t.slope > 10 ? C.amber : '#ffffff' });
    this.#row(L('hud.rad'), `${t.radRate.toFixed(3)} mSv/h`, x, y0 + 132, { ...o, color: t.radRate > SUIT.radAlertMsvPerHour ? C.red : t.radRate > 0.12 ? C.amber : '#ffffff' });
    this.#row(L('hud.dose'), `${t.doseMsv.toFixed(3)} mSv`, x, y0 + 176, o);
    this.#row(L('hud.score'), t.score.toFixed(0), x, y0 + 220, { ...o, color: t.score >= 75 ? C.green : t.score >= 50 ? C.amber : C.red });
  }

  /** Heading-up tactical radar: route, hazard zones, habitat direction. */
  #radar(now) {
    const { ctx, w, h, state, terrain: t } = this;
    const pos = state.sim.pos;
    if (!pos) return;
    const R = Math.min(92, h * 0.14), cx = Math.max(28, w * 0.07) + R, cy = h - R - 46;
    const scale = R / RADAR_RANGE_KM;
    const rot = (-state.sim.heading * Math.PI) / 180;
    const local = (p) => {
      const e = (p.lon - pos.lon) * t.kmPerDegLon * scale;
      const n = (p.lat - pos.lat) * t.kmPerDegLat * scale;
      return { x: cx + e * Math.cos(rot) + n * Math.sin(rot), y: cy + e * Math.sin(rot) - n * Math.cos(rot) };
    };

    ctx.save();
    ctx.fillStyle = 'rgba(17,19,21,0.72)';
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(111, 182, 217,0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, R / 2, 0, Math.PI * 2);
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // sweep
    const sweep = (now / 1400) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(111, 182, 217,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.stroke();

    for (const z of t.hazards.zones) {
      const p = local(z);
      const color = z.type === 'slope' || z.type === 'unstable' ? C.red : C.amber;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, z.radiusKm * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (state.route) {
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
      ctx.beginPath();
      state.route.points.forEach((pt, i) => {
        const p = local(pt);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
    }
    ctx.restore();

    // own position
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.closePath();
    ctx.fill();

    // habitat direction on the rim
    const hb = (((t.bearingDeg(pos, t.habitat) - state.sim.heading) * Math.PI) / 180) - Math.PI / 2;
    ctx.fillStyle = C.cyan;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(hb) * R, cy + Math.sin(hb) * R, 4.5, 0, Math.PI * 2);
    ctx.fill();
    this.#text(L('hud.radar', { m: RADAR_RANGE_KM * 1000, km: t.distanceKm(pos, t.habitat).toFixed(2) }), cx - R, cy + R + 16, { size: 10, weight: 500 });
  }

  #footer(state) {
    const { w, h } = this;
    const x = w - Math.max(28, w * 0.07);
    const t = state.telemetry;
    const hh = Math.floor(t.hours), mm = Math.floor((t.hours - hh) * 60);
    this.#text(`EVA T+${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, x, h - 74, { align: 'right', size: 16, color: '#ffffff', weight: 800 });
    this.#text(state.visorOn ? L('hud.visorOn', { pct: Math.round(SUIT.visorTransmission * 100) }) : L('hud.visorOff'), x, h - 54, { align: 'right', size: 10, color: state.visorOn ? C.cyan : C.amber, weight: 500 });
    if (state.envNow) this.#text(L('hud.ltst', { time: formatHour(state.envNow.hour) }), x, h - 92, { align: 'right', size: 10, weight: 500 });
    this.#text(L('hud.link'), x, h - 38, { align: 'right', size: 10, weight: 500 });
  }

  /**
   * Wind vector rose, beside the radar and heading-up like it. The arrow
   * points the way the dust is travelling relative to the direction of
   * travel; the figures give speed, source bearing and the head/cross split.
   */
  #windRose(v, heading) {
    if (!v) return;
    const { ctx, w, h } = this;
    const R = Math.min(92, h * 0.14), r = 30;
    const cx = Math.max(28, w * 0.07) + 2 * R + 26 + r, cy = h - r - 98; // clear of the camera pad
    const color = v.windSpeed >= 25 ? C.red : v.windSpeed >= 15 ? C.amber : C.cyan;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(17,19,21,0.72)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // tick at the top marks the direction of travel
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - r + 6);
    ctx.stroke();

    if (v.windSpeed >= 1) {
      ctx.translate(cx, cy);
      ctx.rotate(((v.windDir + 180 - heading) * Math.PI) / 180);
      const len = 10 + Math.min(14, v.windSpeed * 0.5); // longer arrow, stronger wind
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(6, -len + 10);
      ctx.lineTo(2, -len + 10);
      ctx.lineTo(2, len);
      ctx.lineTo(-2, len);
      ctx.lineTo(-2, -len + 10);
      ctx.lineTo(-6, -len + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const tx = cx + r + 10;
    this.#text(L('hud.windRose'), tx, cy - 20, { size: 10, weight: 500 });
    this.#text(`${v.windSpeed.toFixed(0)} m/s`, tx, cy - 4, { size: 16, color: '#ffffff', weight: 800 });
    this.#text(L('hud.windFrom', { dir: String(v.windDir).padStart(3, '0') }), tx, cy + 13, { size: 10, color, weight: 600 });
  }

  /** Tags pinned to the astronaut and the rover in the 3D scene: who is who, and how they are doing. */
  #badges(state) {
    const at = this.view3d?.labels;
    if (!at) return;
    const { ctx } = this;
    const tag = (pos, text, color) => {
      if (!pos) return;
      ctx.font = `600 11px ${FONT}`;
      const tw = ctx.measureText(text).width;
      const x = pos.x - tw / 2 - 6, y = pos.y - 20;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(17,19,21,0.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, tw + 12, 18);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      this.#text(text, pos.x, y + 9, { size: 11, color, align: 'center' });
    };
    const tm = state.telemetry;
    const vitals = tm.o2Pct < 25 || tm.hr >= 170 ? C.red : tm.o2Pct < 50 || tm.hr >= 150 ? C.amber : C.green;
    tag(at.astronaut, L('map.ev', { o2: tm.o2Pct.toFixed(0), hr: tm.hr }), vitals);
    const rv = state.rover;
    if (rv) {
      tag(at.rover, L('map.rover', {
        bat: rv.batteryPct.toFixed(0), cargo: rv.cargoKg, max: rv.cargoMaxKg, com: L(`rover.com.${rv.comms}`),
      }), rv.batteryPct < 20 || rv.comms !== 'ok' ? C.red : C.amber);
    }
  }

  /** Alert box: flashing red for danger, steady amber for caution. */
  #alert(alert, now) {
    if (!alert || alert.level === 'none') return;
    const { ctx, w, h } = this;
    const danger = alert.level === 'danger';
    const on = !danger || Math.floor(now / 280) % 2 === 0;
    const color = danger ? C.red : C.amber;
    // long titles (the RTB message) get a smaller face and a wider box
    const size = alert.title.length > 34 ? 13 : 17;
    ctx.font = `800 ${size}px ${FONT}`;
    const bw = Math.min(w - 40, Math.max(Math.min(520, w * 0.5), ctx.measureText(`⚠ ${alert.title}`).width + 36));
    const bh = 64, x = (w - bw) / 2, y = h * 0.68;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = on ? 3 : 0;
    ctx.fillStyle = on && danger ? 'rgba(229, 83, 75,0.28)' : 'rgba(17,19,21,0.85)';
    ctx.strokeStyle = color;
    ctx.globalAlpha = on ? 1 : 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x, y, bw, bh);
    ctx.fill();
    ctx.stroke();
    this.#text(`⚠ ${alert.title}`, w / 2, y + 22, { align: 'center', size, color, weight: 800 });
    this.#text(alert.detail, w / 2, y + 45, { align: 'center', size: 12, color: '#ffffff', weight: 500 });
    ctx.restore();
  }
}
