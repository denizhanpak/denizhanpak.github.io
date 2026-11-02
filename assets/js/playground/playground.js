/* Virtual Agent Playground: the page (_pages/playground.html).
 *
 * Drawing and controls for the four tasks. The models are in models.js and the categorization agents in agents.js.
 * Each task owns its canvases (`Surface`), steps its model in `frame` and redraws when something changed; only the
 * task on show runs.
 */
(function () {
  'use strict';

  var M = window.AgentModels, AGENTS = window.PLAYGROUND_AGENTS || [];
  var root = document.getElementById('playground');
  if (!root || !M) return;

  /** The paper figures' colours (BehaviorTools.jl, CategorizationFigures). */
  var COLOR = {
    ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', paper: '#fbfaf7',
    body: '#f4f3ef', orange: '#eb6834', blue: '#2a78d6', left: '#c51b7d', right: '#4d9221', stimulus: '#f2c14e',
    neuron: '#6b4f3a', zone: '#e3f0e3', good: '#2e7d32', bad: '#c62828'
  };
  var FONT = window.getComputedStyle(root).fontFamily || 'sans-serif';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  /** A number with `d` decimals and a typographic minus. */
  function fmt(x, d) { var s = Math.abs(x).toFixed(d); return (x < 0 && +s !== 0 ? '−' : '') + s; }
  function deg(r) { return r * 180 / Math.PI; }
  function font(size, weight) { return (weight ? weight + ' ' : '') + size + 'px ' + FONT; }

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  /** The colour a fraction t of the way from a to b. */
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    t = clamp(t, 0, 1);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
  }
  function rgba(h, a) { var c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hash(a, b) { var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

  /** A canvas sized to its box at the device's pixel ratio; `onResize` runs whenever its size changes. */
  function Surface(canvas, onResize) {
    var self = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
    this.onResize = onResize;
    if (window.ResizeObserver) new window.ResizeObserver(function () { self.resize(); }).observe(canvas);
    else window.addEventListener('resize', function () { self.resize(); });
    this.resize();
  }
  Surface.prototype.resize = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h || (w === this.w && h === this.h && dpr === this.dpr)) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.onResize) this.onResize();
  };
  Surface.prototype.ready = function () { return this.w > 0 && this.h > 0; };
  /** Clear to `bg` and draw in CSS pixels. */
  Surface.prototype.begin = function (bg) {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = bg || COLOR.paper;
    ctx.fillRect(0, 0, this.w, this.h);
    return ctx;
  };
  /** The pointer of event `e` in the canvas's CSS pixels. */
  Surface.prototype.pointer = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left - this.canvas.clientLeft, e.clientY - r.top - this.canvas.clientTop];
  };

  function polyline(ctx, pts) {
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < pts.length; i++) {
      if (!pts[i]) { pen = false; continue; }
      if (pen) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
      pen = true;
    }
    ctx.stroke();
  }

  function disc(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  function arrowHead(ctx, x, y, angle, size, color) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45));
    ctx.lineTo(x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function text(ctx, s, x, y, opts) {
    opts = opts || {};
    ctx.font = font(opts.size || 11, opts.weight);
    ctx.fillStyle = opts.color || COLOR.ink2;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(s, x, y);
  }

  function bezier(p0, c1, c2, p1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var s = i / n, a = (1 - s) * (1 - s) * (1 - s), b = 3 * (1 - s) * (1 - s) * s, c = 3 * (1 - s) * s * s, d = s * s * s;
      out.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]]);
    }
    return out;
  }

  /**
   * A synapse from (x0, y0) to (x1, y1) between discs of radius r0 and r1, bowed to its left by `bow` × its length:
   * excitation (w > 0) dark with an arrowhead, inhibition grey with a bar (paper_figures/models.jl `draw_edge!`).
   */
  function synapse(ctx, x0, y0, x1, y1, r0, r1, w, width, bow, alpha) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    var mx = (x0 + x1) / 2 - bow * dy, my = (y0 + y1) / 2 + bow * dx;
    var a0 = Math.atan2(my - y0, mx - x0), a1 = Math.atan2(y1 - my, x1 - mx);
    var sx = x0 + r0 * Math.cos(a0), sy = y0 + r0 * Math.sin(a0);
    var ex = x1 - (r1 + 1) * Math.cos(a1), ey = y1 - (r1 + 1) * Math.sin(a1);
    var color = w > 0 ? COLOR.ink : COLOR.muted, head = 3 + width;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    var back = w > 0 ? head * 0.7 : 0;
    ctx.quadraticCurveTo(mx, my, ex - back * Math.cos(a1), ey - back * Math.sin(a1));
    ctx.stroke();
    if (w > 0) arrowHead(ctx, ex, ey, a1, head, color);
    else {
      ctx.lineWidth = Math.max(1.5, width);
      ctx.beginPath();
      ctx.moveTo(ex + 0.55 * head * Math.sin(a1), ey - 0.55 * head * Math.cos(a1));
      ctx.lineTo(ex - 0.55 * head * Math.sin(a1), ey + 0.55 * head * Math.cos(a1));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A self-loop on the disc at (x, y) of radius r, on the side at angle th (screen radians). */
  function selfLoop(ctx, x, y, r, th, w, width, alpha) {
    var reach = r * 0.9, spread = 0.5;
    var p0 = [x + r * Math.cos(th + spread), y + r * Math.sin(th + spread)];
    var c1 = [x + (r + reach * 1.6) * Math.cos(th + spread + 0.3), y + (r + reach * 1.6) * Math.sin(th + spread + 0.3)];
    var c2 = [x + (r + reach * 1.6) * Math.cos(th - spread - 0.3), y + (r + reach * 1.6) * Math.sin(th - spread - 0.3)];
    var p1 = [x + (r + 1) * Math.cos(th - spread), y + (r + 1) * Math.sin(th - spread)];
    var pts = bezier(p0, c1, c2, p1, 16), color = w > 0 ? COLOR.ink : COLOR.muted;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    polyline(ctx, pts.slice(0, w > 0 ? 14 : 17));
    var a = Math.atan2(pts[16][1] - pts[14][1], pts[16][0] - pts[14][0]), head = 3 + width;
    if (w > 0) arrowHead(ctx, p1[0], p1[1], a, head, color);
    else {
      ctx.lineWidth = Math.max(1.5, width);
      ctx.beginPath();
      ctx.moveTo(p1[0] + 0.55 * head * Math.sin(a), p1[1] - 0.55 * head * Math.cos(a));
      ctx.lineTo(p1[0] - 0.55 * head * Math.sin(a), p1[1] + 0.55 * head * Math.cos(a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A chart's frame: the plot box from (x0, y0) to (x1, y1) in CSS pixels, with a light border. */
  function frameBox(ctx, x0, y0, x1, y1) {
    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  }

  // ── Shared controls ─────────────────────────────────────────────────────────────────────────────────────────────

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    var v = parseFloat(el.value);
    return el.dataset.scale === 'log' ? Math.pow(10, v) : v;
  }
  function writeInput(panel, name, value) {
    var el = $('input[data-param="' + name + '"]', panel);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = el.dataset.scale === 'log' ? Math.log10(value) : value;
  }
  function setOutput(panel, name, s) { var o = $('[data-out="' + name + '"]', panel); if (o) o.textContent = s; }

  /** Wire a panel's buttons (`data-action`), sliders and boxes (`data-param`) and presets (`data-preset`) to its task. */
  function bindControls(panel, task) {
    $$('[data-action]', panel).forEach(function (el) {
      var action = el.dataset.action;
      if (el.tagName === 'SELECT') el.addEventListener('change', function () { task.action(action, parseFloat(el.value)); });
      else el.addEventListener('click', function () { task.action(action); });
    });
    $$('input[data-param]', panel).forEach(function (el) {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () { task.setParam(el.dataset.param, readInput(el)); });
    });
    $$('[data-preset]', panel).forEach(function (el) {
      el.addEventListener('click', function () { task.preset(JSON.parse(el.dataset.preset)); });
    });
  }

  /** Press the preset whose settings all match `params`, and release the others. */
  function syncPresets(panel, params) {
    $$('[data-preset]', panel).forEach(function (el) {
      var p = JSON.parse(el.dataset.preset), on = Object.keys(p).every(function (k) {
        return typeof p[k] === 'boolean' ? p[k] === params[k] : Math.abs(p[k] - params[k]) < 1e-3;
      });
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setToggle(panel, running) {
    var b = $('[data-action="toggle"]', panel);
    if (b) b.textContent = running ? 'Pause' : 'Play';
  }

  // ── Approach: the Braitenberg vehicle ───────────────────────────────────────────────────────────────────────────

  /** The heading errors of the paper's fan of paths (°), released 4 m from the stimulus (ApproachV3.jl `ERRORS`). */
  var FAN = [-25, -15, -5, 5, 15, 25];
  /** The regions' colours in the paper's charts (ApproachV3.jl `REGIONS`). */
  var REGION_FILL = { approach: '#a6d4a6', overshoot: '#fcf1d9', away: '#fcebf1', turning: '#c8c2f1',
    approach_or_turning: '#8f82dc', away_or_turning: '#8f82dc', none: '#e1e0d9' };
  var REGION_NOTE = {
    approach: 'The heading settles straight onto the goal without swinging past it.',
    overshoot: 'The heading swings past the goal\'s direction, then settles on it.',
    away: 'The heading settles pointing away from the goal: the vehicle flees it.',
    turning: 'The synapses differ so much that the vehicle\'s built-in turn beats the pull of the goal, and it never settles.',
    approach_or_turning: 'Both can happen: from rest it settles on the goal, but once spinning it keeps on circling.',
    away_or_turning: 'Both can happen: from rest it turns away from the goal, but once spinning it keeps on circling.',
    none: 'With no synapses the vehicle never turns.'
  };
  var MAX_VEHICLES = 16, SIM_DT = 0.005, TRAIL_DT = 0.04, CHART_SPAN = 20;

  function ApproachTask(panel) {
    var self = this;
    this.panel = panel;
    this.p = Object.assign({}, M.VEHICLE);
    this.stim = { x: 2.6, y: 0.3 };
    this.vehicles = [];
    this.t = 0;
    this.nextSample = 0;
    this.speed = 1;
    this.running = !REDUCED;
    this.dirty = true;
    this.viewWidth = 12;
    this.drag = null;
    this.world = new Surface($('#vehicle-world', panel), function () { self.dirty = true; });
    this.chart = new Surface($('#vehicle-chart', panel), function () { self.dirty = true; });
    this.regionEl = $('#vehicle-region', panel);
    this.swatchEl = $('#vehicle-swatch', panel);
    this.noteEl = $('#vehicle-region-note', panel);
    bindControls(panel, this);
    this.bindPointer();
    this.fan();
    this.refresh();
    setToggle(panel, this.running);
  }

  ApproachTask.prototype.scale = function () { return this.world.w / this.viewWidth; };
  ApproachTask.prototype.halfHeight = function () {
    return this.world.ready() ? this.world.h / 2 / this.scale() : this.viewWidth * 10 / 32;
  };
  ApproachTask.prototype.toScreen = function (x, y) { var s = this.scale(); return [this.world.w / 2 + x * s, this.world.h / 2 - y * s]; };
  ApproachTask.prototype.toWorld = function (px, py) { var s = this.scale(); return [(px - this.world.w / 2) / s, (this.world.h / 2 - py) / s]; };

  /** Six vehicles 4 m from the stimulus, aimed 5°, 15° and 25° to either side of it (the paths of figure 1A). */
  ApproachTask.prototype.fan = function () {
    var s = this.stim, side = s.x - 4 > -this.viewWidth / 2 + 0.6 ? -1 : 1, base = side < 0 ? 0 : Math.PI;
    for (var i = 0; i < FAN.length; i++) this.addVehicle(s.x + 4 * side, s.y, base + FAN[i] * Math.PI / 180);
  };

  ApproachTask.prototype.addVehicle = function (x, y, phi) {
    this.vehicles.push({ u: [x, y, phi, 0], trail: [[x, y]], hist: [] });
    if (this.vehicles.length > MAX_VEHICLES) this.vehicles.shift();
    this.dirty = true;
  };

  ApproachTask.prototype.action = function (name, value) {
    if (name === 'toggle') { this.running = !this.running; setToggle(this.panel, this.running); }
    else if (name === 'fan') { this.fan(); if (!this.running) { this.running = true; setToggle(this.panel, true); } }
    else if (name === 'clear') this.vehicles = [];
    else if (name === 'speed') this.speed = value;
    this.dirty = true;
  };

  ApproachTask.prototype.setParam = function (name, value) { this.p[name] = value; this.refresh(); };

  ApproachTask.prototype.preset = function (q) {
    var self = this;
    Object.keys(q).forEach(function (k) { self.p[k] = q[k]; writeInput(self.panel, k, q[k]); });
    this.refresh();
  };

  /** Show the parameters and the region of the synapse chart they fall in (computed a moment after the last change). */
  ApproachTask.prototype.refresh = function () {
    var self = this, p = this.p;
    setOutput(this.panel, 'fl', fmt(p.fl, 2));
    setOutput(this.panel, 'fr', fmt(p.fr, 2));
    setOutput(this.panel, 'tau', fmt(p.tau, 2));
    setOutput(this.panel, 'cd', fmt(p.cd, 2));
    syncPresets(this.panel, p);
    clearTimeout(this.regionTimer);
    this.regionTimer = setTimeout(function () {
      var r = M.vehicleRegion(self.p);
      self.regionEl.textContent = M.REGION_LABELS[r];
      self.swatchEl.style.background = REGION_FILL[r];
      self.noteEl.textContent = REGION_NOTE[r];
    }, 60);
    this.dirty = true;
  };

  ApproachTask.prototype.bindPointer = function () {
    var self = this, canvas = this.world.canvas;
    function nearStimulus(pt) { var c = self.toScreen(self.stim.x, self.stim.y); return Math.hypot(pt[0] - c[0], pt[1] - c[1]) < 22; }
    function clampToView(w) {
      var hw = self.viewWidth / 2 - 0.2, hh = self.halfHeight() - 0.2;
      return [clamp(w[0], -hw, hw), clamp(w[1], -hh, hh)];
    }
    canvas.addEventListener('pointerdown', function (e) {
      var pt = self.world.pointer(e);
      self.drag = nearStimulus(pt) ? { kind: 'stim' } : { kind: 'aim', from: self.toWorld(pt[0], pt[1]), to: self.toWorld(pt[0], pt[1]), px: pt };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = self.drag.kind === 'stim' ? 'grabbing' : 'crosshair';
      e.preventDefault();
      self.dirty = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      var pt = self.world.pointer(e);
      if (!self.drag) { canvas.style.cursor = nearStimulus(pt) ? 'grab' : 'crosshair'; return; }
      var w = clampToView(self.toWorld(pt[0], pt[1]));
      if (self.drag.kind === 'stim') { self.stim.x = w[0]; self.stim.y = w[1]; } else { self.drag.to = w; self.drag.now = pt; }
      self.dirty = true;
    });
    function end(e) {
      var d = self.drag;
      if (!d) return;
      self.drag = null;
      if (d.kind === 'aim' && e.type === 'pointerup') {
        var pt = self.world.pointer(e), aimed = Math.hypot(pt[0] - d.px[0], pt[1] - d.px[1]) > 10;
        var phi = aimed ? Math.atan2(d.to[1] - d.from[1], d.to[0] - d.from[0]) : 2 * Math.PI * Math.random();
        var from = clampToView(d.from);
        self.addVehicle(from[0], from[1], phi);
      }
      canvas.style.cursor = 'crosshair';
      self.dirty = true;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', function (e) {
      var step = 0.25, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }, m = moves[e.key];
      if (!m) return;
      var w = clampToView([self.stim.x + m[0], self.stim.y + m[1]]);
      self.stim.x = w[0]; self.stim.y = w[1];
      self.dirty = true;
      e.preventDefault();
    });
  };

  ApproachTask.prototype.show = function () { this.world.resize(); this.chart.resize(); this.dirty = true; };
  ApproachTask.prototype.hide = function () {};

  ApproachTask.prototype.frame = function (dt) {
    if (this.running && dt > 0) { this.advance(dt * this.speed); this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.drawWorld(); this.drawChart(); }
  };

  /** Run every vehicle for T seconds; a vehicle that leaves the view comes back in on the other side. */
  ApproachTask.prototype.advance = function (T) {
    var n = Math.max(1, Math.ceil(T / SIM_DT)), dt = T / n, p = this.p, s = this.stim;
    var hw = this.viewWidth / 2 + 0.4, hh = this.halfHeight() + 0.4;
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < this.vehicles.length; k++) {
        var v = this.vehicles[k], u = M.vehicleStep(p, v.u, s.x, s.y, dt), wrapped = false;
        if (u[0] > hw) { u[0] -= 2 * hw; wrapped = true; } else if (u[0] < -hw) { u[0] += 2 * hw; wrapped = true; }
        if (u[1] > hh) { u[1] -= 2 * hh; wrapped = true; } else if (u[1] < -hh) { u[1] += 2 * hh; wrapped = true; }
        v.u = u;
        if (wrapped) { v.trail.push(null); v.hist.push(null); }
      }
      this.t += dt;
      if (this.t >= this.nextSample) { this.sample(); this.nextSample = this.t + TRAIL_DT; }
    }
  };

  ApproachTask.prototype.sample = function () {
    var s = this.stim, t = this.t;
    for (var k = 0; k < this.vehicles.length; k++) {
      var v = this.vehicles[k], u = v.u;
      v.trail.push([u[0], u[1]]);
      if (v.trail.length > 900) v.trail.shift();
      v.hist.push([t, Math.hypot(s.x - u[0], s.y - u[1]), M.headingError(u[0], u[1], u[2], s.x, s.y)]);
      while (v.hist.length && (!v.hist[0] || v.hist[0][0] < t - CHART_SPAN)) v.hist.shift();
    }
  };

  ApproachTask.prototype.drawWorld = function () {
    var S = this.world;
    if (!S.ready()) return;
    var ctx = S.begin(COLOR.paper), s = this.scale(), self = this, p = this.p;
    var hw = this.viewWidth / 2, hh = this.halfHeight(), i, k;
    ctx.strokeStyle = 'rgba(195,194,183,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = Math.ceil(-hw); i <= hw; i++) { var x = Math.round(this.toScreen(i, 0)[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, S.h); }
    for (i = Math.ceil(-hh); i <= hh; i++) { var y = Math.round(this.toScreen(0, i)[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(S.w, y); }
    ctx.stroke();

    // The stimulus's field, S ∝ e^{−c_d r}, brightest at the source.
    var c = this.toScreen(this.stim.x, this.stim.y), R = 8, g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * s);
    for (i = 0; i <= 12; i++) g.addColorStop(i / 12, rgba(COLOR.stimulus, (0.6 * Math.exp(-p.cd * R * i / 12)).toFixed(3)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S.w, S.h);

    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    for (k = 0; k < this.vehicles.length; k++) {
      var v = this.vehicles[k];
      ctx.strokeStyle = rgba(COLOR.orange, k === this.vehicles.length - 1 ? 0.75 : 0.45);
      polyline(ctx, v.trail.concat([[v.u[0], v.u[1]]]).map(function (q) { return q && self.toScreen(q[0], q[1]); }));
    }
    for (k = 0; k < this.vehicles.length; k++) this.drawVehicle(ctx, this.vehicles[k]);

    // The stimulus, and a ring while it is dragged.
    ctx.beginPath();
    for (i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.2 : 10;
      ctx[i ? 'lineTo' : 'moveTo'](c[0] + r * Math.cos(a), c[1] + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = COLOR.ink;
    ctx.fill();
    if (this.drag && this.drag.kind === 'stim') disc(ctx, c[0], c[1], 16, null, COLOR.ink2, 1);

    // Aiming a new vehicle.
    var d = this.drag;
    if (d && d.kind === 'aim') {
      var a0 = this.toScreen(d.from[0], d.from[1]), a1 = this.toScreen(d.to[0], d.to[1]);
      disc(ctx, a0[0], a0[1], 4, COLOR.orange);
      if (Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) > 10) {
        ctx.strokeStyle = COLOR.orange; ctx.lineWidth = 2;
        polyline(ctx, [a0, a1]);
        arrowHead(ctx, a1[0], a1[1], Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), 9, COLOR.orange);
      }
    }

    // A one-metre scale bar.
    var bx = 12, by = S.h - 12;
    ctx.strokeStyle = COLOR.ink2; ctx.lineWidth = 1;
    polyline(ctx, [[bx, by - 4], [bx, by], [bx + s, by], [bx + s, by - 4]]);
    text(ctx, '1 m', bx + s / 2, by - 6, { align: 'center', size: 10 });
    if (!this.vehicles.length) text(ctx, 'Click to release a vehicle', S.w / 2, 22, { align: 'center', size: 12, color: COLOR.muted });
  };

  /**
   * The vehicle, a little larger than to scale, as in the paper's figure: chassis, wheels at the back, two sensors at
   * the front corners filled by their readings, the crossed synapses, and the motors filled by their outputs.
   */
  ApproachTask.prototype.drawVehicle = function (ctx, v) {
    var p = this.p, u = 0.26 * this.scale(), pos = this.toScreen(v.u[0], v.u[1]), st = this.stim;
    var r = Math.hypot(st.x - v.u[0], st.y - v.u[1]), psi = M.headingError(v.u[0], v.u[1], v.u[2], st.x, st.y);
    var G = Math.exp(-p.cd * r), S = G / p.cd, sl = S - p.delta / 2 * G * Math.sin(psi), sr = S + p.delta / 2 * G * Math.sin(psi);
    var mr = p.fl * sl, ml = p.fr * sr;
    ctx.save();
    ctx.translate(pos[0], pos[1]);
    ctx.rotate(-v.u[2]);   // +x forward, +y the vehicle's right
    ctx.fillStyle = COLOR.ink2;
    ctx.fillRect(-1.4 * u, 1.08 * u, 0.9 * u, 0.32 * u);
    ctx.fillRect(-1.4 * u, -1.4 * u, 0.9 * u, 0.32 * u);
    ctx.fillStyle = COLOR.body;
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 1.1;
    ctx.fillRect(-1.45 * u, -1.05 * u, 2.65 * u, 2.1 * u);
    ctx.strokeRect(-1.45 * u, -1.05 * u, 2.65 * u, 2.1 * u);
    var sL = [1.2 * u, -0.72 * u], sR = [1.2 * u, 0.72 * u], mL = [-0.95 * u, -0.75 * u], mR = [-0.95 * u, 0.75 * u], rn = 0.3 * u;
    function wire(a, b, f) {
      if (Math.abs(f) < 1e-9) return;
      ctx.strokeStyle = f > 0 ? COLOR.ink : COLOR.muted;
      ctx.lineWidth = 0.5 + 0.6 * Math.abs(f);
      ctx.setLineDash(f > 0 ? [] : [2, 2]);
      polyline(ctx, [a, b]);
      ctx.setLineDash([]);
    }
    wire(sL, mR, p.fl);
    wire(sR, mL, p.fr);
    disc(ctx, sL[0], sL[1], rn, mix('#ffffff', COLOR.stimulus, sl * p.cd), COLOR.ink2, 1);
    disc(ctx, sR[0], sR[1], rn, mix('#ffffff', COLOR.stimulus, sr * p.cd), COLOR.ink2, 1);
    disc(ctx, mL[0], mL[1], rn, ml >= 0 ? mix('#ffffff', COLOR.orange, ml * p.cd) : mix('#ffffff', COLOR.muted, -ml * p.cd), COLOR.orange, 1);
    disc(ctx, mR[0], mR[1], rn, mr >= 0 ? mix('#ffffff', COLOR.orange, mr * p.cd) : mix('#ffffff', COLOR.muted, -mr * p.cd), COLOR.orange, 1);
    ctx.restore();
  };

  /** Each vehicle's distance to the stimulus and heading error over the last 20 s. */
  ApproachTask.prototype.drawChart = function () {
    var S = this.chart;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, Rm = 8, T = 16, B = 20, gap = 22, self = this;
    var plotH = (S.h - T - B - gap) / 2, x0 = L, x1 = S.w - Rm, t1 = this.t, t0 = t1 - CHART_SPAN;
    var rmax = 4;
    this.vehicles.forEach(function (v) { v.hist.forEach(function (h) { if (h) rmax = Math.max(rmax, h[1]); }); });
    rmax = Math.min(12, Math.ceil(rmax));
    var panels = [
      { y0: T, title: 'distance to the stimulus (m)', lo: 0, hi: rmax, ticks: [0, Math.round(rmax / 2), rmax], value: 1 },
      { y0: T + plotH + gap, title: 'heading error ψ (°)', lo: -180, hi: 180, ticks: [-180, 0, 180], value: 2, toDeg: true }
    ];
    panels.forEach(function (pn) {
      var y0 = pn.y0, y1 = y0 + plotH;
      function Y(v) { return y1 - (v - pn.lo) / (pn.hi - pn.lo) * (y1 - y0); }
      text(ctx, pn.title, x0, y0 - 4, { size: 10, color: COLOR.ink2 });
      ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
      pn.ticks.forEach(function (tk) {
        var y = Math.round(Y(tk)) + 0.5;
        polyline(ctx, [[x0, y], [x1, y]]);
        text(ctx, fmt(tk, 0), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
      });
      frameBox(ctx, x0, y0, x1, y1);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.lineWidth = 1.3;
      self.vehicles.forEach(function (v, k) {
        ctx.strokeStyle = rgba(COLOR.orange, k === self.vehicles.length - 1 ? 0.9 : 0.5);
        var pts = [], prev = null;
        v.hist.forEach(function (h) {
          if (!h) { pts.push(null); prev = null; return; }
          var val = pn.toDeg ? deg(h[pn.value]) : h[pn.value];
          if (prev !== null && pn.toDeg && Math.abs(val - prev) > 180) pts.push(null);
          pts.push([x0 + (h[0] - t0) / CHART_SPAN * (x1 - x0), Y(val)]);
          prev = val;
        });
        polyline(ctx, pts);
      });
      ctx.restore();
    });
    text(ctx, 'last 20 s', x1, S.h - 5, { size: 9, align: 'right', color: COLOR.muted });
  };

  // ── Walk: the one-legged walker ─────────────────────────────────────────────────────────────────────────────────

  var WALK_DT = 0.002, WALK_SAMPLE = 0.1, WALK_SPAN = 100, JOINT = [7, 0];

  function WalkTask(panel) {
    var self = this;
    this.panel = panel;
    this.p = Object.assign({ centred: true }, M.FOLD);
    this.walker = new M.Walker(this.p);
    this.speed = 12;
    this.running = !REDUCED;
    this.dirty = true;
    this.grab = false;
    this.world = new Surface($('#walker-world', panel), function () { self.dirty = true; });
    this.trace = new Surface($('#walker-trace', panel), function () { self.dirty = true; });
    this.phase = new Surface($('#walker-phase', panel), function () { self.dirty = true; });
    this.statEls = {};
    $$('[data-stat]', panel).forEach(function (el) { self.statEls[el.dataset.stat] = el; });
    this.alertEl = $('#walker-alert', panel);
    bindControls(panel, this);
    this.bindPointer();
    this.refresh();
    this.restart();
    setToggle(panel, this.running);
  }

  WalkTask.prototype.restart = function () {
    this.walker.reset(0.2);
    this.hist = [];
    this.nextSample = 0;
    this.footprints = [];
    this.lastStep = null;
    this.stats = null;
    this.lo = Infinity; this.hi = -Infinity;
    this.dirty = true;
    this.showStats();
  };

  WalkTask.prototype.action = function (name, value) {
    if (name === 'toggle') { this.running = !this.running; setToggle(this.panel, this.running); }
    else if (name === 'reset') this.restart();
    else if (name === 'speed') this.speed = value;
    else if (name === 'kick' && this.walker.held === null) {
      this.walker.x[2] += (Math.random() < 0.5 ? -1 : 1) * 0.05;
      if (!this.running) { this.running = true; setToggle(this.panel, true); }
    }
    this.dirty = true;
  };

  WalkTask.prototype.setParam = function (name, value) {
    var p = this.p;
    p[name] = value;
    if (name === 'w' && p.centred) p.beta = -p.w / 2;
    if (name === 'centred' && value) p.beta = -p.w / 2;
    if (name === 'beta' && Math.abs(p.beta + p.w / 2) > 1e-9) p.centred = false;
    this.refresh();
  };

  WalkTask.prototype.preset = function (q) {
    Object.assign(this.p, q);
    this.refresh();
    this.restart();
  };

  WalkTask.prototype.refresh = function () {
    var p = this.p, panel = this.panel;
    ['w', 'beta', 'tau', 'g', 'centred'].forEach(function (k) { writeInput(panel, k, p[k]); });
    setOutput(panel, 'w', fmt(p.w, 1));
    setOutput(panel, 'beta', fmt(p.beta, 1));
    setOutput(panel, 'tau', fmt(p.tau, 2));
    setOutput(panel, 'g', fmt(p.g, 2) + '×');
    Object.assign(this.walker.p, { w: p.w, beta: p.beta, tau: p.tau, g: p.g });
    this.fold = M.walkerFold(p, 600);
    syncPresets(panel, p);
    this.dirty = true;
  };

  /** Body coordinates (x right, y forward) of the walker canvas: x from −20 to 30, y down from 35. */
  WalkTask.prototype.scale = function () { return this.world.w / 50; };
  WalkTask.prototype.toScreen = function (x, y) { var s = this.scale(); return [(x + 20) * s, (35 - y) * s]; };
  WalkTask.prototype.toBody = function (px, py) { var s = this.scale(); return [px / s - 20, 35 - py / s]; };

  WalkTask.prototype.bindPointer = function () {
    var self = this, canvas = this.world.canvas;
    function legAngle(pt) {
      var b = self.toBody(pt[0], pt[1]), dx = b[0] - JOINT[0], dy = b[1] - JOINT[1], r = Math.hypot(dx, dy);
      return r > 3 && r < 27 && dx > -2 ? Math.atan2(dy, Math.max(dx, 0.5)) : null;
    }
    canvas.addEventListener('pointerdown', function (e) {
      var a = legAngle(self.world.pointer(e));
      if (a === null) return;
      self.grab = true;
      self.walker.hold(a);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      self.dirty = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      var pt = self.world.pointer(e);
      if (!self.grab) { canvas.style.cursor = legAngle(pt) === null ? 'default' : 'grab'; return; }
      var b = self.toBody(pt[0], pt[1]);
      self.walker.hold(Math.atan2(b[1] - JOINT[1], Math.max(b[0] - JOINT[0], 0.5)));
      self.dirty = true;
    });
    function release() {
      if (!self.grab) return;
      self.grab = false;
      self.walker.hold(null);
      self.lo = Infinity; self.hi = -Infinity; self.lastStep = null;
      canvas.style.cursor = 'grab';
      self.dirty = true;
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  };

  WalkTask.prototype.show = function () { this.world.resize(); this.trace.resize(); this.phase.resize(); this.dirty = true; };
  WalkTask.prototype.hide = function () {};

  WalkTask.prototype.frame = function (dt) {
    // Held, the neuron keeps running even when paused, so that the foot still answers the hand.
    if ((this.running || this.grab) && dt > 0) {
      var T = dt * this.speed, n = Math.max(1, Math.ceil(T / WALK_DT)), w = this.walker;
      for (var i = 0; i < n; i++) {
        w.step(T / n);
        if (w.events.length) this.events();
        this.lo = Math.min(this.lo, w.x[1]); this.hi = Math.max(this.hi, w.x[1]);
        if (w.t >= this.nextSample) {
          this.hist.push({ t: w.t, phi: w.x[1], o: w.output(), stance: w.mode === M.STANCE });
          while (this.hist.length && this.hist[0].t < w.t - WALK_SPAN) this.hist.shift();
          this.nextSample = w.t + WALK_SAMPLE;
        }
      }
      this.showStats();
      this.dirty = true;
    }
    if (this.dirty) { this.dirty = false; this.drawWorld(); this.drawTrace(); this.drawPhase(); }
  };

  /** Footprints at each step, and the period, amplitude, mean angle and stride of the cycle that each step ends. */
  WalkTask.prototype.events = function () {
    var w = this.walker;
    for (var i = 0; i < w.events.length; i++) {
      var e = w.events[i];
      if (e.kind !== 'step') continue;
      this.footprints.push({ lat: JOINT[0] + e.x[3], fwd: e.x[5] });
      if (this.footprints.length > 14) this.footprints.shift();
      if (this.lastStep && !this.grab) {
        this.stats = { period: e.t - this.lastStep.t, amp: (this.hi - this.lo) / 2, centre: (this.hi + this.lo) / 2,
          stride: e.x[4] - this.lastStep.xb, at: e.t };
      }
      this.lastStep = { t: e.t, xb: e.x[4] };
      this.lo = this.hi = e.x[1];
    }
    w.events.length = 0;
  };

  WalkTask.prototype.showStats = function () {
    var s = this.stats, el = this.statEls, w = this.walker, stalled = false;
    if (s && w.t - s.at > Math.max(3 * s.period, 120)) s = this.stats = null;
    if (!s && this.lastStep && w.t - this.lastStep.t > 150) stalled = true;
    if (s && s.amp < 0.004 && Math.abs(s.stride) < 0.05) stalled = true;
    el.period.textContent = s && !stalled ? fmt(s.period, 1) : '–';
    el.amp.textContent = s && !stalled ? fmt(deg(s.amp), 1) + '°' : '–';
    el.centre.textContent = s && !stalled ? fmt(deg(s.centre), 1) + '°' : '–';
    el.stride.textContent = s && !stalled ? fmt(s.stride, 1) : '–';
    var msg = '';
    if (this.grab) msg = 'You are holding the leg. The neuron still reads its angle: push it forward past the fold\'s front edge and the foot goes down.';
    else if (stalled) msg = 'Stalled. Without a fold, a fast neuron cannot hold its decision: the leg hovers where the output crosses ½ and the walker stops.';
    if (this.alertEl.textContent !== msg) this.alertEl.textContent = msg;
    this.alertEl.hidden = !msg;
  };

  WalkTask.prototype.drawWorld = function () {
    var S = this.world;
    if (!S.ready()) return;
    var ctx = S.begin(COLOR.paper), s = this.scale(), self = this, w = this.walker, x = w.x, L = M.LEG.L;
    var xb = x[4], i, j;
    function P(bx, by) { return self.toScreen(bx, by); }
    function path(pts, close) {
      ctx.beginPath();
      pts.forEach(function (q, k) { var p = P(q[0], q[1]); ctx[k ? 'lineTo' : 'moveTo'](p[0], p[1]); });
      if (close) ctx.closePath();
    }

    // The ground, fixed in the world, slides back as the body walks forward.
    ctx.fillStyle = '#d9d6cb';
    for (var cf = Math.floor((xb - 30) / 6); cf <= Math.ceil((xb + 40) / 6); cf++) {
      for (j = 0; j < 9; j++) {
        var gx = -20 + j * 6 + 6 * hash(cf, j), gy = cf * 6 + 6 * hash(j + 17, cf) - xb, gp = P(gx, gy);
        ctx.fillRect(gp[0], gp[1], 1.6, 1.6);
      }
    }
    // Footprints where the foot was put down.
    for (i = 0; i < this.footprints.length; i++) {
      var f = this.footprints[i], fp = P(f.lat, f.fwd - xb);
      ctx.globalAlpha = 0.12 + 0.5 * (i + 1) / this.footprints.length;
      ctx.beginPath();
      ctx.ellipse(fp[0], fp[1], 0.8 * s, 1.1 * s, 0, 0, 2 * Math.PI);
      ctx.fillStyle = COLOR.ink2;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The joint's limits, ±30°.
    var wedge = [JOINT];
    for (i = 0; i <= 20; i++) { var a = -Math.PI / 6 + i * Math.PI / 60; wedge.push([JOINT[0] + (L + 1.5) * Math.cos(a), JOINT[1] + (L + 1.5) * Math.sin(a)]); }
    path(wedge, true);
    ctx.fillStyle = 'rgba(137,135,129,0.08)';
    ctx.fill();

    // The cockroach: antennae and cerci, head and eyes, a flat oval body and the pronotum (paper_figures/models.jl).
    ctx.strokeStyle = COLOR.ink;
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (sd) {
      ctx.lineWidth = 1;
      path(bezier([sd * 1.2, 19.4], [sd * 3, 27], [sd * 11, 29], [sd * 14.5, 22], 24));
      ctx.stroke();
      ctx.lineWidth = 1.4;
      path([[sd * 1.2, -15], [sd * 2.8, -18.6]]);
      ctx.stroke();
    });
    function shape(pts) {
      path(pts, true);
      ctx.fillStyle = COLOR.body; ctx.fill();
      ctx.strokeStyle = COLOR.ink; ctx.lineWidth = 1.4; ctx.stroke();
    }
    var e = 2 / 2.6, head = [], body = [], pron = [];
    for (i = 0; i < 80; i++) { var t = 2 * Math.PI * i / 80; head.push([3 * Math.cos(t), 17.4 + 2.5 * Math.sin(t)]); }
    for (i = 0; i < 160; i++) {
      var tb = 2 * Math.PI * i / 160, c = Math.cos(tb), sn = Math.sin(tb);
      body.push([7 * Math.sign(c) * Math.pow(Math.abs(c), e), 15.5 * Math.sign(sn) * Math.pow(Math.abs(sn), e)]);
    }
    for (i = 0; i < 80; i++) { var tp = 2 * Math.PI * i / 80; pron.push([6.2 * Math.cos(tp), 12.3 + (tp < Math.PI ? 4.2 : 1.2) * Math.sin(tp)]); }
    shape(head);
    [-1, 1].forEach(function (sd) {
      var q = P(sd * 2.1, 17.9);
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.65 * s, 1.0 * s, 0, 0, 2 * Math.PI);
      ctx.fillStyle = COLOR.ink2; ctx.fill();
    });
    shape(body);
    shape(pron);

    // The leg: in stance the foot is planted at distance d out and d tan φ ahead; in swing it is lifted, L along φ.
    var phi = x[1], stance = w.mode === M.STANCE;
    var foot = stance ? [JOINT[0] + x[3], x[5] - xb] : [JOINT[0] + L * Math.cos(phi), L * Math.sin(phi)];
    var J = P(JOINT[0], JOINT[1]), F = P(foot[0], foot[1]);
    ctx.strokeStyle = stance ? COLOR.ink : COLOR.ink2;
    ctx.lineWidth = Math.max(2.5, 0.55 * s);
    polyline(ctx, [J, F]);
    disc(ctx, F[0], F[1], Math.max(3.5, 0.9 * s), stance ? COLOR.ink : '#ffffff', COLOR.ink, 1.4);
    if (this.grab) disc(ctx, F[0], F[1], Math.max(9, 2 * s), null, COLOR.blue, 1.5);

    // The neuron in the body, filled by its output, with its self-weight and its two links to the joint.
    var o = w.output(), cell = P(0, 5), rn = 2.3 * s;
    selfLoop(ctx, cell[0], cell[1], rn, Math.PI, this.p.w, Math.max(1, 0.25 * s), 1);
    var sensor = bezier(J, [J[0] - 2 * s, J[1] + 2.5 * s], [cell[0] + 3 * s, cell[1] + 3 * s], [cell[0] + 0.7 * rn, cell[1] + 0.7 * rn], 12);
    ctx.strokeStyle = COLOR.ink; ctx.lineWidth = 1.2;
    polyline(ctx, sensor.slice(0, 11));
    arrowHead(ctx, sensor[12][0], sensor[12][1], Math.atan2(sensor[12][1] - sensor[10][1], sensor[12][0] - sensor[10][0]), 6, COLOR.ink);
    var out = bezier([cell[0] + rn * 0.95, cell[1] - rn * 0.3], [cell[0] + 4 * s, cell[1] - 1 * s], [J[0] - 2 * s, J[1] - 3 * s], [J[0] - 0.7 * s, J[1] - 0.7 * s], 12);
    ctx.strokeStyle = COLOR.orange; ctx.lineWidth = 1.8;
    polyline(ctx, out.slice(0, 11));
    arrowHead(ctx, out[12][0], out[12][1], Math.atan2(out[12][1] - out[10][1], out[12][0] - out[10][0]), 6.5, COLOR.orange);
    disc(ctx, cell[0], cell[1], rn, mix('#ffffff', COLOR.orange, o), COLOR.orange, 1.6);
    text(ctx, 'o', cell[0], cell[1] + 0.5, { size: Math.max(10, 1.9 * s), align: 'center', baseline: 'middle', color: o > 0.6 ? '#ffffff' : COLOR.ink });
    disc(ctx, J[0], J[1], Math.max(3, 0.9 * s), '#ffffff', COLOR.ink2, 1.3);

    text(ctx, stance ? 'stance: foot down, pushing' : 'swing: foot up', S.w - 10, 18, { size: 11, align: 'right', weight: 600, color: stance ? COLOR.ink : COLOR.muted });
    text(ctx, 'φ = ' + fmt(deg(phi), 1) + '°', S.w - 10, 34, { size: 11, align: 'right', color: COLOR.ink2 });
    text(ctx, 'o = ' + fmt(o, 2), S.w - 10, 49, { size: 11, align: 'right', color: COLOR.ink2 });
  };

  /** The leg angle and the neuron's output over the last 100 time units, stance shaded. */
  WalkTask.prototype.drawTrace = function () {
    var S = this.trace;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, R = 8, T = 16, B = 16, gap = 20, h = this.hist, t1 = this.walker.t, t0 = t1 - WALK_SPAN;
    var H = (S.h - T - B - gap) / 2, x0 = L, x1 = S.w - R;
    function X(t) { return x0 + (t - t0) / WALK_SPAN * (x1 - x0); }
    var rows = [
      { y0: T, title: 'leg angle φ (°), forward up', lo: -35, hi: 35, ticks: [-30, 0, 30], get: function (q) { return deg(q.phi); }, color: COLOR.orange },
      { y0: T + H + gap, title: 'neuron output o', lo: 0, hi: 1, ticks: [0, 0.5, 1], get: function (q) { return q.o; }, color: COLOR.neuron }
    ];
    rows.forEach(function (r) {
      var y0 = r.y0, y1 = y0 + H;
      function Y(v) { return y1 - (v - r.lo) / (r.hi - r.lo) * H; }
      ctx.fillStyle = '#efede6';
      for (var i = 0; i < h.length; i++) {
        if (!h[i].stance) continue;
        var j = i;
        while (j + 1 < h.length && h[j + 1].stance) j++;
        ctx.fillRect(X(h[i].t), y0, X(h[j].t) - X(h[i].t) + 1, H);
        i = j;
      }
      text(ctx, r.title, x0, y0 - 4, { size: 10 });
      ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
      r.ticks.forEach(function (tk) {
        var y = Math.round(Y(tk)) + 0.5;
        ctx.setLineDash(tk === 0.5 ? [3, 3] : []);
        polyline(ctx, [[x0, y], [x1, y]]);
        ctx.setLineDash([]);
        text(ctx, tk === 0.5 ? '½' : fmt(tk, 0), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
      });
      frameBox(ctx, x0, y0, x1, y1);
      ctx.strokeStyle = r.color; ctx.lineWidth = 1.6;
      polyline(ctx, h.map(function (q) { return [X(q.t), Y(r.get(q))]; }));
    });
    text(ctx, 'stance shaded · last 100 time units', x1, S.h - 4, { size: 9, align: 'right', color: COLOR.muted });
  };

  /** The walker's state in the plane (φ, o) over the neuron's steady-state curve, the fold. */
  WalkTask.prototype.drawPhase = function () {
    var S = this.phase;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, R = 10, T = 18, B = 28, lim = 0.62, w = this.walker;
    var x0 = L, x1 = S.w - R, y0 = T, y1 = S.h - B;
    function X(phi) { return x0 + (phi + lim) / (2 * lim) * (x1 - x0); }
    function Y(o) { return y1 - o * (y1 - y0); }
    text(ctx, 'the fold: neuron output o against leg angle φ', x0, y0 - 6, { size: 10 });
    ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
    [-30, -15, 0, 15, 30].forEach(function (d) {
      var x = Math.round(X(d * Math.PI / 180)) + 0.5;
      ctx.setLineDash(Math.abs(d) === 30 ? [2, 3] : []);
      polyline(ctx, [[x, y0], [x, y1]]);
      ctx.setLineDash([]);
      text(ctx, fmt(d, 0) + '°', x, y1 + 12, { size: 9, align: 'center', color: COLOR.muted });
    });
    [0, 0.5, 1].forEach(function (o) {
      var y = Math.round(Y(o)) + 0.5;
      ctx.setLineDash(o === 0.5 ? [3, 3] : []);
      polyline(ctx, [[x0, y], [x1, y]]);
      ctx.setLineDash([]);
      text(ctx, o === 0.5 ? '½' : fmt(o, 0), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
    });
    text(ctx, 'stance', x1 - 4, Y(0.5) - 5, { size: 9, align: 'right', color: COLOR.muted });
    text(ctx, 'swing', x1 - 4, Y(0.5) + 12, { size: 9, align: 'right', color: COLOR.muted });
    text(ctx, 'leg angle φ (forward →)', (x0 + x1) / 2, S.h - 3, { size: 9, align: 'center', color: COLOR.muted });
    frameBox(ctx, x0, y0, x1, y1);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    // The steady-state curve: stable branches solid, the unstable middle dashed.
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#a9a69c';
    var run = [], stable = this.fold.length ? this.fold[0].stable : true;
    function flush() { ctx.setLineDash(stable ? [] : [5, 4]); polyline(ctx, run); ctx.setLineDash([]); }
    this.fold.forEach(function (q) {
      if (q.stable !== stable) { flush(); run = run.slice(-1); stable = q.stable; }
      run.push([X(q.phi), Y(q.o)]);
    });
    flush();
    // The last stretch of the run, and the state now.
    var h = this.hist, k0 = 0;
    while (k0 < h.length && h[k0].t < w.t - 40) k0++;
    ctx.strokeStyle = rgba(COLOR.orange, 0.85);
    ctx.lineWidth = 1.6;
    polyline(ctx, h.slice(k0).map(function (q) { return [X(q.phi), Y(q.o)]; }));
    ctx.restore();
    disc(ctx, X(w.x[1]), Y(w.output()), 4.5, COLOR.orange, '#ffffff', 1.5);
  };

  // ── Categorize: the active categorization agent ─────────────────────────────────────────────────────────────────

  var FAMILY_NAME = { middle: 'middle bringer', edge: 'edge tracker', first: 'middle first' };
  var FAMILY_TEXT = {
    middle: 'A middle bringer keeps the object\'s edge 10–15° off straight ahead, which brings a circle to the middle of its body.',
    edge: 'An edge tracker keeps the object\'s edge more than 15° off straight ahead. It catches circles off-centre, under their edge.',
    first: 'A middle-first agent keeps the object\'s edge within 5° of straight ahead and centres on it early.'
  };
  var MODE_TEXT = {
    latched: 'It is latched: its two motor neurons have lopsided resting states, so once it pushes to one side it keeps going after the object has left its view.',
    symmetric: 'It is symmetric: with nothing in view its two motor neurons settle to the same output, and it stops.'
  };
  var TEN = [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50], MAX_PATHS = 40;
  /** World window of the scene: heights −22 … 292 over the canvas's height, the object at the centre. */
  var SCENE = { bottom: -34, top: 292 };
  /** Ray length (0 … 220) → the strip's grey (0 black … 1 white). The curved scales spend most of the greys on short rays. */
  var RAY_MAX = M.VISUAL.maxRay;
  var STRIP_SCALE = {
    linear: function (d) { return d / RAY_MAX; },
    log: function (d) { return Math.log1p(d / 5) / Math.log1p(RAY_MAX / 5); },
    loglog: function (d) { return Math.log1p(Math.log1p(d / 5)) / Math.log1p(Math.log1p(RAY_MAX / 5)); },
    exp: function (d) { return (1 - Math.exp(-d / 30)) / (1 - Math.exp(-RAY_MAX / 30)); }
  };

  function CategorizeTask(panel) {
    var self = this;
    this.panel = panel;
    this.shape = 'random';
    this.scale = 'exp';
    this.d = 20;
    this.randomStart = true;
    this.auto = true;
    this.speed = 15;
    this.running = !REDUCED;
    this.dirty = true;
    this.trial = null;
    this.current = null;
    this.paths = [];
    this.acc = 0;
    this.wait = 0;
    this.dragX = null;
    this.world = new Surface($('#cat-world', panel), function () { self.dirty = true; });
    this.rays = new Surface($('#cat-rays', panel), function () { self.dirty = true; });
    this.brain = new Surface($('#cat-brain', panel), function () { self.brainLayer = null; self.dirty = true; });
    this.chart = new Surface($('#cat-paths', panel), function () { self.dirty = true; });
    this.statusEl = $('#cat-status', panel);
    this.scoreEl = $('#cat-score', panel);
    this.noteEl = $('#cat-agent-note', panel);
    var select = $('#cat-agent', panel);
    AGENTS.forEach(function (a, i) {
      var opt = document.createElement('option'), who = a.N === 2 ? 'Agent ' + a.id + ': 2 neurons' : a.N + ' neurons';
      opt.value = i;
      opt.textContent = who + ', ' + a.mode + ' ' + FAMILY_NAME[a.family] + (a.note ? ' (' + a.note + ')' : '');
      select.appendChild(opt);
    });
    select.addEventListener('change', function () { self.setAgent(+select.value); });
    ['shape', 'scale'].forEach(function (key) {
      $$('[data-' + key + ']', panel).forEach(function (el) {
        el.addEventListener('click', function () {
          self[key] = el.dataset[key];
          $$('[data-' + key + ']', panel).forEach(function (b) { b.setAttribute('aria-checked', b === el ? 'true' : 'false'); });
          self.dirty = true;
        });
      });
    });
    bindControls(panel, this);
    this.bindPointer();
    this.setAgent(0);
    setToggle(panel, this.running);
  }

  CategorizeTask.prototype.setAgent = function (i) {
    var a = AGENTS[i];
    this.agent = a;
    this.circuit = M.makeCircuit(a.q, a.N);
    this.mats = M.circuitMatrices(this.circuit);
    this.brainLayer = null;
    this.paths = [];
    this.trial = null;
    this.current = null;
    this.noteEl.textContent = FAMILY_TEXT[a.family] + ' ' + MODE_TEXT[a.mode] + ' Over the task, its circle trials end a median ' +
      fmt(a.circleEnd, 1) + ' from the circle\'s centre and its line trials ' + fmt(a.lineEnd, 0) + ' from the line\'s.';
    this.statusEl.textContent = '';
    this.showScore();
    if (this.running && this.started) this.drop();
    this.dirty = true;
  };

  CategorizeTask.prototype.action = function (name, value) {
    if (name === 'toggle') { this.running = !this.running; setToggle(this.panel, this.running); }
    else if (name === 'drop') { this.drop(); if (!this.running) { this.running = true; setToggle(this.panel, true); } }
    else if (name === 'ten') this.runTen();
    else if (name === 'clear') { this.paths = []; this.showScore(); }
    else if (name === 'speed') this.speed = value;
    this.dirty = true;
  };

  CategorizeTask.prototype.setParam = function (name, value) {
    this[name] = value;
    if (name === 'd') {
      setOutput(this.panel, 'd', fmt(value, 0));
      if (this.randomStart) { this.randomStart = false; writeInput(this.panel, 'randomStart', false); }
    }
    this.dirty = true;
  };
  CategorizeTask.prototype.preset = function () {};

  /** Release an object: the chosen shape (or a random one) at the chosen offset (or a random one, never 0). */
  CategorizeTask.prototype.drop = function () {
    var shape = this.shape === 'random' ? (Math.random() < 0.5 ? 'circle' : 'line') : this.shape;
    var d = this.d;
    if (this.randomStart) {
      d = 1 + Math.floor(50 * Math.random());
      if (Math.random() < 0.5) d = -d;
      this.d = d;
      writeInput(this.panel, 'd', d);
      setOutput(this.panel, 'd', fmt(d, 0));
    }
    this.trial = new M.CategorizationTrial(this.circuit, shape, d);
    this.current = { shape: shape, x: [d], h: [this.trial.oy] };
    this.acc = 0;
    this.started = true;
    var side = d > 0 ? 'to its left' : d < 0 ? 'to its right' : 'dead centre';
    this.statusEl.textContent = 'A ' + shape + ' falls, ' + (d ? fmt(Math.abs(d), 0) + ' ' : '') + side + '.' +
      (d === 0 ? ' At exactly Δx = 0 a mirror-symmetric agent has nothing to break the tie with.' : '');
    this.dirty = true;
  };

  CategorizeTask.prototype.finish = function () {
    var t = this.trial, right = M.trialRight(t.shape, t.ax), end = Math.abs(t.ax), what;
    this.paths.push({ shape: t.shape, x: this.current.x, h: this.current.h, right: right });
    if (this.paths.length > MAX_PATHS) this.paths.shift();
    this.current = null;
    if (t.shape === 'circle') what = right ? 'Caught the circle' : 'Missed the circle';
    else what = right ? 'Avoided the line' : 'Hit the line';
    this.statusEl.innerHTML = '<span class="' + (right ? 'pg-good' : 'pg-bad') + '">' + what + '</span>: it ended ' + fmt(end, 1) +
      ' from the ' + t.shape + '\'s centre' + (right ? '.' : t.shape === 'circle' ? ', outside the 30 it must end within.' : ', closer than the 30 it must keep away.');
    this.showScore();
    this.wait = 1.2;
  };

  /** The paper's ten starts, d = ±10 … ±50, for the chosen shape (both when random), run at once. */
  CategorizeTask.prototype.runTen = function () {
    var self = this, shapes = this.shape === 'random' ? ['circle', 'line'] : [this.shape];
    shapes.forEach(function (shape) {
      TEN.forEach(function (d) {
        var p = M.categorizationPath(self.circuit, shape, d);
        self.paths.push({ shape: shape, x: p.x, h: p.h, right: M.trialRight(shape, p.x[p.x.length - 1]) });
      });
    });
    while (this.paths.length > MAX_PATHS) this.paths.shift();
    this.statusEl.textContent = 'Ran the ten starts from Δx = ±10 … ±50 for ' + (shapes.length > 1 ? 'circles and lines' : shapes[0] + 's') + '.';
    this.showScore();
    this.dirty = true;
  };

  CategorizeTask.prototype.showScore = function () {
    var c = { circle: [0, 0], line: [0, 0] };
    this.paths.forEach(function (p) { c[p.shape][1]++; if (p.right) c[p.shape][0]++; });
    var right = c.circle[0] + c.line[0], n = c.circle[1] + c.line[1];
    this.scoreEl.innerHTML = n ? '<strong>' + right + '</strong> of ' + n + ' trials right (circles ' + c.circle[0] + '/' + c.circle[1] +
      ', lines ' + c.line[0] + '/' + c.line[1] + ')' : 'No trials yet.';
  };

  CategorizeTask.prototype.sceneScale = function () { return this.world.h / (SCENE.top - SCENE.bottom); };
  CategorizeTask.prototype.sx = function (x) { return this.world.w / 2 + x * this.sceneScale(); };
  CategorizeTask.prototype.sy = function (y) { return (SCENE.top - y) * this.sceneScale(); };
  CategorizeTask.prototype.agentX = function () { return this.trial ? this.trial.ax : this.d; };

  CategorizeTask.prototype.bindPointer = function () {
    var self = this, canvas = this.world.canvas, V = M.VISUAL;
    function worldX(pt) {
      var lim = self.world.w / 2 / self.sceneScale() - V.body / 2;
      return clamp((pt[0] - self.world.w / 2) / self.sceneScale(), -lim, lim);
    }
    function onAgent(pt) {
      return Math.hypot(pt[0] - self.sx(self.agentX()), pt[1] - self.sy(0)) < (V.body / 2 + 10) * self.sceneScale();
    }
    canvas.addEventListener('pointerdown', function (e) {
      var pt = self.world.pointer(e);
      if (!onAgent(pt)) return;
      self.dragX = worldX(pt);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      self.place();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      var pt = self.world.pointer(e);
      if (self.dragX === null) { canvas.style.cursor = onAgent(pt) ? 'grab' : 'default'; return; }
      self.dragX = worldX(pt);
      self.place();
    });
    function release() { if (self.dragX === null) return; self.dragX = null; canvas.style.cursor = 'grab'; self.dirty = true; }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('keydown', function (e) {
      var m = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
      if (!m) return;
      self.dragX = self.agentX() + m;
      self.place();
      self.dragX = null;
      e.preventDefault();
    });
  };

  /** Put the agent where it is dragged: mid-trial it is pushed there and stopped; between trials it sets the next start. */
  CategorizeTask.prototype.place = function () {
    var t = this.trial, x = this.dragX;
    if (t && !t.done) {
      t.ax = x;
      t.v = 0;
      t.readings = M.rayReadings(x, t.line, t.oy);
    } else {
      this.trial = null;
      this.wait = 1.5;
      this.d = Math.round(x);
      this.randomStart = false;
      writeInput(this.panel, 'randomStart', false);
      writeInput(this.panel, 'd', clamp(this.d, -50, 50));
      setOutput(this.panel, 'd', fmt(this.d, 0));
    }
    this.dirty = true;
  };

  CategorizeTask.prototype.show = function () {
    this.world.resize(); this.rays.resize(); this.brain.resize(); this.chart.resize();
    if (!this.started && this.running) this.drop();
    this.dirty = true;
  };
  CategorizeTask.prototype.hide = function () {};

  CategorizeTask.prototype.frame = function (dt) {
    var t = this.trial;
    if (this.running && dt > 0) {
      if (t && !t.done) {
        this.acc += dt * this.speed / M.CAT_DT;
        var n = Math.floor(this.acc);
        this.acc -= n;
        for (var i = 0; i < n && !t.done; i++) {
          if (this.dragX !== null) { t.ax = this.dragX; t.v = 0; t.readings = M.rayReadings(t.ax, t.line, t.oy); }
          t.step();
          if (t.k % 10 === 0) { this.current.x.push(t.ax); this.current.h.push(t.oy); }
        }
        if (t.done) this.finish();
        this.dirty = true;
      } else if (this.auto && this.started && (!t || t.done) && this.dragX === null) {
        this.wait -= dt;
        if (this.wait <= 0) this.drop();
      }
    }
    if (this.dirty) { this.dirty = false; this.drawWorld(); this.drawRays(); this.drawBrain(); this.drawPaths(); }
  };

  CategorizeTask.prototype.drawWorld = function () {
    var S = this.world;
    if (!S.ready()) return;
    var ctx = S.begin(COLOR.paper), self = this, V = M.VISUAL, k = this.sceneScale(), t = this.trial;
    var ax = this.agentX(), oy = t ? t.oy : V.startHeight, line = t ? t.line : this.shape === 'line';
    var readings = t ? t.readings : M.rayReadings(ax, line, oy), R = V.body / 2;
    function X(x) { return self.sx(x); }
    function Y(y) { return self.sy(y); }

    // The catch zone under the object, and the floor.
    ctx.fillStyle = COLOR.zone;
    ctx.fillRect(X(-30), Y(-16), 60 * k, 4 * k);
    ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
    polyline(ctx, [[0, Y(-16) + 0.5], [S.w, Y(-16) + 0.5]]);
    text(ctx, 'catch zone', X(0), Y(-20) + 11, { size: 9, align: 'center', color: COLOR.muted });

    // The field of view, faint, and the seven rays, dark where they hit the object.
    var half = V.visualAngle / 2, reach = R + V.maxRay;
    ctx.beginPath();
    ctx.moveTo(X(ax + R * Math.sin(-half)), Y(R * Math.cos(-half)));
    for (var a = -half; a <= half + 1e-9; a += half / 10) ctx.lineTo(X(ax + reach * Math.sin(a)), Y(reach * Math.cos(a)));
    ctx.lineTo(X(ax + R * Math.sin(half)), Y(R * Math.cos(half)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(137,135,129,0.07)';
    ctx.fill();
    M.RAYS.forEach(function (r, j) {
      var len = readings.length[j], hit = len < V.maxRay - 1e-6, x0 = ax + r.ox, y0 = r.sy;
      var x1 = x0 + len * Math.sin(r.angle), y1 = y0 + len * Math.cos(r.angle);
      ctx.strokeStyle = hit ? COLOR.ink2 : 'rgba(137,135,129,0.45)';
      ctx.lineWidth = hit ? 1.3 : 0.8;
      polyline(ctx, [[X(x0), Y(y0)], [X(x1), Y(y1)]]);
      if (hit) disc(ctx, X(x1), Y(y1), 2.2, COLOR.ink);
    });

    // The object.
    if (line) {
      ctx.strokeStyle = COLOR.ink2;
      ctx.lineWidth = Math.max(3, 3 * k);
      ctx.lineCap = 'butt';
      polyline(ctx, [[X(-V.size / 2), Y(oy)], [X(V.size / 2), Y(oy)]]);
    } else disc(ctx, X(0), Y(oy), V.size / 2 * k, '#d9d7cf', COLOR.ink2, 1.5);

    // The agent and the push of its motor neurons, F = 5 (o_R₁ − o_L₁).
    var F = t ? t.force : 0;
    if (Math.abs(F) > 0.05) {
      var dir = F > 0 ? 1 : -1, xs = X(ax + dir * (R + 2)), xe = X(ax + dir * (R + 2 + 22 * Math.abs(F) / V.velocityGain)), col = F > 0 ? COLOR.right : COLOR.left;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      polyline(ctx, [[xs, Y(0)], [xe - dir * 6, Y(0)]]);
      arrowHead(ctx, xe, Y(0), dir > 0 ? 0 : Math.PI, 9, col);
    }
    disc(ctx, X(ax), Y(0), R * k, COLOR.body, COLOR.ink, 1.5);
    if (this.dragX !== null) disc(ctx, X(ax), Y(0), R * k + 5, null, COLOR.blue, 1.5);
    M.RAYS.forEach(function (r) { disc(ctx, X(ax + r.ox), Y(r.sy), 1.6, '#ffffff', COLOR.ink2, 0.8); });

    text(ctx, 'height ' + fmt(oy - 0, 0), 10, 18, { size: 11, color: COLOR.ink2 });
    text(ctx, 'Δx ' + fmt(ax, 1), 10, 33, { size: 11, color: COLOR.ink2 });
    if (!t) text(ctx, 'Press Drop', S.w / 2, 40, { size: 12, align: 'center', color: COLOR.muted });
  };

  /** The seven rays, left to right, as a grey strip: white for nothing in reach, black for the object up close. */
  CategorizeTask.prototype.drawRays = function () {
    var S = this.rays;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), V = M.VISUAL, t = this.trial, w = S.w / 7, grey = STRIP_SCALE[this.scale], j;
    var len = t ? t.readings.length : M.rayReadings(this.agentX(), this.shape === 'line', V.startHeight).length;
    for (j = 0; j < 7; j++) {
      ctx.fillStyle = mix('#000000', '#ffffff', grey(len[j]));
      ctx.fillRect(j * w, 0, w + 0.5, S.h);
    }
    ctx.strokeStyle = COLOR.axis; ctx.lineWidth = 1;
    for (j = 1; j < 7; j++) polyline(ctx, [[Math.round(j * w) + 0.5, 0], [Math.round(j * w) + 0.5, S.h]]);
  };

  /** Where the brain's sensors and neurons go in the brain canvas (as in the paper's figure: neurons on a half ellipse). */
  CategorizeTask.prototype.brainLayout = function () {
    var S = this.brain, W = S.w, H = S.h, n = this.mats.names.length, pos = [], sensors = [];
    var cx = W / 2, cy = n > 2 ? 0.4 * H : 0.52 * H, rx = 0.36 * W, ry = 0.3 * H;
    for (var k = 0; k < n; k++) {
      var a = n > 1 ? Math.PI + k * Math.PI / (n - 1) : 1.5 * Math.PI;
      pos.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)]);
    }
    for (var j = 0; j < 7; j++) sensors.push([cx + (j - 3) * 0.07 * W, 0.1 * H + 0.004 * H * (j - 3) * (j - 3)]);
    return { pos: pos, sensors: sensors, rn: Math.max(9, Math.min(W, H) * (n > 6 ? 0.05 : 0.06)), rs: Math.max(4, 0.016 * W), cx: cx, cy: cy };
  };

  /** The circuit's connections, drawn once per agent and size: rays → neurons faint, neurons → neurons by weight. */
  CategorizeTask.prototype.drawBrainLayer = function (lay) {
    var S = this.brain, c = document.createElement('canvas'), ctx = c.getContext('2d'), m = this.mats, n = m.names.length, t, f, j;
    c.width = S.canvas.width; c.height = S.canvas.height;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var wmax = 0;
    for (t = 0; t < n; t++) { for (f = 0; f < n; f++) wmax = Math.max(wmax, Math.abs(m.W[t][f])); for (j = 0; j < 7; j++) wmax = Math.max(wmax, Math.abs(m.U[t][j])); }
    function width(w) { return 0.3 + 2.4 * Math.abs(w) / wmax; }
    for (t = 0; t < n; t++) for (j = 0; j < 7; j++) {
      var a = lay.sensors[j], b = lay.pos[t];
      synapse(ctx, a[0], a[1], b[0], b[1], lay.rs, lay.rn, m.U[t][j], width(m.U[t][j]) * 0.6, 0, 0.16);
    }
    for (t = 0; t < n; t++) for (f = 0; f < n; f++) {
      if (t === f) continue;
      var p0 = lay.pos[f], p1 = lay.pos[t];
      synapse(ctx, p0[0], p0[1], p1[0], p1[1], lay.rn, lay.rn, m.W[t][f], width(m.W[t][f]), 0.1, n > 4 ? 0.45 : 0.8);
    }
    for (t = 0; t < n; t++) {
      var p = lay.pos[t], th = n === 2 ? (t === 0 ? Math.PI : 0) : Math.atan2(p[1] - lay.cy + 0.15 * S.h, p[0] - lay.cx);
      selfLoop(ctx, p[0], p[1], lay.rn, th, m.W[t][t], width(m.W[t][t]), n > 4 ? 0.6 : 0.9);
    }
    return c;
  };

  CategorizeTask.prototype.drawBrain = function () {
    var S = this.brain;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), lay = this.brainLayout(), m = this.mats, t = this.trial, n = m.names.length, c = this.circuit;
    if (!this.brainLayer) this.brainLayer = this.drawBrainLayer(lay);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.brainLayer, 0, 0);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var inputs = t ? t.readings.input : [0, 0, 0, 0, 0, 0, 0];
    lay.sensors.forEach(function (q, j) { disc(ctx, q[0], q[1], lay.rs, mix('#ffffff', COLOR.ink2, inputs[j] / 10), COLOR.ink2, 1); });
    text(ctx, 'rays 1–7', lay.sensors[6][0] + lay.rs + 6, lay.sensors[6][1] + 3, { size: 9, color: COLOR.muted });
    // Outputs in drawing order L₁ … L_M, (C), R_M … R₁.
    var outs = [], sides = m.side, i;
    for (i = 0; i < n; i++) {
      var sd = sides[i];
      outs.push(!t ? null : sd[0] === 'C' ? t.oC : sd[0] === 'L' ? t.oL[sd[1]] : t.oR[sd[1]]);
    }
    for (i = 0; i < n; i++) {
      var p = lay.pos[i], col = m.names[i] === 'L₁' ? COLOR.left : m.names[i] === 'R₁' ? COLOR.right : COLOR.ink2, o = outs[i];
      disc(ctx, p[0], p[1], lay.rn, o === null ? '#ffffff' : mix('#ffffff', col, o), col, m.names[i].slice(1) === '₁' ? 2.2 : 1.4);
      text(ctx, m.names[i], p[0], p[1] + 0.5, { size: Math.max(9, lay.rn * 0.85), align: 'center', baseline: 'middle',
        color: o !== null && o > 0.55 ? '#ffffff' : COLOR.ink });
    }
    // The force on the body.
    var F = t ? t.force : 0, by = S.h - 16, half = 0.3 * S.w, bw = half * F / M.VISUAL.velocityGain;
    ctx.fillStyle = COLOR.grid;
    ctx.fillRect(S.w / 2 - half, by - 3, 2 * half, 6);
    ctx.fillStyle = F < 0 ? COLOR.left : COLOR.right;
    ctx.fillRect(Math.min(S.w / 2, S.w / 2 + bw), by - 3, Math.abs(bw), 6);
    ctx.fillStyle = COLOR.ink2;
    ctx.fillRect(S.w / 2 - 0.5, by - 6, 1, 12);
    text(ctx, 'push left', S.w / 2 - half - 6, by + 3, { size: 9, align: 'right', color: COLOR.left });
    text(ctx, 'push right', S.w / 2 + half + 6, by + 3, { size: 9, color: COLOR.right });
    text(ctx, c.N + ' neurons', 8, 14, { size: 10, color: COLOR.muted });
  };

  /** Δx as the object falls, every trial so far, over the catch zone (figure 1B and 1C of the categorization paper). */
  CategorizeTask.prototype.drawPaths = function () {
    var S = this.chart;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, R = 8, T = 10, B = 26, lim = 125, x0 = L, x1 = S.w - R, y0 = T, y1 = S.h - B;
    function X(dx) { return x0 + (dx + lim) / (2 * lim) * (x1 - x0); }
    function Y(h) { return y1 - h / 280 * (y1 - y0); }
    ctx.fillStyle = '#f1f7f1';
    ctx.fillRect(X(-30), y0, X(30) - X(-30), y1 - y0);
    ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
    [-100, -30, 0, 30, 100].forEach(function (d) {
      var x = Math.round(X(d)) + 0.5;
      polyline(ctx, [[x, y0], [x, y1]]);
      text(ctx, fmt(d, 0), x, y1 + 11, { size: 9, align: 'center', color: COLOR.muted });
    });
    [0, 100, 200].forEach(function (h) {
      var y = Math.round(Y(h)) + 0.5;
      polyline(ctx, [[x0, y], [x1, y]]);
      text(ctx, String(h), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
    });
    text(ctx, 'Δx, agent minus object', (x0 + x1) / 2, S.h - 3, { size: 9, align: 'center', color: COLOR.muted });
    ctx.save();
    ctx.translate(10, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
    text(ctx, 'object height', 0, 0, { size: 9, align: 'center', color: COLOR.muted });
    ctx.restore();
    frameBox(ctx, x0, y0, x1, y1);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    function draw(p, alpha, lw) {
      ctx.strokeStyle = rgba(p.shape === 'circle' ? COLOR.blue : COLOR.orange, alpha);
      ctx.lineWidth = lw;
      polyline(ctx, p.x.map(function (x, i) { return [X(x), Y(p.h[i])]; }));
    }
    this.paths.forEach(function (p) { draw(p, 0.45, 1.1); });
    this.paths.forEach(function (p) {
      var e = [X(p.x[p.x.length - 1]), Y(p.h[p.h.length - 1])];
      if (p.right) disc(ctx, e[0], e[1], 2.6, p.shape === 'circle' ? COLOR.blue : COLOR.orange);
      else {
        ctx.strokeStyle = COLOR.bad; ctx.lineWidth = 1.6;
        polyline(ctx, [[e[0] - 3.5, e[1] - 3.5], [e[0] + 3.5, e[1] + 3.5]]);
        polyline(ctx, [[e[0] - 3.5, e[1] + 3.5], [e[0] + 3.5, e[1] - 3.5]]);
      }
    });
    if (this.current) {
      var cur = { shape: this.current.shape, x: this.current.x.concat([this.trial.ax]), h: this.current.h.concat([this.trial.oy]) };
      draw(cur, 1, 2);
    }
    ctx.restore();
  };

  // ── Swing: the single-mass swing ────────────────────────────────────────────────────────────────────────────────

  var SWING_DT = 0.004, SWING_SAMPLE = 0.02, SWING_SPAN = 20, SWING_TRAIL = 2.5;
  /** The outcome scan: gains 0, 2, … 100 from each of the three starts, run for up to 8 ms a frame. */
  var SCAN_STEP = 2, SCAN_MAX = 100, SCAN_RUNS = (SCAN_MAX / SCAN_STEP + 1) * M.SWING_STARTS.length, SCAN_BUDGET = 8;
  var START_COLOR = { nudge: COLOR.orange, drop: COLOR.blue, spin: COLOR.neuron };
  var SWING_TEXT = {
    rest: 'at rest', bob: 'bobbing: the swing hangs still', swing: 'swinging', locked: 'swinging, two bobs to each swing',
    loop: 'looping over the top', held: 'held', off: 'stopped'
  };

  function SwingTask(panel) {
    var self = this;
    this.panel = panel;
    this.swing = new M.Swinger();
    this.p = this.swing.p;
    this.speed = 1;
    this.running = !REDUCED;
    this.dirty = true;
    this.grab = false;
    this.scan = null;
    this.world = new Surface($('#swing-world', panel), function () { self.dirty = true; });
    this.trace = new Surface($('#swing-trace', panel), function () { self.dirty = true; });
    this.diagram = new Surface($('#swing-diagram', panel), function () { self.dirty = true; });
    this.statEls = {};
    $$('[data-stat]', panel).forEach(function (el) { self.statEls[el.dataset.stat] = el; });
    this.alertEl = $('#swing-alert', panel);
    this.readingEl = $('#swing-reading', panel);
    bindControls(panel, this);
    this.bindPointer();
    this.refresh();
    this.restart();
    setToggle(panel, this.running);
  }

  /** At rest but for a nudge, as the notebooks start. */
  SwingTask.prototype.restart = function () {
    this.swing.reset();
    this.hist = [];
    this.nextSample = 0;
    this.state = null;
    this.R = 1.7;
    this.dirty = true;
    this.showStats();
  };

  SwingTask.prototype.action = function (name, value) {
    if (name === 'toggle') { this.running = !this.running; setToggle(this.panel, this.running); }
    else if (name === 'reset') this.restart();
    else if (name === 'speed') this.speed = value;
    else if (name === 'push') this.push(0);
    this.dirty = true;
  };

  /** A push of 1.5 rad/s toward `dir` (−1 left, 1 right), or along the swing's motion for 0. */
  SwingTask.prototype.push = function (dir) {
    var s = this.swing;
    if (s.off || s.held !== null) return;
    s.x[1] += 1.5 * (dir || (s.x[1] < 0 ? -1 : 1));
    if (!this.running) { this.running = true; setToggle(this.panel, true); }
  };

  SwingTask.prototype.setParam = function (name, value) { this.p[name] = value; this.refresh(); };
  SwingTask.prototype.preset = function (q) { Object.assign(this.p, q); this.refresh(); };

  /** Show the parameters, and start the outcome scan over if a parameter other than the gain changed. */
  SwingTask.prototype.refresh = function () {
    var p = this.p, panel = this.panel;
    ['A', 'rho', 'k', 'b'].forEach(function (k) { writeInput(panel, k, p[k]); });
    setOutput(panel, 'A', fmt(p.A, 0));
    setOutput(panel, 'rho', fmt(p.rho, 1));
    setOutput(panel, 'k', fmt(p.k, 0));
    setOutput(panel, 'b', fmt(p.b, 2));
    syncPresets(panel, p);
    this.hopf = M.swingHopf(p);
    this.period = M.swingPeriod(p);
    var key = [p.rho, p.k, p.b].join();
    if (!this.scan || this.scan.key !== key) this.scan = { key: key, dots: [], next: 0 };
    this.readingEl.textContent = 'With these settings the mass starts to bob at A = ' + fmt(this.hopf.A, 1) + ', once every ' +
      fmt(this.hopf.period, 2) + ' s. The swing\'s own period is ' + fmt(this.period, 2) + ' s, so it is pumped only once the bob has slowed to about ' +
      fmt(this.period / 2, 2) + ' s, two bobs to a swing.';
    this.dirty = true;
  };

  /** Run the outcome scan on for up to SCAN_BUDGET ms. */
  SwingTask.prototype.scanSome = function () {
    var sc = this.scan, starts = M.SWING_STARTS, t0 = window.performance.now();
    while (sc.next < SCAN_RUNS && window.performance.now() - t0 < SCAN_BUDGET) {
      var i = sc.next++, A = Math.floor(i / starts.length) * SCAN_STEP, j = i % starts.length;
      var q = Object.assign({}, this.p, { A: A });
      sc.dots.push(Object.assign({ A: A, start: starts[j].name, j: j }, M.swingOutcome(q, starts[j].x(q))));
    }
  };

  SwingTask.prototype.scale = function () { return Math.min(this.world.w, this.world.h) / 2 / this.R; };
  SwingTask.prototype.massRadius = function () { return Math.max(8, 0.11 * this.scale()); };
  /** The mass in screen pixels, the pivot at the canvas's centre. */
  SwingTask.prototype.toScreen = function (th, len) {
    var s = this.scale();
    return [this.world.w / 2 + len * s * Math.sin(th), this.world.h / 2 + len * s * Math.cos(th)];
  };

  SwingTask.prototype.bindPointer = function () {
    var self = this, canvas = this.world.canvas;
    function onMass(pt) {
      var m = self.toScreen(self.swing.x[0], 1 + self.swing.x[2]);
      return Math.hypot(pt[0] - m[0], pt[1] - m[1]) < self.massRadius() + 12;
    }
    function holdAt(pt) {
      var dx = pt[0] - self.world.w / 2, dy = pt[1] - self.world.h / 2;
      var len = clamp(Math.hypot(dx, dy) / self.scale(), 0.4, Math.min(2.5, 0.92 * self.R));
      self.swing.hold(Math.atan2(dx, dy), len - 1);
    }
    canvas.addEventListener('pointerdown', function (e) {
      var pt = self.world.pointer(e);
      if (self.swing.off || !onMass(pt)) return;
      self.grab = true;
      holdAt(pt);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      self.dirty = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      var pt = self.world.pointer(e);
      if (!self.grab) { canvas.style.cursor = onMass(pt) ? 'grab' : 'default'; return; }
      holdAt(pt);
      self.dirty = true;
    });
    function release() {
      if (!self.grab) return;
      self.grab = false;
      self.swing.hold(null);
      canvas.style.cursor = 'grab';
      self.dirty = true;
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!d) return;
      self.push(d);
      self.dirty = true;
      e.preventDefault();
    });
  };

  SwingTask.prototype.show = function () { this.world.resize(); this.trace.resize(); this.diagram.resize(); this.dirty = true; };
  SwingTask.prototype.hide = function () {};

  SwingTask.prototype.frame = function (dt) {
    var s = this.swing;
    if (this.scan.next < SCAN_RUNS) { this.scanSome(); this.dirty = true; }
    // Held, the neuron keeps running even when paused, as the walker's does.
    if ((this.running || this.grab) && dt > 0 && !s.off) {
      var T = dt * this.speed, n = Math.max(1, Math.ceil(T / SWING_DT));
      for (var i = 0; i < n && !s.off; i++) {
        s.step(T / n);
        if (s.t >= this.nextSample) { this.sample(); this.nextSample = s.t + SWING_SAMPLE; }
      }
      this.zoom(dt);
      this.measure();
      this.showStats();
      this.dirty = true;
    }
    if (this.dirty) { this.dirty = false; this.drawWorld(); this.drawTrace(); this.drawDiagram(); }
  };

  SwingTask.prototype.sample = function () {
    var s = this.swing, x = s.x;
    this.hist.push({ t: s.t, th: M.wrapAngle(x[0]), r: x[2], v: x[3], u: x[4] });
    while (this.hist.length && this.hist[0].t < s.t - SWING_SPAN) this.hist.shift();
  };

  /**
   * Ease the view out quickly to fit the longest the rope has been over the last 20 s, and back in slowly; once the
   * run has stopped, fit the rope at once.
   */
  SwingTask.prototype.zoom = function (dt) {
    var len = 1 + this.swing.x[2];
    for (var i = 0; i < this.hist.length; i++) len = Math.max(len, 1 + this.hist[i].r);
    var target = clamp(1.12 * len + 0.2, 1.7, 7);
    this.R = this.swing.off ? target : this.R + (target - this.R) * Math.min(1, (target > this.R ? 4 : 0.8) * dt);
  };

  /**
   * What the swing does over the last 10 s: it loops if θ went over the top, swings if its amplitude is over 2°, and
   * otherwise bobs or rests as the scan classes them (models.js `swingOutcome`). The swing's period is that of θ's
   * upward zero crossings (of its turns, looping), and the bob's that of v's.
   */
  SwingTask.prototype.measure = function () {
    var h = this.hist, s = this.swing, n = h.length;
    if (s.off) { this.state = { kind: 'off' }; return; }
    if (s.held !== null) { this.state = { kind: 'held' }; return; }
    if (n < 2 || h[n - 1].t - h[0].t < 6) { this.state = null; return; }
    var from = h[n - 1].t - 10, ups = [], bobs = [], turns = [], amp = 0, rlo = Infinity, rhi = -Infinity;
    function cross(a, b, k) { return a.t + (b.t - a.t) * a[k] / (a[k] - b[k]); }
    function period(ts) { return ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : NaN; }
    for (var i = 1; i < n; i++) {
      var a = h[i - 1], b = h[i];
      if (b.t < from) continue;
      rlo = Math.min(rlo, b.r); rhi = Math.max(rhi, b.r);
      if (a.v < 0 && b.v >= 0) bobs.push(cross(a, b, 'v'));
      if (Math.abs(b.th - a.th) > Math.PI) { turns.push(b.t); continue; }
      amp = Math.max(amp, Math.abs(b.th));
      if (a.th < 0 && b.th >= 0) ups.push(cross(a, b, 'th'));
    }
    var bob = (rhi - rlo) / 2, st = { amp: deg(amp), bob: bob, tBob: bob > 0.002 ? period(bobs) : NaN, tSwing: NaN };
    if (turns.length) { st.kind = 'loop'; st.tSwing = period(turns); }
    else if (st.amp > 2 && ups.length > 1) { st.kind = 'swing'; st.tSwing = period(ups); }
    else st.kind = bob > 0.002 ? 'bob' : 'rest';
    st.ratio = st.tSwing / st.tBob;
    this.state = st;
  };

  SwingTask.prototype.showStats = function () {
    var st = this.state, el = this.statEls, s = this.swing, live = st && st.kind !== 'held' && st.kind !== 'off';
    el.amp.textContent = !live ? '–' : st.kind === 'loop' ? 'over the top' : fmt(st.amp, 0) + '°';
    el.period.textContent = live && isFinite(st.tSwing) ? fmt(st.tSwing, 2) + ' s' : '–';
    el.bob.textContent = live && isFinite(st.tBob) ? fmt(st.tBob, 2) + ' s' : '–';
    el.ratio.textContent = live && isFinite(st.ratio) ? fmt(st.ratio, 2) : '–';
    var msg = '';
    if (s.off) {
      msg = s.x[2] > 0 ? 'The rope stretched past 6 m and the run stopped. Spinning this fast, the swing\'s centrifugal pull grows faster ' +
        'than the rope\'s spring can hold it back, and nothing in the model stops it. Restart, or stiffen the rope.'
        : 'The mass reached the pivot and the run stopped: the model has nothing there to stop it. Restart.';
    } else if (st && st.kind === 'held') {
      msg = 'You are holding the mass. The neuron still runs, but with the mass held still it senses no speed and falls quiet. Let go to drop the swing from here.';
    }
    if (this.alertEl.textContent !== msg) this.alertEl.textContent = msg;
    this.alertEl.hidden = !msg;
  };

  SwingTask.prototype.stateText = function () {
    var st = this.state;
    if (!st) return '';
    if (st.kind === 'swing' && Math.abs(st.ratio - 2) < 0.1) return SWING_TEXT.locked;
    return SWING_TEXT[st.kind];
  };

  SwingTask.prototype.drawWorld = function () {
    var S = this.world;
    if (!S.ready()) return;
    var ctx = S.begin(COLOR.paper), self = this, sw = this.swing, x = sw.x, p = this.p, s = this.scale(), i;
    var c = [S.w / 2, S.h / 2], len = 1 + x[2], m = this.toScreen(x[0], len), mr = this.massRadius();
    var ux = Math.sin(x[0]), uy = Math.cos(x[0]);   // along the rope, outward, in screen axes

    // The swing set's A-frame, behind the swing, and a dashed circle at the rope's rest length.
    ctx.strokeStyle = '#d9d6cb';
    ctx.lineWidth = Math.max(3, 0.05 * s);
    ctx.lineCap = 'round';
    polyline(ctx, [[c[0] - 0.3 * S.h, S.h], c, [c[0] + 0.3 * S.h, S.h]]);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c[0], c[1], s, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);

    // The mass's path over the last 2.5 s.
    var trail = this.hist.filter(function (q) { return q.t > sw.t - SWING_TRAIL; });
    ctx.strokeStyle = rgba(COLOR.orange, 0.5);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    polyline(ctx, trail.map(function (q) { return self.toScreen(q.th, 1 + q.r); }).concat([m]));

    // The rope, a spring of 14 coils from the pivot to the mass.
    var L = len * s, lead = Math.min(0.1 * s, 0.15 * L), coils = 14, wv = Math.max(3, 0.035 * s), pts = [c];
    var span = Math.max(0, L - mr - 2 * lead);
    for (i = 0; i <= 2 * coils; i++) {
      var along = lead + span * i / (2 * coils), side = i === 0 || i === 2 * coils ? 0 : i % 2 ? wv : -wv;
      pts.push([c[0] + along * ux - side * uy, c[1] + along * uy + side * ux]);
    }
    pts.push([m[0] - mr * ux, m[1] - mr * uy]);
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 1.3;
    polyline(ctx, pts);

    // The neuron's push along the rope, u/(1 + r²), beside the mass: orange outward, blue inward.
    var F = x[4] / (1 + x[2] * x[2]), a = clamp(F / Math.max(p.A, 1), -1, 1);
    if (Math.abs(a) > 0.03) {
      var dir = a > 0 ? 1 : -1, off = mr + 7, half = (8 + 0.4 * s * Math.abs(a)) / 2, col = a > 0 ? COLOR.orange : COLOR.blue;
      var bx = m[0] - off * uy, by = m[1] + off * ux;
      var p0 = [bx - dir * half * ux, by - dir * half * uy], p1 = [bx + dir * half * ux, by + dir * half * uy];
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      polyline(ctx, [p0, [p1[0] - dir * 5 * ux, p1[1] - dir * 5 * uy]]);
      arrowHead(ctx, p1[0], p1[1], Math.atan2(dir * uy, dir * ux), 9, col);
    }

    // The mass, filled by the neuron's output, and the pivot: the swing set's crossbar end on.
    var o = clamp(x[4] / Math.max(p.A, 1), -1, 1);
    disc(ctx, m[0], m[1], mr, o >= 0 ? mix(COLOR.body, COLOR.orange, o) : mix(COLOR.body, COLOR.blue, -o), COLOR.ink, 1.6);
    if (this.grab) disc(ctx, m[0], m[1], mr + 6, null, COLOR.blue, 1.5);
    disc(ctx, c[0], c[1], Math.max(5, 0.06 * s), COLOR.ink2);
    disc(ctx, c[0], c[1], 2, '#ffffff');

    text(ctx, this.stateText(), 10, 18, { size: 11, weight: 600, color: COLOR.ink });
    text(ctx, 'θ = ' + fmt(deg(M.wrapAngle(x[0])), 0) + '°', 10, 34, { size: 11, color: COLOR.ink2 });
    text(ctx, 'rope 1 + r = ' + fmt(len, 2) + ' m', 10, 49, { size: 11, color: COLOR.ink2 });
    text(ctx, 'u = ' + fmt(x[4], 1), 10, 64, { size: 11, color: COLOR.ink2 });

    // A one-metre scale bar, since the view zooms to fit the rope.
    var bx0 = 12, by0 = S.h - 12;
    ctx.strokeStyle = COLOR.ink2; ctx.lineWidth = 1;
    polyline(ctx, [[bx0, by0 - 4], [bx0, by0], [bx0 + s, by0], [bx0 + s, by0 - 4]]);
    text(ctx, '1 m', bx0 + s / 2, by0 - 6, { align: 'center', size: 10 });
  };

  /** The swing's angle, the rope's stretch and the neuron's output over the last 20 s. */
  SwingTask.prototype.drawTrace = function () {
    var S = this.trace;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, R = 8, T = 16, B = 16, gap = 18, h = this.hist, t1 = this.swing.t, t0 = t1 - SWING_SPAN;
    var H = (S.h - T - B - 2 * gap) / 3, x0 = L, x1 = S.w - R, amax = 0, rlo = -0.25, rhi = 0.5, ua = Math.max(1, this.p.A);
    h.forEach(function (q) { amax = Math.max(amax, Math.abs(q.th)); rlo = Math.min(rlo, q.r); rhi = Math.max(rhi, q.r); });
    var alim = clamp(30 * Math.ceil(deg(amax) / 30), 30, 180);
    rlo = Math.floor(rlo * 4) / 4; rhi = Math.ceil(rhi * 4) / 4;
    function X(t) { return x0 + (t - t0) / SWING_SPAN * (x1 - x0); }
    var rows = [
      { title: 'swing angle θ (°)', lo: -alim, hi: alim, ticks: [-alim, 0, alim], d: 0, get: function (q) { return deg(q.th); }, color: COLOR.orange, wrap: true },
      { title: 'stretch r of the rope (m)', lo: rlo, hi: rhi, ticks: [rlo, 0, rhi], d: 2, get: function (q) { return q.r; }, color: COLOR.ink2 },
      { title: 'neuron output u', lo: -ua, hi: ua, ticks: [-ua, 0, ua], d: 0, get: function (q) { return q.u; }, color: COLOR.neuron }
    ];
    rows.forEach(function (r, k) {
      var y0 = T + k * (H + gap), y1 = y0 + H;
      function Y(v) { return y1 - (v - r.lo) / (r.hi - r.lo) * H; }
      text(ctx, r.title, x0, y0 - 4, { size: 10 });
      ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
      // The zero line, unless it would crowd an end's label.
      r.ticks.filter(function (tk) { return tk !== 0 || (Y(r.lo) - Y(0) > 12 && Y(0) - Y(r.hi) > 12); }).forEach(function (tk) {
        var y = Math.round(Y(tk)) + 0.5;
        polyline(ctx, [[x0, y], [x1, y]]);
        text(ctx, fmt(tk, r.d), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
      });
      frameBox(ctx, x0, y0, x1, y1);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.strokeStyle = r.color; ctx.lineWidth = 1.5;
      var pts = [];
      h.forEach(function (q, i) {
        if (r.wrap && i && Math.abs(q.th - h[i - 1].th) > Math.PI) pts.push(null);
        pts.push([X(q.t), Y(r.get(q))]);
      });
      polyline(ctx, pts);
      ctx.restore();
    });
    text(ctx, 'last 20 s', x1, S.h - 4, { size: 9, align: 'right', color: COLOR.muted });
  };

  /**
   * Where the swing ends up at each gain from the three starts (the outcome scan), and where it is now: the swing's
   * amplitude above, with loops in a band at the top, and the bob's half range below, with the bob's Hopf bifurcation.
   */
  SwingTask.prototype.drawDiagram = function () {
    var S = this.diagram;
    if (!S.ready()) return;
    var ctx = S.begin('#ffffff'), L = 34, R = 8, T = 16, B = 26, gap = 22, p = this.p, sc = this.scan, st = this.state;
    var x0 = L, x1 = S.w - R, H = S.h - T - B - gap, top0 = T, top1 = T + 0.58 * H, bot0 = top1 + gap, bot1 = S.h - B;
    var bmax = 0.5, i;
    sc.dots.forEach(function (d) { if (isFinite(d.bob)) bmax = Math.max(bmax, d.bob); });
    bmax = Math.ceil(bmax * 4) / 4;
    function X(A) { return x0 + A / SCAN_MAX * (x1 - x0); }
    function Yt(a) { return top1 - a / 215 * (top1 - top0); }
    function Yb(b) { return bot1 - b / bmax * (bot1 - bot0); }
    var loopY = Yt(200);

    text(ctx, 'where it ends up: swing amplitude (°)', x0, top0 - 4, { size: 10 });
    ctx.fillStyle = '#efede6';
    ctx.fillRect(x0, Yt(215), x1 - x0, Yt(185) - Yt(215));
    text(ctx, 'loops', x1 - 4, loopY + 3, { size: 9, align: 'right', color: COLOR.muted });
    ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
    [0, 90, 180].forEach(function (a) {
      var y = Math.round(Yt(a)) + 0.5;
      polyline(ctx, [[x0, y], [x1, y]]);
      text(ctx, String(a), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
    });
    text(ctx, 'bob, half the stretch\'s range (m)', x0, bot0 - 4, { size: 10 });
    [0, bmax / 2, bmax].forEach(function (b) {
      var y = Math.round(Yb(b)) + 0.5;
      polyline(ctx, [[x0, y], [x1, y]]);
      text(ctx, fmt(b, 2), x0 - 4, y + 3, { size: 9, align: 'right', color: COLOR.muted });
    });
    for (i = 0; i <= SCAN_MAX; i += 20) {
      var xt = Math.round(X(i)) + 0.5;
      polyline(ctx, [[xt, bot1], [xt, bot1 + 3]]);
      text(ctx, String(i), xt, bot1 + 12, { size: 9, align: 'center', color: COLOR.muted });
    }
    text(ctx, 'gain A', (x0 + x1) / 2, S.h - 3, { size: 9, align: 'center', color: COLOR.muted });
    frameBox(ctx, x0, top0, x1, top1);
    frameBox(ctx, x0, bot0, x1, bot1);

    // The bob's Hopf bifurcation, and the gain now.
    var xh = X(this.hopf.A);
    if (this.hopf.A <= SCAN_MAX) {
      ctx.strokeStyle = COLOR.muted; ctx.setLineDash([2, 3]);
      polyline(ctx, [[xh, bot0], [xh, bot1]]);
      ctx.setLineDash([]);
      text(ctx, 'bobbing starts', xh + 3, bot0 + 10, { size: 9, color: COLOR.muted });
    }
    var xa = X(p.A);
    ctx.strokeStyle = COLOR.ink2; ctx.setLineDash([4, 3]);
    polyline(ctx, [[xa, top0], [xa, top1]]);
    polyline(ctx, [[xa, bot0], [xa, bot1]]);
    ctx.setLineDash([]);

    // The scan's outcomes, the three starts side by side at each gain; a run that flew off is a cross in the band.
    sc.dots.forEach(function (d) {
      var xd = X(d.A) + (d.j - 1) * 2.2, col = START_COLOR[d.start];
      if (d.kind === 'off') {
        ctx.strokeStyle = col; ctx.lineWidth = 1.3;
        polyline(ctx, [[xd - 2.5, loopY - 2.5], [xd + 2.5, loopY + 2.5]]);
        polyline(ctx, [[xd - 2.5, loopY + 2.5], [xd + 2.5, loopY - 2.5]]);
        return;
      }
      disc(ctx, xd, d.kind === 'loop' ? loopY + (d.j - 1) * 3 : Yt(d.amp), 2.1, col);
      disc(ctx, xd, Yb(d.bob), 2.1, col);
    });
    if (sc.next < SCAN_RUNS) text(ctx, 'working it out… ' + Math.round(100 * sc.next / SCAN_RUNS) + '%', x1 - 4, top0 + 12, { size: 9, align: 'right', color: COLOR.muted });

    // The swing now.
    if (st && st.kind !== 'held' && st.kind !== 'off') {
      disc(ctx, xa, st.kind === 'loop' ? loopY : Yt(Math.min(st.amp, 180)), 4.5, '#ffffff', COLOR.ink, 1.6);
      disc(ctx, xa, Yb(Math.min(st.bob, bmax)), 4.5, '#ffffff', COLOR.ink, 1.6);
    }
  };

  // ── Tabs and the animation loop ─────────────────────────────────────────────────────────────────────────────────

  var tasks = {
    approach: new ApproachTask($('#pg-approach', root)),
    walk: new WalkTask($('#pg-walk', root)),
    swing: new SwingTask($('#pg-swing', root)),
    categorize: new CategorizeTask($('#pg-categorize', root))
  };
  var tabs = $$('.pg-task', root), active = null;

  function show(name, focus, chosen) {
    if (!tasks[name] || name === active) return;
    tabs.forEach(function (tab) {
      var on = tab.dataset.task === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    $$('.pg-panel', root).forEach(function (p) { p.hidden = p.dataset.task !== name; });
    if (active) tasks[active].hide();
    active = name;
    tasks[name].show();
    if (chosen && window.history && window.history.replaceState) window.history.replaceState(null, '', '#' + name);
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { show(tab.dataset.task, false, true); });
    tab.addEventListener('keydown', function (e) {
      var k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      show(tabs[(k + tabs.length) % tabs.length].dataset.task, true, true);
      e.preventDefault();
    });
  });

  show(tasks[window.location.hash.slice(1)] ? window.location.hash.slice(1) : 'approach');

  var last = null;
  function loop(ts) {
    var dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
    last = ts;
    tasks[active].frame(dt);
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);
})();
