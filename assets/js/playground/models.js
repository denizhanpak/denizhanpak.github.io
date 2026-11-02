/* Virtual Agent Playground: the models.
 *
 * JavaScript ports of the simulations in Research/BehaviorClasses/ClaudeWork:
 *   - the Braitenberg vehicle of ApproachV3.jl (Type B, Hotton's forward neuron, the chapter's rotational lag);
 *   - Beer's one-legged walker of OscillatorV3.jl (the fold walker, a hybrid system with swing and stance);
 *   - the active categorization agents of ActiveCategorizationV3.jl and archive/nnode/nmodel.jl;
 * and of Research/QuanProject:
 *   - the single-mass swing of Swing_SMAnal.nb (a pendulum on a springy rope, pumped by one motor neuron).
 * No DOM here, so that node can run it against the Julia runs.
 */
(function (root) {
  'use strict';

  var TWO_PI = 2 * Math.PI;
  function sigma(x) { return 1 / (1 + Math.exp(-x)); }
  function logit(o) { return Math.log(o / (1 - o)); }
  /** Angle in [−π, π). */
  function wrapAngle(a) { return a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  // ── Braitenberg vehicle ─────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The chapter's vehicle matched to Fajen & Warren's (2003) fit (ApproachV3.jl `VEHICLE`): forward speed V (m/s),
   * rotational lag tau (s), stimulus-gradient decay cd (1/m), sensor separation delta (m) and deltaD = δ/d, and the
   * crossed synapses fl (left sensor → right motor) and fr (right sensor → left motor), 1 /s each.
   */
  var VEHICLE = { V: 1.0, tau: 1 / 3.25, cd: 0.40, delta: 1.0, deltaD: 7.5 / 3.25, fl: 1.0, fr: 1.0 };

  /**
   * Turning acceleration φ̈ of the crossed vehicle at heading error psi and distance r:
   * τ φ̈ = −φ̇ + (δ/d) G ((f_l − f_r)/(δ c_d) − f̄ sin ψ), G = e^{−c_d r}; with f_l = f_r = f this is the chapter's
   * τ φ̈ = −φ̇ − m e^{−c_d r} sin ψ, m = (δ/d) f (ApproachV3.jl `crossed_heading`, `chapter_vehicle`).
   */
  function vehicleTurn(p, psi, r, omega) {
    var G = Math.exp(-p.cd * r);
    return (-omega + p.deltaD * G * ((p.fl - p.fr) / (p.delta * p.cd) - 0.5 * (p.fl + p.fr) * Math.sin(psi))) / p.tau;
  }

  /** Heading error ψ = φ − (direction to the stimulus at (sx, sy)), in [−π, π). */
  function headingError(x, y, phi, sx, sy) { return wrapAngle(phi - Math.atan2(sy - y, sx - x)); }

  function vehicleField(p, u, sx, sy) {
    var r = Math.hypot(sx - u[0], sy - u[1]);
    return [p.V * Math.cos(u[2]), p.V * Math.sin(u[2]), u[3], vehicleTurn(p, headingError(u[0], u[1], u[2], sx, sy), r, u[3])];
  }

  /** One RK4 step of length dt of the vehicle state u = [x, y, φ, φ̇] with the stimulus at (sx, sy). */
  function vehicleStep(p, u, sx, sy, dt) {
    var k1 = vehicleField(p, u, sx, sy);
    var k2 = vehicleField(p, add(u, k1, dt / 2), sx, sy);
    var k3 = vehicleField(p, add(u, k2, dt / 2), sx, sy);
    var k4 = vehicleField(p, add(u, k3, dt), sx, sy);
    var out = new Array(4);
    for (var i = 0; i < 4; i++) out[i] = u[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  function add(u, k, h) {
    var out = new Array(u.length);
    for (var i = 0; i < u.length; i++) out[i] = u[i] + h * k[i];
    return out;
  }

  var REGION_LABELS = {
    approach: 'approach',
    overshoot: 'approach, with overshoot',
    away: 'avoid',
    turning: 'wander: it circles for ever',
    approach_or_turning: 'approach or wander, depending on the start',
    away_or_turning: 'avoid or wander, depending on the start',
    none: 'no steering: it drives straight on'
  };

  /**
   * Region of ApproachV3.jl's synapse chart at the vehicle's settings, for a goal held still `dist` metres away (the
   * chart's 2 m): the notebook's simulated `run_region`. The heading runs from rest at four headings (does it come to
   * rest, and where?) and from a fast spin (does it circle?); overshoot when the rest is a stable focus.
   */
  function vehicleRegion(p, dist) {
    if (Math.abs(p.fl) + Math.abs(p.fr) < 1e-9) return 'none';
    var G = Math.exp(-p.cd * (dist === undefined ? 2 : dist));
    var drive = p.deltaD * G * (p.fl - p.fr) / (p.delta * p.cd), gain = p.deltaD * G * (p.fl + p.fr) / 2;
    function accel(psi, w) { return (drive - gain * Math.sin(psi) - w) / p.tau; }
    function run(u, T) {
      var dt = Math.min(0.01, p.tau / 10), n = Math.round(T / dt), psi = u[0], w = u[1];
      for (var s = 0; s < n; s++) {
        var a1 = accel(psi, w), v1 = w;
        var a2 = accel(psi + dt / 2 * v1, w + dt / 2 * a1), v2 = w + dt / 2 * a1;
        var a3 = accel(psi + dt / 2 * v2, w + dt / 2 * a2), v3 = w + dt / 2 * a2;
        var a4 = accel(psi + dt * v3, w + dt * a3), v4 = w + dt * a3;
        psi += dt / 6 * (v1 + 2 * v2 + 2 * v3 + v4);
        w += dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
      }
      return [psi, w];
    }
    function restsAt(u0) {
      var u = run(u0, 200), v = run(u, 50);
      return Math.abs(v[0] - u[0]) > TWO_PI || Math.abs(v[1]) > 1e-4 ? null : v[0];
    }
    var starts = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4], rest = null;
    for (var i = 0; i < starts.length && rest === null; i++) rest = restsAt([starts[i], 0]);
    if (rest === null) return 'turning';
    var circles = restsAt([0, 60 * Math.sign(p.fl - p.fr)]) === null;
    if (Math.cos(rest) < 0) return circles ? 'away_or_turning' : 'away';
    if (circles) return 'approach_or_turning';
    // The rest's Jacobian is [0 1; −gain cos ψ*/τ  −1/τ]: complex eigenvalues (a focus) overshoot.
    return 1 / (p.tau * p.tau) - 4 * gain * Math.cos(rest) / p.tau < 0 ? 'overshoot' : 'approach';
  }

  // ── The one-legged walker ───────────────────────────────────────────────────────────────────────────────────────

  /** Leg, body and sensor of Beer (2010), §2 (OscillatorV3.jl `LEG`). */
  var LEG = { L: 15, alphaMax: 1 / 40, aMax: 1 / 20, phiMin: -Math.PI / 6, phiMax: Math.PI / 6, xMin: -20, sw: 30 / Math.PI };
  /** The fold walker: self-weight w, bias β = −w/2, time constant τ (OscillatorV3.jl `FOLD`), body gains × g. */
  var FOLD = { w: 10, beta: -5, tau: 0.1, g: 1 };
  var SWING = 1, STANCE = 2;

  /**
   * Beer's single-neuron walker (OscillatorV3.jl `rpg_walker`) as a hybrid system with modes SWING and STANCE.
   * State: neuron state y, leg angle φ (forward positive), angular velocity ω, stance distance d, body and foot
   * positions xb, xf. The foot is down while the neuron's output o = σ(y + β) is above ½.
   */
  function Walker(params) {
    this.p = Object.assign({}, FOLD, params || {});
    this.reset();
  }

  /** Just after a step at leg angle phi (OscillatorV3.jl `walker_state` with o = ½), or in swing if `swing`. */
  Walker.prototype.reset = function (phi, swing) {
    phi = phi === undefined ? 0.2 : phi;
    var d = LEG.L * Math.cos(phi);
    this.mode = swing ? SWING : STANCE;
    this.x = [-this.p.beta, phi, 0, d, 0, d * Math.tan(phi)];
    this.t = 0;
    this.held = null;
    this.events = [];
  };

  Walker.prototype.output = function (x) { return sigma((x || this.x)[0] + this.p.beta); };

  Walker.prototype.field = function (mode, x) {
    var p = this.p, y = x[0], phi = x[1], om = x[2], d = x[3];
    var o = sigma(y + p.beta);
    var dy = (-y + p.w * o + LEG.sw * phi) / p.tau;
    if (this.held !== null) return [dy, 0, 0, 0, 0, 0];
    if (mode === SWING) {
      var al = LEG.alphaMax * p.g * (1 - 2 * o);
      var stop = (phi >= LEG.phiMax && al > 0) || (phi <= LEG.phiMin && al < 0);
      return [dy, om, stop ? 0 : al, 0, 0, 0];
    }
    var a = phi >= LEG.phiMin && phi <= LEG.phiMax ? LEG.aMax * p.g * (1 - 2 * o) : 0;
    var c = Math.cos(phi);
    return [dy, om, a * c * c / d - 2 * om * om * Math.tan(phi), 0, -d * om / (c * c), 0];
  };

  Walker.prototype.rk4 = function (x, h) {
    var m = this.mode;
    var k1 = this.field(m, x), k2 = this.field(m, add(x, k1, h / 2)), k3 = this.field(m, add(x, k2, h / 2)), k4 = this.field(m, add(x, k3, h));
    var out = new Array(6);
    for (var i = 0; i < 6; i++) out[i] = x[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  };

  /**
   * The guards of the present mode as functions that are ≥ 0 while the transition has not fired: the step
   * (o rises through ½) and the swing stops at φmax and φmin in swing; the raise (o falls through ½) and the stance
   * stop (the foot x_min behind the joint) in stance.
   */
  Walker.prototype.guards = function () {
    var b = this.p.beta;
    if (this.mode === SWING) {
      return [['step', function (x) { return -(x[0] + b); }],
        ['front', function (x) { return LEG.phiMax - x[1]; }],
        ['back', function (x) { return x[1] - LEG.phiMin; }]];
    }
    return [['raise', function (x) { return x[0] + b; }],
      ['foot', function (x) { return (x[5] - x[4]) - LEG.xMin; }]];
  };

  /** The reset maps of OscillatorV3.jl `rpg_walker`. */
  Walker.prototype.fire = function (kind) {
    var x = this.x, b = this.p.beta, phi;
    if (kind === 'step') {
      phi = clamp(x[1], LEG.phiMin, LEG.phiMax);
      this.x = [-b, phi, 0, LEG.L * Math.cos(phi), x[4], x[4] + LEG.L * Math.sin(phi)];
      this.mode = STANCE;
    } else if (kind === 'raise') {
      phi = clamp(x[1], LEG.phiMin, LEG.phiMax);
      this.x = [-b, phi, phi === x[1] ? x[2] : 0, x[3], x[4], x[5]];
      this.mode = SWING;
    } else if (kind === 'front') {
      this.x = [x[0], LEG.phiMax, 0, x[3], x[4], x[5]];
    } else if (kind === 'back') {
      this.x = [x[0], LEG.phiMin, 0, x[3], x[4], x[5]];
    } else {
      this.x = [x[0], x[1], 0, x[3], x[4], x[5]];
    }
    this.events.push({ kind: kind, t: this.t, x: this.x.slice() });
  };

  /**
   * Advance by dt: an RK4 step, and if a guard fires within it, a step to the crossing (found by bisection), the
   * reset, and the rest of the step in the new mode (at most four transitions in one step).
   */
  Walker.prototype.step = function (dt) {
    var left = dt;
    for (var hops = 0; left > 1e-12; hops++) {
      if (this.held !== null) this.holdLeg();
      var next = this.rk4(this.x, left);
      var gs = hops < 4 ? this.guards() : [], first = null, frac = 1;
      for (var i = 0; i < gs.length; i++) {
        if (gs[i][1](next) >= 0) continue;
        var lo = 0, hi = 1, g0 = gs[i][1];
        if (g0(this.x) < 0) { lo = 0; hi = 0; }
        for (var k = 0; k < 40 && hi - lo > 1e-9; k++) {
          var mid = (lo + hi) / 2;
          if (g0(this.rk4(this.x, left * mid)) < 0) hi = mid; else lo = mid;
        }
        if (hi < frac) { frac = hi; first = gs[i][0]; }
      }
      if (first === null) { this.x = next; this.t += left; break; }
      this.x = this.rk4(this.x, left * frac);
      this.t += left * frac;
      left -= left * frac;
      this.fire(first);
    }
    if (this.held !== null) this.holdLeg();
  };

  /** Hold the leg at angle phi (a hand on the leg): it stays there, the neuron keeps running, the foot can still step. */
  Walker.prototype.hold = function (phi) { this.held = phi === null ? null : clamp(phi, LEG.phiMin, LEG.phiMax); };
  Walker.prototype.holdLeg = function () {
    var x = this.x;
    if (this.mode === STANCE) x[5] = x[4] + x[3] * Math.tan(this.held);
    x[1] = this.held;
    x[2] = 0;
  };

  /**
   * The neuron's steady-state curve with the leg held still at φ: φ = (σ⁻¹(o) − β − w o)/S_W, as points (φ, o) and
   * whether each is stable (w o(1 − o) < 1). For w > 4 it folds, and its middle branch is unstable.
   */
  function walkerFold(p, n) {
    var pts = [];
    n = n || 400;
    for (var i = 1; i < n; i++) {
      var o = i / n;
      pts.push({ phi: (logit(o) - p.beta - p.w * o) / LEG.sw, o: o, stable: p.w * o * (1 - o) < 1 });
    }
    return pts;
  }

  // ── The active categorization agent ─────────────────────────────────────────────────────────────────────────────

  /** Constants of Beer's visual agent (AgentModels.jl `VISUAL`). */
  var VISUAL = { body: 30, maxRay: 220, inputGain: 10, visualAngle: Math.PI / 6, rays: 7, velocityGain: 5, width: 400,
    fallSpeed: 3, size: 30, startHeight: 275 };
  /** Euler step and trial length (refit/model.jl): 8670 steps of 0.01, the object's centre ending at height 15. */
  var CAT_DT = 0.01, T_TRIAL = 86.7, CAT_STEPS = Math.round(T_TRIAL / CAT_DT), MASS = 1, TAU_RANGE = [0.1, 50];

  /** Angles of the rays from the vertical, left to right (Julia's `range(−a/2, a/2; length = 7)`). */
  var RAY_ANGLES = (function () {
    var h = VISUAL.visualAngle / 2, out = [];
    for (var j = 0; j < VISUAL.rays; j++) out.push(j === 0 ? -h : j === 6 ? h : h * (j - 3) / 3);
    return out;
  })();
  var RAYS = RAY_ANGLES.map(function (a) {
    var vertical = Math.abs(a) < 1e-7;
    return { angle: a, ox: VISUAL.body / 2 * Math.sin(a), sy: VISUAL.body / 2 * Math.cos(a), vertical: vertical,
      m: vertical ? Infinity : 1 / Math.tan(a) };
  });

  /**
   * Length of ray r from the agent's rim, the agent at x = ax, to the object (a horizontal line of length 30 or a
   * circle of diameter 30) centred at (0, oy), or 220 if it misses (refit/model.jl `ray_len`).
   */
  function rayLength(r, ax, line, oy) {
    var p = VISUAL, sx = ax + r.ox, sy = r.sy, m = r.m, b = sy - m * sx, R = p.size / 2;
    if (line) {
      var xi = r.vertical ? sx : (oy - b) / m;
      if (Math.abs(xi) > p.size / 2 || oy < 0) return p.maxRay;
      return Math.min(p.maxRay, Math.hypot(xi - sx, oy - sy));
    }
    if (r.vertical) {
      if (Math.abs(sx) > R) return p.maxRay;
      return Math.min(p.maxRay, Math.abs(oy - Math.sqrt(R * R - sx * sx) - sy));
    }
    var A = 1 + m * m, B = 2 * m * (b - oy), C = b * b - 2 * b * oy + oy * oy - R * R, disc = B * B - 4 * A * C;
    if (disc < 0) return p.maxRay;
    var x1 = (-B + Math.sqrt(disc)) / (2 * A), x2 = (-B - Math.sqrt(disc)) / (2 * A);
    return Math.min(p.maxRay, Math.min(Math.hypot(x1 - sx, m * x1 + b - sy), Math.hypot(x2 - sx, m * x2 + b - sy)));
  }

  function raysOutOfReach(oy) { return oy - VISUAL.size / 2 - VISUAL.body / 2 > VISUAL.maxRay + 1; }

  /** The seven ray lengths and sensory inputs 10 (220 − length)/220. */
  function rayReadings(ax, line, oy) {
    var len = new Array(7), inp = new Array(7), far = raysOutOfReach(oy);
    for (var j = 0; j < 7; j++) {
      len[j] = far ? VISUAL.maxRay : rayLength(RAYS[j], ax, line, oy);
      inp[j] = far ? 0 : VISUAL.inputGain * (VISUAL.maxRay - len[j]) / VISUAL.maxRay;
    }
    return { length: len, input: inp };
  }

  /**
   * The bilaterally symmetric circuit of N nodes of the free vector q (nmodel.jl `ncircuit`): M = N ÷ 2 mirror pairs
   * (Lᵢ, Rᵢ), L₁ and R₁ driving the body, and for odd N a midline node C.
   */
  function makeCircuit(q, N) {
    var M = N >> 1, hasC = N % 2 === 1, i, k, j, o;
    var c = { N: N, M: M, hasC: hasC, tau: [], theta: [], Ws: [], Wc: [], U: [], tauC: 1, thetaC: 0, WCC: 0, WiC: [], WCi: [], UC: [0, 0, 0, 0] };
    for (i = 0; i < M; i++) { c.tau.push(clamp(Math.exp(q[2 * i]), TAU_RANGE[0], TAU_RANGE[1])); c.theta.push(q[2 * i + 1]); }
    o = 2 * M;
    for (i = 0; i < M; i++) { c.Ws.push([]); for (k = 0; k < M; k++) c.Ws[i].push(q[o + i * M + k]); }
    o += M * M;
    for (i = 0; i < M; i++) { c.Wc.push([]); for (k = 0; k < M; k++) c.Wc[i].push(q[o + i * M + k]); }
    o += M * M;
    for (i = 0; i < M; i++) { c.U.push([]); for (j = 0; j < 7; j++) c.U[i].push(q[o + i * 7 + j]); }
    o += 7 * M;
    for (i = 0; i < M; i++) { c.WiC.push(0); c.WCi.push(0); }
    if (hasC) {
      c.tauC = clamp(Math.exp(q[o]), TAU_RANGE[0], TAU_RANGE[1]); c.thetaC = q[o + 1]; c.WCC = q[o + 2]; o += 3;
      for (i = 0; i < M; i++) c.WiC[i] = q[o + i];
      o += M;
      for (i = 0; i < M; i++) c.WCi[i] = q[o + i];
      o += M;
      for (j = 0; j < 4; j++) c.UC[j] = q[o + j];
    }
    return c;
  }

  /**
   * The circuit's weights in drawing order L₁ … L_M, (C), R_M … R₁: names, W[to][from] between nodes and
   * U[to][ray] from the rays (paper_figures/models.jl `brain7!`, for any N).
   */
  function circuitMatrices(c) {
    var side = [], i, names = [];
    for (i = 0; i < c.M; i++) side.push(['L', i]);
    if (c.hasC) side.push(['C', -1]);
    for (i = c.M - 1; i >= 0; i--) side.push(['R', i]);
    var sub = '₁₂₃₄₅₆₇₈';
    side.forEach(function (s) { names.push(s[0] === 'C' ? 'C' : s[0] + sub[s[1]]); });
    function weight(to, from) {
      var st = side[to][0], si = side[to][1], sf = side[from][0], sk = side[from][1];
      if (st === 'C' && sf === 'C') return c.WCC;
      if (st === 'C') return c.WCi[sk];
      if (sf === 'C') return c.WiC[si];
      return st === sf ? c.Ws[si][sk] : c.Wc[si][sk];
    }
    function rayWeight(to, j) {
      var s = side[to][0], i = side[to][1];
      return s === 'C' ? c.UC[Math.min(j, 6 - j)] : s === 'L' ? c.U[i][j] : c.U[i][6 - j];
    }
    var W = [], U = [];
    for (var t = 0; t < side.length; t++) {
      W.push([]); U.push([]);
      for (var f = 0; f < side.length; f++) W[t].push(weight(t, f));
      for (var j = 0; j < 7; j++) U[t].push(rayWeight(t, j));
    }
    return { names: names, side: side, W: W, U: U };
  }

  /**
   * One trial of the circuit `c` with the `shape` ('circle' or 'line') falling from 275, the agent starting at
   * Δx = d at rest with every node at y = 0 (nmodel.jl `final_dx`, step by step). Δx is the agent's position minus
   * the object's.
   */
  function CategorizationTrial(c, shape, d) {
    this.c = c;
    this.shape = shape;
    this.line = shape === 'line';
    this.d = d;
    this.ax = d;
    this.oy = VISUAL.startHeight;
    this.v = 0;
    this.k = 0;
    this.force = 0;
    this.decay = Math.exp(-CAT_DT / MASS);
    this.yL = []; this.yR = [];
    for (var i = 0; i < c.M; i++) { this.yL.push(0); this.yR.push(0); }
    this.yC = 0;
    this.outputs();
    this.readings = rayReadings(this.ax, this.line, this.oy);
  }

  CategorizationTrial.prototype.outputs = function () {
    var c = this.c;
    this.oL = this.yL.map(function (y, i) { return sigma(y + c.theta[i]); });
    this.oR = this.yR.map(function (y, i) { return sigma(y + c.theta[i]); });
    this.oC = sigma(this.yC + c.thetaC);
  };

  Object.defineProperty(CategorizationTrial.prototype, 'done', { get: function () { return this.k >= CAT_STEPS; } });

  /** One Euler step of nmodel.jl's `final_dx`: rays, nodes (inputs summed in mirror pairs), the fall, the body. */
  CategorizationTrial.prototype.step = function () {
    if (this.done) return false;
    var c = this.c, M = c.M, dt = CAT_DT, I = this.readings.input;
    var oL = this.oL, oR = this.oR, oC = this.oC, yL = this.yL, yR = this.yR;
    var yL2 = new Array(M), yR2 = new Array(M), i, k, j, a, u;
    for (i = 0; i < M; i++) {
      a = 0;
      for (k = 0; k < M; k++) a += c.Ws[i][k] * oL[k] + c.Wc[i][k] * oR[k];
      if (c.hasC) a += c.WiC[i] * oC;
      u = c.U[i];
      for (j = 0; j < 3; j++) a += u[j] * I[j] + u[6 - j] * I[6 - j];
      yL2[i] = yL[i] + dt * (a + u[3] * I[3] - yL[i]) / c.tau[i];
    }
    for (i = 0; i < M; i++) {
      a = 0;
      for (k = 0; k < M; k++) a += c.Wc[i][k] * oL[k] + c.Ws[i][k] * oR[k];
      if (c.hasC) a += c.WiC[i] * oC;
      u = c.U[i];
      for (j = 0; j < 3; j++) a += u[6 - j] * I[j] + u[j] * I[6 - j];
      yR2[i] = yR[i] + dt * (a + u[3] * I[3] - yR[i]) / c.tau[i];
    }
    if (c.hasC) {
      a = c.WCC * oC;
      for (k = 0; k < M; k++) a += c.WCi[k] * (oL[k] + oR[k]);
      for (j = 0; j < 3; j++) a += c.UC[j] * (I[j] + I[6 - j]);
      this.yC = this.yC + dt * (a + c.UC[3] * I[3] - this.yC) / c.tauC;
    }
    this.yL = yL2; this.yR = yR2;
    this.oy -= dt * VISUAL.fallSpeed;
    this.outputs();
    var F = VISUAL.velocityGain * (this.oR[0] - this.oL[0]);
    this.force = F;
    this.v = F + (this.v - F) * this.decay;
    this.ax += dt * this.v;
    if (Math.abs(this.ax) > VISUAL.width / 2) { this.ax = clamp(this.ax, -VISUAL.width / 2, VISUAL.width / 2); this.v = 0; }
    this.k++;
    this.readings = rayReadings(this.ax, this.line, this.oy);
    return true;
  };

  /** A whole trial at once: Δx every `every` steps (10: every 0.1, as V3's `run_circuit` records it). */
  function categorizationPath(c, shape, d, every) {
    every = every || 10;
    var t = new CategorizationTrial(c, shape, d), xs = [t.ax], hs = [t.oy];
    while (t.step()) if (t.k % every === 0) { xs.push(t.ax); hs.push(t.oy); }
    return { x: xs, h: hs };
  }

  /** A circle is caught, and a line avoided, when the trial ends with |Δx| < 30 and ≥ 30 respectively. */
  function trialRight(shape, dx) { return shape === 'circle' ? Math.abs(dx) < 30 : Math.abs(dx) >= 30; }

  // ── The single-mass swing ───────────────────────────────────────────────────────────────────────────────────────

  /**
   * Parameters of Swing_SMAnal.nb: the motor neuron's sensory amplitude A (the gain of its feedback), gravity g, the
   * swing's damping b, the neuron's sensitivity ρ and rate ϕ, and the rope's spring constant k and damping c.
   */
  var SWINGER = { A: 50, g: 9.81, b: 0.3, rho: 2, phi: 20, k: 100, c: 20 };
  /** The rope's length 1 + r must stay in (0.05, 6): outside, the mass has hit the pivot or flown off. */
  var ROPE_MIN = 0.05, ROPE_MAX = 6;

  /**
   * The swing of Swing_SMAnal.nb, state x = [θ, Ω, r, v, u]: swing angle θ (0 hanging down) and its rate Ω, the
   * mass's stretch r along the rope beyond its rest length 1 and its rate v, and the motor neuron's output u:
   * Ω̇ = −g sin θ/(1 + r) − b Ω, v̇ = u/(1 + r²) + g cos θ + (1 + r) Ω² − k r − c v, u̇ = ϕ (A tanh(ρ v) − u).
   */
  function swingField(p, x) {
    var th = x[0], om = x[1], r = x[2], v = x[3], u = x[4];
    return [om, -p.g * Math.sin(th) / (1 + r) - p.b * om, v,
      u / (1 + r * r) + p.g * Math.cos(th) + (1 + r) * om * om - p.k * r - p.c * v, p.phi * (p.A * Math.tanh(p.rho * v) - u)];
  }

  /** One RK4 step of length dt of the swing. */
  function swingStep(p, x, dt) {
    var k1 = swingField(p, x), k2 = swingField(p, add(x, k1, dt / 2)), k3 = swingField(p, add(x, k2, dt / 2)), k4 = swingField(p, add(x, k3, dt));
    var out = new Array(5);
    for (var i = 0; i < 5; i++) out[i] = x[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  function ropeIntact(x) { var len = 1 + x[2]; return len > ROPE_MIN && len < ROPE_MAX && isFinite(x[0] + x[1] + x[3] + x[4]); }

  /** The rest: hanging still, the rope stretched by its weight to r* = g/k, the neuron silent. */
  function swingRest(p) { return [0, 0, p.g / p.k, 0, 0]; }

  /** Period of the swing's small oscillations about the rest, 2π √((1 + r*)/g). */
  function swingPeriod(p) { return 2 * Math.PI * Math.sqrt((1 + p.g / p.k) / p.g); }

  /**
   * Where the rest loses its stability and the mass starts to bob along the rope (a Hopf bifurcation of the rope and
   * neuron, the swing hanging still). Linearized at the rest, with a = 1/(1 + r*²), the bob's characteristic polynomial is
   * λ³ + (c + ϕ) λ² + (cϕ + k − aϕρA) λ + kϕ, stable while (c + ϕ)(cϕ + k − aϕρA) > kϕ (Swing_SMAnal.nb `Eigensystem`).
   */
  function swingHopf(p) {
    var rs = p.g / p.k, a = 1 / (1 + rs * rs), cp = p.c + p.phi;
    return { A: (p.c * p.phi + p.k - p.k * p.phi / cp) / (a * p.phi * p.rho), period: 2 * Math.PI / Math.sqrt(p.k * p.phi / cp) };
  }

  /**
   * The mass on the swing, with the swing's state x and time t. `hold` puts a hand on the mass: it stays where it is
   * held, at rest, while the neuron keeps running. `off` is set once the rope's length leaves (0.05, 6).
   */
  function Swinger(params) {
    this.p = Object.assign({}, SWINGER, params || {});
    this.reset();
  }

  /** At rest but for a nudge of theta (0.1 rad, as the notebooks start). */
  Swinger.prototype.reset = function (theta) {
    this.x = swingRest(this.p);
    this.x[0] = theta === undefined ? 0.1 : theta;
    this.t = 0;
    this.held = null;
    this.off = false;
  };

  Swinger.prototype.step = function (dt) {
    if (this.off) return;
    if (this.held !== null) this.holdMass();
    this.x = swingStep(this.p, this.x, dt);
    if (this.held !== null) this.holdMass();
    this.t += dt;
    if (!ropeIntact(this.x)) this.off = true;
  };

  /** Hold the mass at swing angle theta and stretch r (null lets go). */
  Swinger.prototype.hold = function (theta, r) { this.held = theta === null ? null : [theta, r]; };
  Swinger.prototype.holdMass = function () {
    this.x[0] = this.held[0]; this.x[1] = 0; this.x[2] = this.held[1]; this.x[3] = 0;
  };

  /** The starts of the outcome scan: a nudge of 0.1 rad, a drop from 90° and a spin of 8 rad/s from the bottom. */
  var SWING_STARTS = [
    { name: 'nudge', x: function (p) { var x = swingRest(p); x[0] = 0.1; return x; } },
    { name: 'drop', x: function (p) { var x = swingRest(p); x[0] = Math.PI / 2; return x; } },
    { name: 'spin', x: function (p) { var x = swingRest(p); x[1] = 8; return x; } }
  ];

  /**
   * Where the swing ends up from x0: run `settle` seconds, then measure `measure` more. It loops if θ goes once
   * round in the measured time; otherwise it swings if its amplitude is over 2°, bobs if the stretch's half range is
   * over 2 mm, and rests if not; `off` if the rope's length left (0.05, 6). Amplitudes in degrees and metres.
   */
  function swingOutcome(p, x0, settle, measure, dt) {
    settle = settle === undefined ? 200 : settle;
    measure = measure === undefined ? 20 : measure;
    dt = dt || 0.01;
    var x = x0.slice(), n = Math.round(settle / dt), m = Math.round(measure / dt), i;
    for (i = 0; i < n; i++) { x = swingStep(p, x, dt); if (!ropeIntact(x)) return { kind: 'off', amp: NaN, bob: NaN }; }
    x[0] = wrapAngle(x[0]);
    var lo = x[0], hi = x[0], amp = 0, rlo = x[2], rhi = x[2];
    for (i = 0; i < m; i++) {
      x = swingStep(p, x, dt);
      if (!ropeIntact(x)) return { kind: 'off', amp: NaN, bob: NaN };
      lo = Math.min(lo, x[0]); hi = Math.max(hi, x[0]);
      amp = Math.max(amp, Math.abs(wrapAngle(x[0])));
      rlo = Math.min(rlo, x[2]); rhi = Math.max(rhi, x[2]);
    }
    var bob = (rhi - rlo) / 2, a = amp * 180 / Math.PI;
    var kind = hi - lo > TWO_PI ? 'loop' : a > 2 ? 'swing' : bob > 0.002 ? 'bob' : 'rest';
    return { kind: kind, amp: kind === 'loop' ? 180 : a, bob: bob };
  }

  var api = {
    sigma: sigma, logit: logit, wrapAngle: wrapAngle,
    VEHICLE: VEHICLE, vehicleStep: vehicleStep, vehicleTurn: vehicleTurn, headingError: headingError,
    vehicleRegion: vehicleRegion, REGION_LABELS: REGION_LABELS,
    LEG: LEG, FOLD: FOLD, SWING: SWING, STANCE: STANCE, Walker: Walker, walkerFold: walkerFold,
    VISUAL: VISUAL, CAT_DT: CAT_DT, CAT_STEPS: CAT_STEPS, RAYS: RAYS, rayReadings: rayReadings,
    makeCircuit: makeCircuit, circuitMatrices: circuitMatrices, CategorizationTrial: CategorizationTrial,
    categorizationPath: categorizationPath, trialRight: trialRight,
    SWINGER: SWINGER, Swinger: Swinger, swingField: swingField, swingStep: swingStep, swingRest: swingRest,
    swingPeriod: swingPeriod, swingHopf: swingHopf, SWING_STARTS: SWING_STARTS, swingOutcome: swingOutcome
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AgentModels = api;
})(typeof window !== 'undefined' ? window : this);
