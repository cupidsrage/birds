/* Ambient background animations for Weekend.
 * - A daily-rotating theme (hearts / glow / sparkles / combined).
 * - Celebratory bursts on special moments via FX.burst().
 * Pure canvas + CSS. Sits behind all content, respects reduced-motion.
 */
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Layers: a CSS glow div (soft shifting light) + a canvas (particles).
  const glow = document.createElement("div");
  glow.id = "fx-glow";
  const canvas = document.createElement("canvas");
  canvas.id = "fx-canvas";
  const ctx = canvas.getContext("2d");

  let dpr = window.devicePixelRatio || 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }

  // Theme selection: deterministic by date so it changes once per day.
  const THEMES = ["hearts", "glow", "sparkles", "combined"];
  function themeForToday() {
    const d = new Date();
    const key = d.getFullYear() * 1000 + (d.getMonth() + 1) * 40 + d.getDate();
    return THEMES[key % THEMES.length];
  }

  const COLORS = ["#e08a9e", "#e8c39e", "#c9a0e0", "#8ec5e0", "#f3e9ef"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Particle model. kind: "heart" | "spark"
  const particles = [];
  function spawnAmbient(kind) {
    const x = rand(0, innerWidth);
    particles.push({
      kind,
      x,
      y: innerHeight + 20,
      vx: rand(-0.15, 0.15),
      vy: rand(-0.35, -0.9),
      size: kind === "heart" ? rand(9, 20) : rand(1.5, 3.5),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.01, 0.01),
      color: pick(COLORS),
      life: 1,
      decay: rand(0.0012, 0.0028),
      twinkle: Math.random() * Math.PI * 2,
      ambient: true,
    });
  }

  function drawHeart(p) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.scale(dpr, dpr);
    ctx.globalAlpha = 0.55 * p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    // Simple heart via two arcs + a point.
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(0, 0, -s * 0.5, 0, -s * 0.5, s * 0.3);
    ctx.bezierCurveTo(-s * 0.5, s * 0.6, 0, s * 0.75, 0, s);
    ctx.bezierCurveTo(0, s * 0.75, s * 0.5, s * 0.6, s * 0.5, s * 0.3);
    ctx.bezierCurveTo(s * 0.5, 0, 0, 0, 0, s * 0.3);
    ctx.fill();
    ctx.restore();
  }

  function drawSpark(p) {
    ctx.save();
    ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(p.twinkle))) * p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * dpr, p.y * dpr, p.size * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  let theme = themeForToday();
  let running = false;
  let ambientTimer = 0;

  function ambientEvery() {
    // How often to emit ambient particles, by theme.
    if (theme === "hearts") return 900;
    if (theme === "sparkles") return 350;
    if (theme === "combined") return 550;
    return 100000; // glow theme: no particles, just the light
  }

  let lastEmit = 0;
  function frame(t) {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (theme !== "glow" && !reduceMotion) {
      if (t - lastEmit > ambientEvery()) {
        lastEmit = t;
        if (theme === "hearts") spawnAmbient("heart");
        else if (theme === "sparkles") spawnAmbient("spark");
        else if (theme === "combined") spawnAmbient(Math.random() < 0.5 ? "heart" : "spark");
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * (p.ambient ? 1 : 6);
      p.y += p.vy * (p.ambient ? 1 : 6);
      if (!p.ambient) p.vy += 0.06; // burst particles arc and fall
      p.rot += p.vr;
      p.twinkle += 0.15;
      p.life -= p.decay * (p.ambient ? 1 : 3);
      if (p.life <= 0 || p.y < -40) { particles.splice(i, 1); continue; }
      if (p.kind === "heart") drawHeart(p); else drawSpark(p);
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    resize();
    running = true;
    requestAnimationFrame(frame);
  }

  // A celebratory burst from a point (defaults to screen center-top).
  function burst(opts = {}) {
    if (reduceMotion) return;
    const cx = opts.x != null ? opts.x : innerWidth / 2;
    const cy = opts.y != null ? opts.y : innerHeight * 0.35;
    const n = opts.count || 26;
    const kind = opts.kind || "mixed";
    for (let i = 0; i < n; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(0.6, 2.2);
      const k = kind === "mixed" ? (Math.random() < 0.6 ? "heart" : "spark") : kind;
      particles.push({
        kind: k,
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(0.2, 1),
        size: k === "heart" ? rand(10, 22) : rand(2, 4),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.05, 0.05),
        color: pick(COLORS),
        life: 1,
        decay: rand(0.006, 0.012),
        twinkle: Math.random() * Math.PI * 2,
        ambient: false,
      });
    }
    if (!running) start();
  }

  function mount() {
    document.body.prepend(canvas);
    document.body.prepend(glow);
    glow.dataset.theme = theme;
    canvas.dataset.theme = theme;
    resize();
    if (!reduceMotion) start();
  }

  addEventListener("resize", resize);

  // Public API
  window.FX = {
    theme,
    burst,
    setTheme(t) { theme = t; glow.dataset.theme = t; },
    mount,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
