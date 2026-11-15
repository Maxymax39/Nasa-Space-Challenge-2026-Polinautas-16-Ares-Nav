/**
 * TelemetryPanel — route metrics, live suit telemetry and the habitat
 * consumables budget (NASA-STD-3001 envelope).
 */
import { habitatConsumables, SUIT } from '../core/BioSafetyCalculators.js';
import { t, applyI18n, getLang, onLangChange } from '../core/i18n.js';

const range = ([lo, hi], digits = 1) => `${lo.toFixed(digits)} – ${hi.toFixed(digits)}`;

export class TelemetryPanel {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    root.innerHTML = `
      <section class="panel-block">
        <h2 class="panel-title" data-i18n="panel.score"></h2>
        <div class="score-wrap">
          <div class="score-value" data-k="score">—</div>
          <div>
            <div class="score-band" data-k="band"></div>
            <div class="score-bar"><div data-k="scoreBar"></div></div>
            <div class="hint" data-k="routeNote"></div>
          </div>
        </div>
      </section>

      <section class="panel-block">
        <h2 class="panel-title" data-i18n="panel.route"></h2>
        <dl class="metrics">
          <div><dt data-i18n="panel.dist"></dt><dd data-k="dist">—</dd></div>
          <div><dt data-i18n="panel.slope"></dt><dd data-k="slope">—</dd></div>
          <div><dt data-i18n="panel.dur"></dt><dd data-k="dur">—</dd></div>
          <div><dt data-i18n="panel.o2dep"></dt><dd data-k="o2dep">—</dd></div>
          <div><dt data-i18n="panel.dose"></dt><dd data-k="dose">—</dd></div>
          <div><dt data-i18n="panel.water"></dt><dd data-k="water">—</dd></div>
        </dl>
      </section>

      <section class="panel-block">
        <h2 class="panel-title"><span data-i18n="panel.suit"></span> <span class="live-dot" data-k="live"></span></h2>
        <div class="bar-row"><span data-i18n="panel.o2left"></span><b data-k="o2">100.0 %</b></div>
        <div class="bar"><div data-k="o2Bar" style="width:100%"></div></div>
        <dl class="metrics">
          <div><dt data-i18n="panel.press"></dt><dd data-k="press">${SUIT.pressurePsid.toFixed(2)} psid</dd></div>
          <div><dt data-i18n="panel.hr"></dt><dd data-k="hr">72 bpm</dd></div>
          <div><dt>ppCO₂ (≤ ${SUIT.maxPpCo2MmHg})</dt><dd data-k="co2">— mmHg</dd></div>
          <div><dt><span data-i18n="panel.radRate"></span> (≤ ${SUIT.radAlertMsvPerHour})</dt><dd data-k="rad">— mSv/h</dd></div>
          <div><dt data-i18n="panel.progress"></dt><dd data-k="prog">0.00 km</dd></div>
          <div><dt data-i18n="panel.time"></dt><dd data-k="time">00:00</dd></div>
        </dl>
      </section>

      <section class="panel-block">
        <h2 class="panel-title" data-i18n="panel.habitat"></h2>
        <div class="inline-inputs">
          <label><span data-i18n="panel.crew"></span> <input type="number" min="1" max="12" value="4" data-k="crew"></label>
          <label><span data-i18n="panel.sols"></span> <input type="number" min="1" max="900" value="30" data-k="sols"></label>
        </div>
        <dl class="metrics">
          <div><dt data-i18n="panel.hO2"></dt><dd data-k="hO2">—</dd></div>
          <div><dt data-i18n="panel.hWater"></dt><dd data-k="hWater">—</dd></div>
          <div><dt data-i18n="panel.hHyg"></dt><dd data-k="hHyg">—</dd></div>
          <div><dt data-i18n="panel.hFood"></dt><dd data-k="hFood">—</dd></div>
        </dl>
        <div class="hint" data-k="hKcal"></div>
      </section>`;
    applyI18n(root);
    this.el = Object.fromEntries([...root.querySelectorAll('[data-k]')].map((n) => [n.dataset.k, n]));
    this.el.crew.addEventListener('input', () => this.#habitat());
    this.el.sols.addEventListener('input', () => this.#habitat());
    this.#habitat();
    // static labels are refreshed by applyI18n(); these hold computed text
    onLangChange(() => {
      this.#habitat();
      this.updateRoute();
    });
  }

  #habitat() {
    const crew = Math.max(1, Number(this.el.crew.value) || 1);
    const sols = Math.max(1, Number(this.el.sols.value) || 1);
    const c = habitatConsumables(crew, sols);
    this.el.hO2.textContent = `${range(c.o2Kg)} kg`;
    this.el.hWater.textContent = `${range(c.waterL, 0)} L`;
    this.el.hHyg.textContent = `${range(c.hygieneWaterL, 0)} L`;
    this.el.hFood.textContent = `${range(c.foodKg)} kg`;
    this.el.hKcal.textContent = t('panel.kcal', { kcal: c.kcal.toLocaleString(getLang()), crew, sols });
  }

  /** Text of a stored message: {key, vars} objects are translated at render time. */
  #msg(m) {
    return Array.isArray(m) ? m.map((x) => t(x.key, x.vars)).join(' ') : t(m.key, m.vars);
  }

  /** Refresh after the route or the language changes. */
  updateRoute() {
    const { route, routeError } = this.state;
    const e = this.el;
    if (!route) {
      e.score.textContent = '—';
      e.score.style.color = '';
      e.band.textContent = t(routeError ? 'panel.blocked' : 'panel.noRoute');
      e.band.style.color = routeError ? '#ff2255' : '';
      e.scoreBar.style.width = '0%';
      e.routeNote.textContent = routeError ? this.#msg(routeError) : t('panel.clickHint');
      for (const k of ['dist', 'slope', 'dur', 'o2dep', 'dose', 'water']) e[k].textContent = '—';
      return;
    }
    const s = route.summary;
    const emergency = route.kind === 'emergency';
    e.score.textContent = s.score.toFixed(0);
    e.score.style.color = s.band.color;
    e.band.textContent = emergency ? t('panel.emergency') : t(`band.${s.band.level}`);
    e.band.style.color = emergency ? '#ff2255' : s.band.color;
    e.scoreBar.style.width = `${s.score}%`;
    e.scoreBar.style.background = s.band.color;
    e.routeNote.textContent = route.notes ? this.#msg(route.notes) : '';
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
    const tm = this.state.telemetry, e = this.el;
    const o2Color = tm.o2Pct < 25 ? '#ff2255' : tm.o2Pct < 50 ? '#ffaa00' : '#39ff14';
    e.o2.textContent = `${tm.o2Pct.toFixed(1)} %`;
    e.o2Bar.style.width = `${tm.o2Pct}%`;
    e.o2Bar.style.background = o2Color;
    e.press.textContent = `${tm.pressurePsid.toFixed(2)} psid`;
    e.hr.textContent = `${tm.hr} bpm`;
    e.co2.textContent = `${tm.ppCo2.toFixed(1)} mmHg`;
    e.rad.textContent = `${tm.radRate.toFixed(3)} mSv/h`;
    e.rad.style.color = tm.radRate > SUIT.radAlertMsvPerHour ? '#ff2255' : '';
    e.prog.textContent = `${tm.distKm.toFixed(2)} km`;
    const hh = Math.floor(tm.hours), mm = Math.floor((tm.hours - hh) * 60);
    e.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    e.live.classList.toggle('on', this.state.sim.running);
  }
}
