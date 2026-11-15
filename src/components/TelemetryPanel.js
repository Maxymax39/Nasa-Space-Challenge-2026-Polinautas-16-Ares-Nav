/**
 * TelemetryPanel — route metrics, live suit telemetry and the habitat
 * consumables budget (NASA-STD-3001 envelope).
 */
import { habitatConsumables, SUIT } from '../core/BioSafetyCalculators.js';
import { formatHour } from '../core/EnvironmentModel.js';
import { t, applyI18n, getLang, onLangChange } from '../core/i18n.js';

// colours come from the stylesheet so the palette is defined in one place
const LEVEL_COLOR = { nominal: 'var(--ok)', watch: 'var(--warn)', alert: 'var(--bad)' };
const BAND_COLOR = { nominal: 'var(--ok)', caution: 'var(--warn)', danger: 'var(--bad)' };
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
        <div class="vitals">
          <div class="vital" data-k="vO2">
            <div class="vital-head"><span class="vital-label" data-i18n="panel.o2short"></span></div>
            <div class="vital-value"><span><span data-k="o2">100.0</span><small>%</small></span><span class="vital-status" data-k="vO2s"></span></div>
            <div class="bar"><div data-k="o2Bar" style="width:100%"></div></div>
            <div class="vital-sub" data-k="o2Sub"></div>
          </div>
          <div class="vital" data-k="vPress">
            <div class="vital-head"><span class="vital-label" data-i18n="panel.pressShort"></span></div>
            <div class="vital-value"><span><span data-k="press">${SUIT.pressurePsid.toFixed(2)}</span><small>psid</small></span><span class="vital-status" data-k="vPresss"></span></div>
            <div class="vital-sub" data-k="pressSub"></div>
          </div>
          <div class="vital" data-k="vHr">
            <div class="vital-head"><span class="vital-label" data-i18n="panel.hr"></span></div>
            <div class="vital-value"><span><span data-k="hr">72</span><small>bpm</small></span><span class="vital-status" data-k="vHrs"></span></div>
            <div class="vital-sub" data-k="hrSub"></div>
          </div>
          <div class="vital" data-k="vTherm">
            <div class="vital-head"><span class="vital-label" data-i18n="panel.thermal"></span></div>
            <div class="vital-value"><span><span data-k="core">36.9</span><small>°C</small></span><span class="vital-status" data-k="vTherms"></span></div>
            <div class="vital-sub" data-i18n="panel.core"></div>
          </div>
        </div>
        <div class="psr" data-k="psrBox">
          <div class="psr-head"><span data-i18n="panel.psr"></span><b data-k="psrState"></b></div>
          <dl class="metrics">
            <div><dt data-i18n="panel.psrMargin"></dt><dd data-k="psrMargin">—</dd></div>
            <div><dt data-i18n="panel.psrNeed"></dt><dd data-k="psrNeed">—</dd></div>
            <div><dt data-i18n="panel.psrDist"></dt><dd data-k="psrDist">—</dd></div>
            <div><dt data-i18n="panel.o2flow"></dt><dd data-k="o2flow">—</dd></div>
          </dl>
        </div>
        <dl class="metrics">
          <div><dt>ppCO₂ (≤ ${SUIT.maxPpCo2MmHg})</dt><dd data-k="co2">— mmHg</dd></div>
          <div><dt><span data-i18n="panel.radRate"></span> (≤ ${SUIT.radAlertMsvPerHour})</dt><dd data-k="rad">— mSv/h</dd></div>
          <div><dt data-i18n="panel.progress"></dt><dd data-k="prog">0.00 km</dd></div>
          <div><dt data-i18n="panel.time"></dt><dd data-k="time">00:00</dd></div>
        </dl>
      </section>

      <section class="panel-block" data-k="roverBlock" hidden>
        <h2 class="panel-title"><span data-i18n="panel.rover"></span> <span class="unit-tag">RVR</span></h2>
        <div class="bar-line"><span data-i18n="panel.battery"></span><b class="num" data-k="rvBat">—</b></div>
        <div class="bar"><div data-k="rvBatBar"></div></div>
        <dl class="metrics">
          <div><dt data-i18n="panel.cargo"></dt><dd data-k="rvCargo">—</dd></div>
          <div><dt data-i18n="panel.tether"></dt><dd data-k="rvTether">—</dd></div>
          <div style="grid-column: span 2"><dt data-i18n="panel.comms"></dt><dd data-k="rvComms">—</dd></div>
        </dl>
      </section>

      <section class="panel-block">
        <h2 class="panel-title" data-i18n="env.panel"></h2>
        <div class="env-status">
          <span class="env-badge" data-k="envBadge">GO</span>
          <span class="hint" style="margin:0" data-k="envTime"></span>
        </div>
        <ul class="env-reasons" data-k="envReasons"></ul>
        <dl class="metrics">
          <div><dt data-i18n="env.airTemp"></dt><dd data-k="envAir">—</dd></div>
          <div><dt data-i18n="env.groundTemp"></dt><dd data-k="envGround">—</dd></div>
          <div><dt data-i18n="env.pressure"></dt><dd data-k="envPress">—</dd></div>
          <div><dt data-i18n="env.density"></dt><dd data-k="envDensity">—</dd></div>
          <div><dt data-i18n="env.dust"></dt><dd data-k="envDust">—</dd></div>
          <div><dt data-i18n="env.light"></dt><dd data-k="envLight">—</dd></div>
          <div><dt data-i18n="env.wind"></dt><dd data-k="envWind">—</dd></div>
          <div><dt data-i18n="env.q"></dt><dd data-k="envQ">—</dd></div>
          <div><dt data-i18n="env.rad"></dt><dd data-k="envRad">—</dd></div>
          <div><dt data-i18n="env.devils"></dt><dd data-k="envDevils">—</dd></div>
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

  /** Set a vitals card to nominal / watch / alert. */
  #vital(key, level) {
    const card = this.el[key];
    if (card.dataset.level === level && card.dataset.lang === getLang()) return;
    card.dataset.level = level;
    card.dataset.lang = getLang();
    card.classList.toggle('watch', level === 'watch');
    card.classList.toggle('alert', level === 'alert');
    this.el[`${key}s`].textContent = t(`vital.${level}`);
  }

  /** Refresh after the route or the language changes. */
  updateRoute() {
    const { route, routeError } = this.state;
    const e = this.el;
    if (!route) {
      e.score.textContent = '—';
      e.score.style.color = '';
      e.band.textContent = t(routeError ? 'panel.blocked' : 'panel.noRoute');
      e.band.style.color = routeError ? 'var(--bad)' : '';
      e.scoreBar.style.width = '0%';
      e.routeNote.textContent = routeError ? this.#msg(routeError) : t('panel.clickHint');
      for (const k of ['dist', 'slope', 'dur', 'o2dep', 'dose', 'water']) e[k].textContent = '—';
      return;
    }
    const s = route.summary;
    const emergency = route.kind === 'emergency';
    e.score.textContent = s.score.toFixed(0);
    e.score.style.color = BAND_COLOR[s.band.level];
    e.band.textContent = emergency ? t('panel.emergency') : t(`band.${s.band.level}`);
    e.band.style.color = emergency ? 'var(--bad)' : BAND_COLOR[s.band.level];
    e.scoreBar.style.width = `${s.score}%`;
    e.scoreBar.style.background = BAND_COLOR[s.band.level];
    e.routeNote.textContent = route.notes ? this.#msg(route.notes) : '';
    e.dist.textContent = `${route.distanceKm.toFixed(2)} km`;
    e.slope.textContent = `${route.maxSlopeDeg.toFixed(1)}°`;
    const hh = Math.floor(route.durationH), mm = Math.round((route.durationH - hh) * 60);
    e.dur.textContent = `${hh} h ${String(mm).padStart(2, '0')} min`;
    e.dur.style.color = s.exceedsEvaWindow ? 'var(--bad)' : '';
    e.o2dep.textContent = `${s.o2DepletionPct.toFixed(1)} %`;
    e.dose.textContent = `${route.radiationMsv.toFixed(3)} mSv`;
    e.water.textContent = `${s.hydrationL.toFixed(2)} L`;
  }

  /** Refresh the environmental conditions block (called a few times per second). */
  updateEnvironment() {
    const v = this.state.envNow, e = this.el;
    if (!v) return;
    const color = { go: 'var(--ok)', caution: 'var(--warn)', nogo: 'var(--bad)' }[v.status.level];
    e.envBadge.textContent = t(`env.${v.status.level}`);
    e.envBadge.style.color = color;
    e.envTime.textContent = `${t('env.localTime')} ${formatHour(v.hour)}`;
    const reasons = v.status.reasons.map((r) => `<li class="${r.level}">${t(r.key)}</li>`).join('') || `<li>${t('env.ok')}</li>`;
    if (reasons !== this.lastReasons) {
      this.lastReasons = reasons;
      e.envReasons.innerHTML = reasons;
    }
    e.envAir.textContent = `${v.airTempC.toFixed(0)} °C`;
    e.envGround.textContent = `${v.groundTempC.toFixed(0)} °C`;
    e.envPress.textContent = `${v.pressurePa.toFixed(0)} Pa`;
    e.envDensity.textContent = `${(v.airDensity * 1000).toFixed(1)} g/m³`;
    e.envDust.textContent = `τ ${v.tau.toFixed(1)} · ${v.visibilityKm >= 99 ? '>99' : v.visibilityKm.toFixed(0)} km`;
    e.envDust.style.color = v.tau >= 3 ? 'var(--bad)' : v.tau >= 1.5 ? 'var(--warn)' : '';
    e.envLight.textContent = `${Math.round(v.illuminationLux / 100) * 100} lux`;
    e.envWind.textContent = `${v.windSpeed.toFixed(0)} m/s · ${String(v.windDir).padStart(3, '0')}°`;
    e.envQ.innerHTML = `${v.dynamicPressurePa.toFixed(2)} Pa<small>${t('env.equiv', { v: v.earthEquivalentWindMs.toFixed(1) })}</small>`;
    e.envRad.textContent = `×${v.radFactor.toFixed(1)}`;
    e.envRad.style.color = v.radFactor >= 3 ? 'var(--bad)' : v.radFactor > 1 ? 'var(--warn)' : '';
    e.envDevils.textContent = t(`env.devils.${v.dustDevils}`);
  }

  /** Refresh live suit telemetry (called a few times per second). */
  updateLive() {
    const tm = this.state.telemetry, e = this.el;
    // Card thresholds. O2 and ppCO2 follow the suit limits; heart rate and
    // core temperature bands are the usual exercise-physiology ones.
    const o2Lvl = tm.o2Pct < 25 ? 'alert' : tm.o2Pct < 50 ? 'watch' : 'nominal';
    const pressLvl = Math.abs(tm.pressurePsid - SUIT.pressurePsid) > 0.3 ? 'alert'
      : Math.abs(tm.pressurePsid - SUIT.pressurePsid) > 0.15 ? 'watch' : 'nominal';
    const hrLvl = tm.hr >= 170 ? 'alert' : tm.hr >= 150 ? 'watch' : 'nominal';
    const thermLvl = tm.coreTempC >= 38.5 ? 'alert' : tm.coreTempC >= 38 ? 'watch' : 'nominal';
    this.#vital('vO2', o2Lvl);
    this.#vital('vPress', pressLvl);
    this.#vital('vHr', hrLvl);
    this.#vital('vTherm', thermLvl);

    e.o2.textContent = tm.o2Pct.toFixed(1);
    e.o2Bar.style.width = `${tm.o2Pct}%`;
    e.o2Bar.style.background = LEVEL_COLOR[o2Lvl];
    const route = this.state.route;
    e.o2Sub.textContent = route ? t('vital.leftAt', { v: route.summary.o2RemainingPct.toFixed(0) }) : '';
    e.press.textContent = tm.pressurePsid.toFixed(2);
    e.pressSub.textContent = t('vital.pressNom', { v: SUIT.pressurePsid.toFixed(1) });
    e.hr.textContent = tm.hr;
    e.hrSub.textContent = this.state.sim.running ? t('vital.hrWork', { v: Math.round(tm.metabolicW / 10) * 10 }) : t('vital.hrRest');
    e.core.textContent = tm.coreTempC.toFixed(1);

    // support rover block, only shown when a rover is on the traverse
    const rv = this.state.rover;
    e.roverBlock.hidden = !rv;
    if (rv) {
      const batColor = rv.batteryPct < 20 ? 'var(--bad)' : rv.batteryPct < 40 ? 'var(--warn)' : 'var(--ok)';
      e.rvBat.textContent = `${rv.batteryPct.toFixed(0)} %`;
      e.rvBatBar.style.width = `${rv.batteryPct}%`;
      e.rvBatBar.style.background = batColor;
      e.rvCargo.textContent = `${rv.cargoKg} / ${rv.cargoMaxKg} kg`;
      e.rvTether.textContent = `${rv.tetherM.toFixed(0)} m`;
      e.rvComms.textContent = t(`rover.link.${rv.comms}`);
      e.rvComms.style.color = rv.comms === 'ok' ? 'var(--ok)' : 'var(--bad)';
    }

    // point of safe return: how much O2 is left over after walking home and keeping the reserve
    const psr = this.state.rtb.psr;
    const psrLvl = !psr ? 'idle' : psr.critical ? 'limit' : psr.marginPct < 10 ? 'near' : 'ok';
    e.psrBox.className = `psr ${psrLvl}`;
    e.psrState.textContent = t(`psr.${psrLvl}`);
    e.psrMargin.textContent = psr ? `${psr.marginPct >= 0 ? '+' : ''}${psr.marginPct.toFixed(1)} %` : '—';
    e.psrNeed.textContent = psr ? `${psr.needPct.toFixed(1)} % + ${psr.reservePct} %` : '—';
    e.psrDist.textContent = psr ? `${psr.returnKm.toFixed(2)} km · ${Math.round(psr.returnHours * 60)} min` : '—';
    e.o2flow.textContent = `${(tm.o2Lpm ?? 0).toFixed(2)} L/min`;
    e.co2.textContent = `${tm.ppCo2.toFixed(1)} mmHg`;
    e.co2.style.color = tm.ppCo2 > SUIT.maxPpCo2MmHg ? 'var(--bad)' : tm.ppCo2 > 15 ? 'var(--warn)' : '';
    e.rad.textContent = `${tm.radRate.toFixed(3)} mSv/h`;
    e.rad.style.color = tm.radRate > SUIT.radAlertMsvPerHour ? 'var(--bad)' : '';
    e.prog.textContent = `${tm.distKm.toFixed(2)} km`;
    const hh = Math.floor(tm.hours), mm = Math.floor((tm.hours - hh) * 60);
    e.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    e.live.classList.toggle('on', this.state.sim.running);
  }
}
