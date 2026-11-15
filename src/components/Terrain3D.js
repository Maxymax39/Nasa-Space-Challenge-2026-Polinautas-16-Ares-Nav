/**
 * Terrain3D — perspective view of the traverse area for the suit HUD.
 *
 * The elevation grid becomes a mesh (1 unit = 1 km, x east, z south, y up) and
 * the 2D map, with whatever layers are switched on, is draped over it as a
 * texture. That way the imagery, slope/radiation overlays, minerals, contours
 * and the route always match the planning view; nothing is drawn twice.
 *
 * Relief at Jezero is about 100 m over 9 km, so heights are exaggerated or the
 * delta front would be invisible from walking distance.
 *
 * three.js is loaded from the CDN as a global. If it is missing (offline) the
 * app keeps using the tilted 2D map instead.
 */

const VERTICAL_EXAGGERATION = 2;
const MESH_DETAIL = 2; // mesh vertices per DEM cell, per axis
const FOV_HALF_ANGLE = (30 * Math.PI) / 180;
const FOV_RANGE_KM = 0.2;
const CAMERA_HOME = { yaw: 0, pitch: 24, dist: 0.45 };
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Terrain3D {
  static get supported() {
    if (!window.THREE) return false;
    try {
      return !!document.createElement('canvas').getContext('webgl');
    } catch {
      return false;
    }
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/TerrainModel.js').Terrain} terrain
   * @param {object} state shared app state
   * @param {import('./MapEngine.js').MapEngine} map source of the draped texture
   */
  constructor(canvas, terrain, state, map) {
    const THREE = window.THREE;
    this.canvas = canvas;
    this.terrain = terrain;
    this.state = state;
    this.map = map;
    this.cam = { ...CAMERA_HOME }; // where the camera is
    this.goal = { ...CAMERA_HOME }; // where it is easing to
    this.orbit = false; // continuous rotation around the astronaut
    this.labels = { astronaut: null, rover: null };

    const b = terrain.bounds;
    this.wKm = (b.east - b.west) * terrain.kmPerDegLon;
    this.hKm = (b.north - b.south) * terrain.kmPerDegLat;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.sky = new THREE.Color(0xc9a07a);
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(this.sky, 4, 40);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.005, 120);

    this.#buildTerrain(THREE);
    this.#buildLights(THREE);
    this.#buildMarkers(THREE);
    this.#bindCamera();
    this.resize();
  }

  /* ---------- coordinates ---------- */

  heightKm(lon, lat) {
    return ((this.terrain.elevAt(lon, lat) - this.terrain.minElev) / 1000) * VERTICAL_EXAGGERATION;
  }

  /** Scene position of a map coordinate, `lift` km above the ground. */
  world(lon, lat, lift = 0) {
    const t = this.terrain, b = t.bounds;
    return new window.THREE.Vector3(
      (lon - b.west) * t.kmPerDegLon - this.wKm / 2,
      this.heightKm(lon, lat) + lift,
      (b.north - lat) * t.kmPerDegLat - this.hKm / 2,
    );
  }

  /* ---------- scene ---------- */

  #buildTerrain(THREE) {
    const t = this.terrain, b = t.bounds;
    const geo = new THREE.PlaneGeometry(this.wKm, this.hKm, t.ncols * MESH_DETAIL, t.nrows * MESH_DETAIL);
    geo.rotateX(-Math.PI / 2); // plane's +y (top edge) becomes -z, i.e. north
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lon = b.west + (pos.getX(i) + this.wKm / 2) / t.kmPerDegLon;
      const lat = b.north - (pos.getZ(i) + this.hKm / 2) / t.kmPerDegLat;
      pos.setY(i, this.heightKm(lon, lat));
    }
    geo.computeVertexNormals();

    // Texture resolution: as much as the GPU takes, up to 4096 across.
    const texW = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width = texW;
    this.texCanvas.height = Math.round((texW * this.hKm) / this.wKm);
    this.texScale = texW / 2560; // map symbols are sized as on a 2560 px wide map
    this.texture = new THREE.CanvasTexture(this.texCanvas);
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.texture }));
    this.ground.castShadow = true;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  #buildLights(THREE) {
    this.ambient = new THREE.HemisphereLight(0xf2d6b8, 0x3b2c22, 0.6);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 0.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const reach = Math.max(this.wKm, this.hKm) * 0.6;
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 40 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.ambient, this.sun, this.sun.target);
  }

  #buildMarkers(THREE) {
    // astronaut: a plain white pawn, scaled with camera distance so it never vanishes
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.012, 12), white);
    body.position.y = 0.006;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 12, 8), white);
    head.position.y = 0.0145;

    // field of view: 60 degree wedge on the ground ahead
    const wedge = new THREE.CircleGeometry(FOV_RANGE_KM, 24, Math.PI / 2 - FOV_HALF_ANGLE, FOV_HALF_ANGLE * 2);
    wedge.rotateX(-Math.PI / 2);
    this.fov = new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({
      color: 0x6fb6d9, transparent: true, opacity: 0.2, depthTest: false, side: THREE.DoubleSide,
    }));
    this.fov.renderOrder = 2;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(wedge),
      new THREE.LineBasicMaterial({ color: 0x6fb6d9, transparent: true, opacity: 0.7, depthTest: false }),
    );
    edge.renderOrder = 3;

    // bio-radius: 50 m ring around the crew member
    const ring = new THREE.RingGeometry(0.048, 0.05, 64);
    ring.rotateX(-Math.PI / 2);
    this.bioRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color: 0x5fb878, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide,
    }));
    this.bioRing.renderOrder = 3;

    this.pawn = new THREE.Group();
    this.pawn.add(body, head);
    this.astronaut = new THREE.Group();
    this.astronaut.add(this.pawn, this.fov, edge, this.bioRing);
    this.scene.add(this.astronaut);

    // support rover: chassis, four wheels and a mast; amber so it reads as a vehicle, not crew
    const amber = new THREE.MeshLambertMaterial({ color: 0xe2a13a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.003, 0.011), amber);
    chassis.position.y = 0.004;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.007, 6), amber);
    mast.position.set(0, 0.009, -0.004);
    this.rover = new THREE.Group();
    this.rover.add(chassis, mast);
    for (const [x, z] of [[-0.0042, -0.004], [0.0042, -0.004], [-0.0042, 0.004], [0.0042, 0.004]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.0014, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.002, z);
      this.rover.add(wheel);
    }
    this.rover.visible = false;
    this.scene.add(this.rover);

    // tether between rover and crew, and the trail already walked
    const overlay = (color) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
    this.tether = new THREE.Line(new THREE.BufferGeometry(), overlay(0xe2a13a));
    this.trail = new THREE.Line(new THREE.BufferGeometry(), overlay(0xffffff));
    this.tether.renderOrder = this.trail.renderOrder = 4;
    this.tether.frustumCulled = this.trail.frustumCulled = false;
    this.scene.add(this.tether, this.trail);

    this.pins = new THREE.Group();
    this.scene.add(this.pins);
    this.pinMaterial = {
      waypoint: new THREE.MeshBasicMaterial({ color: 0x6fb6d9 }),
      habitat: new THREE.MeshBasicMaterial({ color: 0xe08a3c }),
    };
  }

  /** Upright pins for the habitat and each waypoint; rebuilt when the plan changes. */
  #rebuildPins() {
    const THREE = window.THREE;
    for (const child of [...this.pins.children]) {
      child.geometry.dispose();
      this.pins.remove(child);
    }
    const pin = (p, kind, heightKm) => {
      const base = this.world(p.lon, p.lat);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, heightKm, 6), this.pinMaterial[kind]);
      pole.position.copy(base).y += heightKm / 2;
      const top = new THREE.Mesh(new THREE.SphereGeometry(kind === 'habitat' ? 0.009 : 0.006, 12, 8), this.pinMaterial[kind]);
      top.position.copy(base).y += heightKm;
      this.pins.add(pole, top);
    };
    pin(this.terrain.habitat, 'habitat', 0.07);
    for (const w of this.state.waypoints) pin(w, 'waypoint', 0.05);
  }

  /* ---------- camera ---------- */

  #bindCamera() {
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.goal.yaw = this.cam.yaw = drag.yaw - (e.clientX - drag.x) * 0.3;
      this.goal.pitch = this.cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.2, 5, 88);
    });
    const end = () => { drag = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goal.dist = clamp(this.goal.dist * Math.exp(e.deltaY * 0.0012), 0.05, 9);
    }, { passive: false });
    cv.addEventListener('dblclick', () => this.command('home'));
  }

  /**
   * Camera pad commands. The camera eases toward `goal`, so button presses
   * and the continuous orbit both come out smooth.
   * @returns {boolean} whether continuous rotation is on afterwards
   */
  command(name) {
    const g = this.goal;
    if (name === 'left') g.yaw -= 20;
    else if (name === 'right') g.yaw += 20;
    else if (name === 'up') g.pitch = clamp(g.pitch + 10, 5, 88);
    else if (name === 'down') g.pitch = clamp(g.pitch - 10, 5, 88);
    else if (name === 'in') g.dist = clamp(g.dist * 0.7, 0.05, 9);
    else if (name === 'out') g.dist = clamp(g.dist / 0.7, 0.05, 9);
    else if (name === 'orbit') this.orbit = !this.orbit;
    else if (name === 'home') {
      this.orbit = false;
      // unwind to the nearest "behind the astronaut" rather than spinning back through every turn
      this.cam.yaw = ((this.cam.yaw + 180) % 360 + 360) % 360 - 180;
      this.goal = { ...CAMERA_HOME };
    }
    return this.orbit;
  }

  #easeCamera(now) {
    const dt = Math.min(0.1, (now - (this.lastFrame ?? now)) / 1000);
    this.lastFrame = now;
    if (this.orbit) this.goal.yaw += 14 * dt; // one full turn in about 26 s
    const k = Math.min(1, dt * 7);
    for (const key of ['yaw', 'pitch', 'dist']) this.cam[key] += (this.goal[key] - this.cam[key]) * k;
  }

  /** Canvas position (CSS px) of a scene point, for labels drawn by the HUD overlay. */
  #screenOf(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - p.y) / 2) * this.canvas.clientHeight };
  }

  #placeCamera(target, heading) {
    const { yaw, pitch, dist } = this.cam;
    const az = (heading + 180 + yaw) * DEG; // compass bearing from the astronaut to the camera
    const flat = dist * Math.cos(pitch * DEG);
    const c = this.camera;
    c.position.set(target.x + Math.sin(az) * flat, target.y + dist * Math.sin(pitch * DEG), target.z - Math.cos(az) * flat);

    // never let the camera sink into a hillside behind the astronaut
    const t = this.terrain, b = t.bounds;
    const lon = clamp(b.west + (c.position.x + this.wKm / 2) / t.kmPerDegLon, b.west, b.east);
    const lat = clamp(b.north - (c.position.z + this.hKm / 2) / t.kmPerDegLat, b.south, b.north);
    c.position.y = Math.max(c.position.y, this.heightKm(lon, lat) + 0.006);
    c.lookAt(target);
  }

  /* ---------- per-frame ---------- */

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Re-drape the map when something that shows on it has changed. */
  #refreshTexture(now) {
    const s = this.state;
    const sig = [
      this.map.tilesReady, JSON.stringify(s.layers), s.waypoints.length,
      s.route?.distanceKm ?? 0, s.route?.kind, s.route?.emergencyIndex, this.terrain.radFactor,
    ].join('|');
    if (sig === this.texSig || now - (this.texTime ?? -1e9) < 300) return;
    this.texSig = sig;
    this.texTime = now;
    this.map.renderFlat(this.texCanvas, this.texScale);
    this.texture.needsUpdate = true;
    this.#rebuildPins();
  }

  /** Sun direction, light level, sky colour and haze distance from the environment model. */
  #applyEnvironment(env) {
    if (!env) return;
    const hour = clamp(env.hour, 6.2, 17.8);
    const elevation = Math.max(6, 82 * Math.sin((Math.PI * (hour - 6)) / 12)) * DEG;
    const azimuth = (90 + (180 * (hour - 6)) / 12) * DEG; // rises east, sets west, passing south
    this.sun.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * 15,
      Math.sin(elevation) * 15,
      -Math.cos(azimuth) * Math.cos(elevation) * 15,
    );
    const clear = Math.exp(-0.25 * env.tau);
    this.sun.intensity = 0.15 + 0.85 * clear;
    this.ambient.intensity = 0.75 - 0.2 * clear;

    // butterscotch sky when clear, darker and browner as dust builds
    const k = clamp((env.tau - 0.3) / 5, 0, 1);
    this.sky.setRGB(0.79 - 0.3 * k, 0.63 - 0.27 * k, 0.48 - 0.24 * k);
    const far = clamp(env.visibilityKm * 0.9, 1.2, 45);
    this.scene.fog.near = far * 0.12;
    this.scene.fog.far = far;
  }

  draw(now) {
    const sim = this.state.sim;
    if (!sim.pos || !this.canvas.clientWidth) return;
    this.#refreshTexture(now);
    this.#applyEnvironment(this.state.envNow);

    const here = this.world(sim.pos.lon, sim.pos.lat, 0.002);
    this.astronaut.position.copy(here);
    this.astronaut.rotation.y = -sim.heading * DEG;
    const markerScale = clamp(this.cam.dist / 0.3, 0.6, 8);
    this.pawn.scale.setScalar(markerScale);
    const tm = this.state.telemetry;
    this.bioRing.material.color.setHex(
      tm.o2Pct < 25 || tm.hr >= 170 ? 0xe5534b : tm.o2Pct < 50 || tm.hr >= 150 ? 0xe2a13a : 0x5fb878,
    );

    // rover and tether
    const rv = this.state.rover;
    this.rover.visible = this.tether.visible = !!rv;
    let roverAt = null;
    if (rv) {
      roverAt = this.world(rv.pos.lon, rv.pos.lat, 0.001);
      this.rover.position.copy(roverAt);
      this.rover.rotation.y = -rv.heading * DEG;
      this.rover.scale.setScalar(markerScale);
      const lift = new window.THREE.Vector3(0, 0.006 * markerScale, 0);
      this.tether.geometry.setFromPoints([roverAt.clone().add(lift), here.clone().add(lift)]);
      this.tether.material.color.setHex(rv.comms === 'ok' ? 0xe2a13a : 0xe5534b);
    }

    // trail: rebuilt only when the astronaut reaches a new route point
    const route = this.state.route;
    const trailKey = route && sim.km > 0 ? `${route.distanceKm}|${sim.index}` : '';
    this.trail.visible = !!trailKey;
    if (trailKey && trailKey !== this.trailKey) {
      const walked = route.points.slice(0, sim.index + 1).map((p) => this.world(p.lon, p.lat, 0.004));
      this.trail.geometry.setFromPoints(walked);
    }
    this.trailKey = trailKey;

    this.#easeCamera(now);
    this.#placeCamera(here, sim.heading);
    this.renderer.render(this.scene, this.camera);

    // where the HUD overlay should pin the crew and rover badges
    const above = new window.THREE.Vector3(0, 0.02 * markerScale, 0);
    this.labels = {
      astronaut: this.#screenOf(here.clone().add(above)),
      rover: roverAt ? this.#screenOf(roverAt.clone().add(above)) : null,
    };
  }
}
