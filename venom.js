(() => {
  'use strict';

  const btn = document.querySelector('.venom-btn');
  const canvas = document.getElementById('venom');
  const ctx = canvas.getContext('2d');

  const TAU = Math.PI * 2;
  const STEP = 1000 / 60;
  const INK = '#050506';
  const GLOSS = 'rgba(255, 255, 255, 0.17)';
  const BASE_W = 268;
  const STRANDS = 12;
  const NODES = 16;
  const ATTACH = 75;
  const RELEASE = 160;
  const NEAR = 260;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (v, lag) => clamp((v - lag) / (1 - lag), 0, 1);

  let dpr = 1;
  let vw = 0;
  let vh = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  const ptr = { x: -1e4, y: -1e4, on: false };
  const track = (e) => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.on = true;
  };
  const lose = () => {
    ptr.on = false;
  };
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  window.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && lose());
  window.addEventListener('pointercancel', lose);
  window.addEventListener('blur', lose);
  document.addEventListener('mouseout', (e) => !e.relatedTarget && lose());

  // Button capsule geometry; perimeter parameter u runs clockwise from the top-left of the straight edge.
  const g = { cx: 0, cy: 0, w: 1, h: 1, r: 1, hl: 0, P: 1, s: 1, top: 0, bottom: 0, left: 0 };
  function measure() {
    const b = btn.getBoundingClientRect();
    g.w = b.width;
    g.h = b.height;
    g.r = b.height / 2;
    g.hl = Math.max(0, b.width / 2 - g.r);
    g.cx = b.left + b.width / 2;
    g.cy = b.top + b.height / 2;
    g.top = b.top;
    g.bottom = b.bottom;
    g.left = b.left;
    g.P = 4 * g.hl + TAU * g.r;
    g.s = b.width / BASE_W;
  }

  function pointAt(u, o) {
    u = ((u % g.P) + g.P) % g.P;
    const { cx, cy, hl, r } = g;
    if (u < 2 * hl) return set(o, cx - hl + u, cy - r, 0, -1);
    u -= 2 * hl;
    if (u < Math.PI * r) {
      const a = -Math.PI / 2 + u / r;
      return set(o, cx + hl + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a));
    }
    u -= Math.PI * r;
    if (u < 2 * hl) return set(o, cx + hl - u, cy + r, 0, 1);
    u -= 2 * hl;
    const a = Math.PI / 2 + u / r;
    return set(o, cx - hl + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a));
  }
  function set(o, x, y, nx, ny) {
    o.x = x;
    o.y = y;
    o.nx = nx;
    o.ny = ny;
    return o;
  }

  let side = -1;
  function targetU(x, y) {
    const dx = x - g.cx;
    const dy = y - g.cy;
    if (Math.abs(dx) <= g.hl) {
      if (Math.abs(dy) > g.r) side = dy < 0 ? -1 : 1;
      else if (dy < -g.h * 0.12) side = -1;
      else if (dy > g.h * 0.12) side = 1;
      return side < 0 ? dx + g.hl : 2 * g.hl + Math.PI * g.r + (g.hl - dx);
    }
    if (dx > 0) {
      const a = clamp(Math.atan2(dy, dx - g.hl), -Math.PI / 2, Math.PI / 2);
      return 2 * g.hl + (a + Math.PI / 2) * g.r;
    }
    let a = Math.atan2(dy, dx + g.hl);
    if (a < 0) a += TAU;
    a = clamp(a, Math.PI / 2, Math.PI * 1.5);
    return 4 * g.hl + Math.PI * g.r + (a - Math.PI / 2) * g.r;
  }

  function edgeDist(x, y) {
    const qx = clamp(x - g.cx, -g.hl, g.hl);
    return Math.hypot(x - g.cx - qx, y - g.cy) - g.r;
  }

  function wrapDiff(a, b) {
    const P = g.P;
    return ((((b - a) % P) + P * 1.5) % P) - P / 2;
  }

  // ---------- goo features ----------

  const strands = Array.from({ length: STRANDS }, (_, i) => ({
    nodes: Array.from({ length: NODES }, () => ({ x: 0, y: 0, px: 0, py: 0 })),
    state: 0, // 0 idle, 1 reaching, 2 attached, 3 retracting
    off: (((i + 0.5) / STRANDS) * 2 - 1) * rand(0.7, 1.05),
    delay: 0,
    reach: rand(0.8, 1.3),
    w0: rand(3, 4.6),
    tb: rand(0.35, 0.75),
    jx: rand(-3, 3),
    jy: rand(-3, 3),
    curl: Math.random() < 0.5 ? -1 : 1,
    ph: rand(0, TAU),
    u: 0,
    L: 0,
    tx: 0,
    ty: 0,
    bx: 0,
    by: 0,
    nx: 0,
    ny: -1,
    cool: 0,
  }));
  strands
    .map((s) => s)
    .sort(() => Math.random() - 0.5)
    .forEach((s, rank) => {
      s.delay = rank * 38 + rand(0, 25);
    });

  const spikes = [
    { f: 0.24, h: 16, lean: -0.55, hook: 0.8, w: 2 },
    { f: 0.33, h: 7, lean: 0.25, hook: 0, w: 1.5 },
    { f: 0.42, h: 22, lean: -0.6, hook: 1, w: 2.2 },
    { f: 0.47, h: 9, lean: 0.35, hook: 0.3, w: 1.5 },
    { f: 0.56, h: 44, lean: -0.06, hook: 0, w: 2.5 },
    { f: 0.645, h: 24, lean: -0.5, hook: 0.9, w: 2 },
    { f: 0.7, h: 38, lean: 0.2, hook: 0.2, w: 2.4 },
    { f: 0.75, h: 12, lean: 0.65, hook: 1, w: 1.7 },
  ].map((o) => ({ ...o, a: 0, ph: rand(0, TAU), ph2: rand(0, TAU), rate: rand(0.035, 0.11), lag: rand(0, 0.35) }));

  const drips = [
    { f: 0.27, len: 21, r: 2.9 },
    { f: 0.63, len: 19, r: 2.7 },
  ].map((o) => ({ ...o, a: 0, ph: rand(0, TAU), rate: rand(0.03, 0.06) }));

  const nubs = Array.from({ length: 16 }, (_, i) => ({
    f: rand(0.15, 0.85),
    top: i % 3 !== 0,
    r: rand(1.4, 3.4),
    ph: rand(0, TAU),
    lag: rand(0, 0.5),
  }));

  const specks = Array.from({ length: 22 }, () => ({
    f: rand(0.12, 0.9),
    y: rand(0.2, 0.42),
    r: rand(1, 3.2),
    ph: rand(0, TAU),
    light: Math.random() < 0.55,
    lag: rand(0, 0.6),
  }));

  // ---------- simulation ----------

  let act = 0;
  let simT = 0;
  let time = 0;
  let engageT = -1;
  const tmp = { x: 0, y: 0, nx: 0, ny: 0 };

  function update() {
    simT += STEP;
    time = simT / 1000;
    const on = ptr.on;
    const d = on ? edgeDist(ptr.x, ptr.y) : Infinity;
    if (d < ATTACH * g.s) {
      if (engageT < 0) engageT = simT;
    } else if (d > RELEASE * g.s) engageT = -1;
    const inZone = engageT >= 0;
    const tu = on ? targetU(ptr.x, ptr.y) : 0;

    let live = 0;
    for (const s of strands) {
      stepStrand(s, on, inZone, tu);
      if (s.state === 1 || s.state === 2) live++;
    }

    let target = d <= 0 ? 1 : clamp(1 - d / (NEAR * g.s), 0, 1);
    if (live) target = Math.max(target, 0.85);
    act += (target - act) * (target > act ? 0.06 : 0.03);
    for (const k of spikes) k.a += (ramp(act, k.lag) - k.a) * k.rate;
    for (const k of drips) k.a += (act - k.a) * k.rate;
  }

  function release(s) {
    if (s.state === 1 || s.state === 2) {
      s.state = 3;
      s.cool = simT + 180;
    }
  }

  function setBase(s) {
    pointAt(s.u, tmp);
    s.nx = tmp.nx;
    s.ny = tmp.ny;
    s.bx = tmp.x - tmp.nx * 2 * g.s;
    s.by = tmp.y - tmp.ny * 2 * g.s;
  }

  function stepStrand(s, on, inZone, tu) {
    const n = s.nodes;
    const spread = s.off * g.w * 0.2;
    if (s.state === 0) {
      if (!(on && inZone && simT >= s.cool && simT - engageT >= s.delay)) return;
      s.u = tu + spread;
      setBase(s);
      for (const p of n) {
        p.x = p.px = s.bx;
        p.y = p.py = s.by;
      }
      s.tx = s.bx;
      s.ty = s.by;
      s.L = 0;
      s.state = 1;
    }

    if (s.state !== 3) {
      if (!on) release(s);
      else {
        const du = wrapDiff(s.u, tu + spread);
        if (Math.abs(du) > g.P * 0.22) release(s);
        else s.u += du * 0.14;
      }
    }
    setBase(s);

    const px = ptr.x + s.jx * g.s;
    const py = ptr.y + s.jy * g.s;
    if (s.state === 1) {
      const dx = px - s.tx;
      const dy = py - s.ty;
      const d = Math.hypot(dx, dy);
      const sp = Math.max(d * 0.3, 10 * g.s);
      if (d <= sp) {
        s.tx = px;
        s.ty = py;
        s.state = 2;
      } else {
        s.tx += (dx / d) * sp;
        s.ty += (dy / d) * sp;
      }
      s.L = Math.hypot(s.tx - s.bx, s.ty - s.by) * 1.03;
    } else if (s.state === 2) {
      s.tx = px;
      s.ty = py;
      const d = Math.hypot(px - s.bx, py - s.by);
      s.L += (d - s.L) * (d > s.L ? 0.65 : 0.03);
    }
    if ((s.state === 1 || s.state === 2) && Math.hypot(ptr.x - s.bx, ptr.y - s.by) > s.reach * g.w) release(s);

    if (s.state === 3) {
      s.L = s.L * 0.9 - 1.4 * g.s;
      if (s.L <= 1) {
        s.state = 0;
        s.L = 0;
        return;
      }
    }
    simulate(s);
  }

  function simulate(s) {
    const n = s.nodes;
    const tip = n[NODES - 1];
    const pinned = s.state !== 3;
    const seg = Math.max(s.L, 0.01) / (NODES - 1);
    const span = Math.hypot(s.tx - s.bx, s.ty - s.by) + 1;
    const slack = s.state === 2 ? clamp(s.L / span - 1, 0, 1) : 0;
    const damp = s.state === 3 ? 0.84 : 0.9;
    const wob = (s.state === 3 ? 0.5 : 0.03 + slack * 0.35) * g.s;
    const curl = (s.state === 3 ? 0.55 : 0.02) * g.s * s.curl;

    for (let k = 1; k < NODES; k++) {
      if (pinned && k === NODES - 1) break;
      const p = n[k];
      const q = n[k - 1];
      let vx = (p.x - p.px) * damp;
      let vy = (p.y - p.py) * damp;
      p.px = p.x;
      p.py = p.y;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dl = Math.hypot(dx, dy) || 1;
      const t = k / (NODES - 1);
      const f = (Math.sin(time * 3.2 + k * 0.8 + s.ph) * wob + curl) * t;
      vx += (-dy / dl) * f;
      vy += (dx / dl) * f + 0.015 * g.s;
      p.x += vx;
      p.y += vy;
    }

    n[0].x = n[0].px = s.bx;
    n[0].y = n[0].py = s.by;
    if (pinned) {
      tip.px = tip.x;
      tip.py = tip.y;
      tip.x = s.tx;
      tip.y = s.ty;
    }

    for (let it = 0; it < 14; it++) {
      for (let k = 0; k < NODES - 1; k++) {
        const a = n[k];
        const b = n[k + 1];
        const wa = k === 0 ? 0 : 1;
        const wb = pinned && k + 1 === NODES - 1 ? 0 : 1;
        const sw = wa + wb;
        if (!sw) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const c = (d - seg) / d / sw;
        a.x += dx * c * wa;
        a.y += dy * c * wa;
        b.x -= dx * c * wb;
        b.y -= dy * c * wb;
      }
      const e = n[1];
      e.x += (s.bx + s.nx * seg - e.x) * 0.35;
      e.y += (s.by + s.ny * seg - e.y) * 0.35;
    }
  }

  // ---------- drawing ----------

  function capsulePath() {
    ctx.beginPath();
    ctx.moveTo(g.cx - g.hl, g.top);
    ctx.lineTo(g.cx + g.hl, g.top);
    ctx.arc(g.cx + g.hl, g.cy, g.r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(g.cx - g.hl, g.bottom);
    ctx.arc(g.cx - g.hl, g.cy, g.r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }

  // Concave fillet so a feature grows out of the edge like a viscous blob instead of a hard joint.
  function root(x, y, nx, ny, w) {
    const tx = -ny;
    const ty = nx;
    ctx.beginPath();
    ctx.moveTo(x + tx * w * 2.4 - nx, y + ty * w * 2.4 - ny);
    ctx.quadraticCurveTo(x + tx * w, y + ty * w, x + tx * w * 0.8 + nx * w * 1.6, y + ty * w * 0.8 + ny * w * 1.6);
    ctx.lineTo(x - tx * w * 0.8 + nx * w * 1.6, y - ty * w * 0.8 + ny * w * 1.6);
    ctx.quadraticCurveTo(x - tx * w, y - ty * w, x - tx * w * 2.4 - nx, y - ty * w * 2.4 - ny);
    ctx.closePath();
    ctx.fill();
  }

  function taper(pts, wf, gloss) {
    const m = pts.length - 1;
    for (let pass = 0; pass < (gloss ? 2 : 1); pass++) {
      if (pass) {
        ctx.strokeStyle = GLOSS;
        ctx.lineWidth = 0.7 * g.s;
      }
      for (let k = 1; k < m; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const c = pts[k + 1];
        const w = wf((k - 1) / Math.max(m - 2, 1));
        let ox = 0;
        let oy = 0;
        if (pass) {
          if (w < 2.2 * g.s) continue;
          ox = -w * 0.2;
          oy = -w * 0.28;
        } else ctx.lineWidth = w;
        const sx = k === 1 ? a.x : (a.x + b.x) / 2;
        const sy = k === 1 ? a.y : (a.y + b.y) / 2;
        const ex = k === m - 1 ? c.x : (b.x + c.x) / 2;
        const ey = k === m - 1 ? c.y : (b.y + c.y) / 2;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + oy);
        ctx.quadraticCurveTo(b.x + ox, b.y + oy, ex + ox, ey + oy);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = INK;
  }

  const curve = Array.from({ length: 11 }, () => ({ x: 0, y: 0 }));
  function cubic(x0, y0, x1, y1, x2, y2, x3, y3) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      curve[i].x = a * x0 + b * x1 + c * x2 + d * x3;
      curve[i].y = a * y0 + b * y1 + c * y2 + d * y3;
    }
    return curve;
  }

  function along(n, dist, o) {
    let acc = 0;
    for (let k = 1; k < n.length; k++) {
      const a = n[k - 1];
      const b = n[k];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + d >= dist) {
        const t = d ? (dist - acc) / d : 0;
        o.x = a.x + (b.x - a.x) * t;
        o.y = a.y + (b.y - a.y) * t;
        return o;
      }
      acc += d;
    }
    const l = n[n.length - 1];
    o.x = l.x;
    o.y = l.y;
    return o;
  }

  function drawSurface() {
    ctx.save();
    capsulePath();
    ctx.clip();
    for (const p of specks) {
      const a = ramp(act, p.lag);
      if (a <= 0) continue;
      const x = g.left + (p.f + Math.sin(time * 0.9 + p.ph) * 0.015) * g.w;
      const y = g.top + (p.y + Math.sin(time * 1.3 + p.ph * 2) * 0.03) * g.h;
      const r = p.r * g.s * a * (0.8 + 0.2 * Math.sin(time * 4 + p.ph));
      ctx.fillStyle = p.light ? `rgba(225, 225, 232, ${0.32 * a})` : `rgba(5, 5, 6, ${0.9 * a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    for (const s of strands) {
      if (!s.state) continue;
      const k = clamp(s.L / (30 * g.s), 0, 1);
      ctx.beginPath();
      ctx.arc(s.bx - s.nx * 2 * g.s, s.by - s.ny * 2 * g.s, 4.5 * g.s * k, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNubs() {
    for (const b of nubs) {
      const a = ramp(act, b.lag);
      if (a <= 0) continue;
      const r = b.r * g.s * a * (0.75 + 0.25 * Math.sin(time * 3 + b.ph));
      ctx.beginPath();
      ctx.arc(g.left + b.f * g.w, b.top ? g.top + 1 : g.bottom - 1, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawDrips() {
    for (const d of drips) {
      if (d.a < 0.01) continue;
      const x = g.left + d.f * g.w;
      const y = g.bottom - 1.5 * g.s;
      const len = d.len * g.s * d.a * (0.9 + 0.1 * Math.sin(time * 2 + d.ph));
      const sway = Math.sin(time * 1.6 + d.ph) * 1.5 * g.s;
      root(x, g.bottom, 0, 1, 1.4 * g.s * Math.min(1, d.a * 1.5));
      const pts = cubic(x, y, x, y + len * 0.4, x + sway, y + len * 0.7, x + sway, y + len);
      taper(pts, (t) => lerp(2.6, 1.5, t) * g.s, false);
      ctx.beginPath();
      ctx.arc(x + sway, y + len, d.r * g.s * Math.min(1, d.a * 1.3), 0, TAU);
      ctx.fill();
    }
  }

  function drawSpikes() {
    const near = ptr.on ? clamp(1 - edgeDist(ptr.x, ptr.y) / (NEAR * g.s), 0, 1) : 0;
    for (const k of spikes) {
      if (k.a < 0.01) continue;
      const x = g.left + k.f * g.w;
      const y = g.top + 1.5 * g.s;
      const h = k.h * g.s * k.a * (0.82 + 0.18 * Math.sin(time * 2.4 + k.ph));
      const lean =
        k.lean + 0.14 * Math.sin(time * 1.8 + k.ph2) + clamp((ptr.x - x) / (220 * g.s), -1, 1) * 0.3 * near;
      const hook = k.hook * (0.8 + 0.2 * Math.sin(time * 2 + k.ph));
      const w = k.w * g.s * Math.min(1, 0.45 + k.a);
      root(x, g.top, 0, -1, w);
      const pts = cubic(
        x,
        y,
        x,
        y - h * 0.5,
        x + lean * h * (1 + 0.55 * hook),
        y - h * (1 + 0.06 * hook),
        x + lean * h,
        y - h * (1 - 0.2 * hook)
      );
      taper(pts, (t) => lerp(w * 2, 0.6 * g.s, t), true);
    }
  }

  const wa = { x: 0, y: 0 };
  const wb = { x: 0, y: 0 };
  const wc = { x: 0, y: 0 };
  const wd = { x: 0, y: 0 };
  function drawWebs() {
    const live = strands.filter((s) => s.state === 1 || s.state === 2).sort((a, b) => a.off - b.off);
    for (let i = 1; i < live.length; i++) {
      const A = live[i - 1];
      const B = live[i];
      if (Math.abs(wrapDiff(A.u, B.u)) > 0.07 * g.w) continue;
      const dm = Math.min(9 * g.s, A.L * 0.3, B.L * 0.3);
      if (dm < 2) continue;
      along(A.nodes, dm, wa);
      along(B.nodes, dm, wb);
      along(A.nodes, dm * 0.45, wc);
      along(B.nodes, dm * 0.45, wd);
      ctx.beginPath();
      ctx.moveTo(A.nodes[0].x, A.nodes[0].y);
      ctx.lineTo(wa.x, wa.y);
      ctx.quadraticCurveTo((wc.x + wd.x) / 2, (wc.y + wd.y) / 2, wb.x, wb.y);
      ctx.lineTo(B.nodes[0].x, B.nodes[0].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawStrand(s) {
    const n = s.nodes;
    const stretch = clamp((s.L - 110 * g.s) / (220 * g.s), 0, 1);
    const fade = s.state === 3 ? clamp(s.L / (50 * g.s), 0.3, 1) : clamp(s.L / (20 * g.s), 0.4, 1);
    const w0 = s.w0 * g.s * fade * (1 - 0.35 * stretch);
    const w1 = Math.max(1.1 * g.s * (1 - 0.3 * stretch), 0.8);
    const bead = 0.9 * stretch;
    root(s.bx + s.nx * 2 * g.s, s.by + s.ny * 2 * g.s, s.nx, s.ny, w0 * 0.6);
    taper(n, (t) => lerp(w0, w1, Math.pow(t, 0.6)) * (1 + bead * Math.exp(-((t - s.tb) ** 2) / 0.004)), true);
    if (s.state === 3) {
      const tip = n[NODES - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 1.7 * g.s * fade + 0.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawGlob() {
    let x = 0;
    let y = 0;
    let c = 0;
    for (const s of strands) {
      if (s.state !== 2) continue;
      const tip = s.nodes[NODES - 1];
      x += tip.x;
      y += tip.y;
      c++;
    }
    if (!c) return;
    ctx.beginPath();
    ctx.arc(x / c, y / c, (1.6 + Math.min(c, 10) * 0.3) * g.s * (1 + 0.08 * Math.sin(time * 6)), 0, TAU);
    ctx.fill();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (act < 0.003 && !strands.some((s) => s.state)) return;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawSurface();
    drawNubs();
    drawDrips();
    drawSpikes();
    drawWebs();
    for (const s of strands) if (s.state) drawStrand(s);
    drawGlob();
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc = Math.min(acc + (now - last), 250);
    last = now;
    measure();
    while (acc >= STEP) {
      update();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  measure();
  requestAnimationFrame(frame);
})();
