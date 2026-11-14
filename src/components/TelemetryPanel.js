/**
 * TelemetryPanel — route metrics, live suit telemetry and the habitat
 * consumables budget (NASA-STD-3001 envelope).
 */
import { habitatConsumables, SUIT } from '../core/BioSafetyCalculators.js';

const range = ([lo, hi], digits = 1) => `${lo.toFixed(digits)} – ${hi.toFixed(digits)}`;

export class TelemetryPanel {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    root.innerHTML = `
      <section class="panel-block">
        <h2 class="panel-title">Índice Global de Seguridad EVA</h2>
        <div class="score-wrap">
          <div class="score-value" data-k="score">—</div>
          <div>
            <div class="score-band" data-k="band">SIN RUTA</div>
            <div class="score-bar"><div data-k="scoreBar"></div></div>
            <div class="hint" data-k="routeNote">Haz clic en el mapa para trazar waypoints.</div>
          </div>
        </div>
      </section>

      <section class="panel-block">
        <h2 class="panel-title">Ruta planificada</h2>
        <dl class="metrics">
          <div><dt>Distancia total</dt><dd data-k="dist">—</dd></div>
          <div><dt>Pendiente máx.</dt><dd data-k="slope">—</dd></div>
          <div><dt>Duración est.</dt><dd data-k="dur">—</dd></div>
          <div><dt>Depleción O₂</dt><dd data-k="o2dep">—</dd></div>
          <div><dt>Dosis acumulada</dt><dd data-k="dose">—</dd></div>
          <div><dt>Hidratación mín.</dt><dd data-k="water">—</dd></div>
        </dl>
      </section>

      <section class="panel-block">
        <h2 class="panel-title">Soporte vital del traje <span class="live-dot" data-k="live"></span></h2>
        <div class="bar-row"><span>O₂ restante</span><b data-k="o2">100.0 %</b></div>
        <div class="bar"><div data-k="o2Bar" style="width:100%"></div></div>
        <dl class="metrics">
          <div><dt>Presión interna</dt><dd data-k="press">${SUIT.pressurePsid.toFixed(2)} psid</dd></div>
          <div><dt>Frec. cardíaca</dt><dd data-k="hr">72 bpm</dd></div>
          <div><dt>ppCO₂ (≤ ${SUIT.maxPpCo2MmHg})</dt><dd data-k="co2">— mmHg</dd></div>
          <div><dt>Tasa RAD (≤ ${SUIT.radAlertMsvPerHour})</dt><dd data-k="rad">— mSv/h</dd></div>
          <div><dt>Recorrido</dt><dd data-k="prog">0.00 km</dd></div>
          <div><dt>Tiempo EVA</dt><dd data-k="time">00:00</dd></div>
        </dl>
      </section>

      <section class="panel-block">
        <h2 class="panel-title">Consumibles en hábitat</h2>
        <div class="inline-inputs">
          <label>Tripulación <input type="number" min="1" max="12" value="4" data-k="crew"></label>
          <label>Soles <input type="number" min="1" max="900" value="30" data-k="sols"></label>
        </div>
        <dl class="metrics">
          <div><dt>Oxígeno</dt><dd data-k="hO2">—</dd></div>
          <div><dt>Agua potable</dt><dd data-k="hWater">—</dd></div>
          <div><dt>Agua higiene/traje</dt><dd data-k="hHyg">—</dd></div>
          <div><dt>Alimentos</dt><dd data-k="hFood">—</dd></div>
        </dl>
        <div class="hint" data-k="hKcal"></div>
      </section>`;
    this.el = Object.fromEntries([...root.querySelectorAll('[data-k]')].map((n) => [n.dataset.k, n]));
    this.el.crew.addEventListener('input', () => this.#habitat());
    this.el.sols.addEventListener('input', () => this.#habitat());
    this.#habitat();
  }

  #habitat() {
    const crew = Math.max(1, Number(this.el.crew.value) || 1);
    const sols = Math.max(1, Number(this.el.sols.value) || 1);
    const c = habitatConsumables(crew, sols);
    this.el.hO2.textContent = `${range(c.o2Kg)} kg`;
    this.el.hWater.textContent = `${range(c.waterL, 0)} L`;
    this.el.hHyg.textContent = `${range(c.hygieneWaterL, 0)} L`;
    this.el.hFood.textContent = `${range(c.foodKg)} kg`;
    this.el.hKcal.textContent = `${c.kcal.toLocaleString('es')} kcal en total · ${crew} tripulante(s) × ${sols} sol(es)`;
  }

  /** Refresh after the route changes. */
  updateRoute() {
    const { route, routeError } = this.state;
    const e = this.el;
    if (!route) {
      e.score.textContent = '—';
      e.score.style.color = '';
      e.band.textContent = routeError ? 'RUTA BLOQUEADA' : 'SIN RUTA';
      e.band.style.color = routeError ? '#ff2255' : '';
      e.scoreBar.style.width = '0%';
      e.routeNote.textContent = routeError ?? 'Haz clic en el mapa para trazar waypoints.';
      for (const k of ['dist', 'slope', 'dur', 'o2dep', 'dose', 'water']) e[k].textContent = '—';
      return;
    }
    const s = route.summary;
    e.score.textContent = s.score.toFixed(0);
    e.score.style.color = s.band.color;
    e.band.textContent = route.kind === 'emergency' ? 'REGRESO DE EMERGENCIA' : s.band.label;
    e.band.style.color = route.kind === 'emergency' ? '#ff2255' : s.band.color;
    e.scoreBar.style.width = `${s.score}%`;
    e.scoreBar.style.background = s.band.color;
    e.routeNote.textContent = route.note ?? '';
    e.dist.textContent = `${route.distanceKm.toFixed(2)} km`;
    e.slope.textContent = `${route.maxSlopeDeg.toFixed(1)}°`;
    const hh = Math.floor(route.durationH), mm = Math.round((route.durationH - hh) * 60);
    e.dur.textContent = `${hh} h ${String(mm).padStart(2, '0')} min`;
    e.dur.style.color = s.exceedsEvaWindow ? '#ff2255' : '';
    e.o2dep.textContent = `${s.o2DepletionPct.toFixed(1)} %`;
    e.dose.textContent = `${route.radiationMsv.toFixed(3)} mSv`;
    e.water.textContent = `${s.hydrationL.toFixed(2)} L`;
  }

  /** Refresh live suit telemetry (called a few times per second). */
  updateLive() {
    const t = this.state.telemetry, e = this.el;
    const o2Color = t.o2Pct < 25 ? '#ff2255' : t.o2Pct < 50 ? '#ffaa00' : '#39ff14';
    e.o2.textContent = `${t.o2Pct.toFixed(1)} %`;
    e.o2Bar.style.width = `${t.o2Pct}%`;
    e.o2Bar.style.background = o2Color;
    e.press.textContent = `${t.pressurePsid.toFixed(2)} psid`;
    e.hr.textContent = `${t.hr} bpm`;
    e.co2.textContent = `${t.ppCo2.toFixed(1)} mmHg`;
    e.rad.textContent = `${t.radRate.toFixed(3)} mSv/h`;
    e.rad.style.color = t.radRate > SUIT.radAlertMsvPerHour ? '#ff2255' : '';
    e.prog.textContent = `${t.distKm.toFixed(2)} km`;
    const hh = Math.floor(t.hours), mm = Math.floor((t.hours - hh) * 60);
    e.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    e.live.classList.toggle('on', this.state.sim.running);
  }
}
