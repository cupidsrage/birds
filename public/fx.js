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
    const isHeart = kind === "heart";
    particles.push({
      kind,
      x,
      y: innerHeight + 20,
      vx: rand(-0.2, 0.2),
      // Both hearts and sparks rise fast enough to cross the whole screen.
      // Sparks are a touch slower and smaller, but still reach the top.
      vy: isHeart ? rand(-1.1, -1.9) : rand(-0.9, -1.5),
      size: isHeart ? rand(9, 20) : rand(1.5, 3.5),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.01, 0.01),
      color: pick(COLORS),
      life: 1,
      // Near-zero time-decay for both — the position-based fade (ambientAlpha)
      // handles visibility, so particles stay lit across their whole climb.
      decay: 0.0004,
      twinkle: Math.random() * Math.PI * 2,
      sway: rand(0, Math.PI * 2),   // gentle horizontal drift
      swaySpeed: rand(0.005, 0.02),
      ambient: true,
    });
  }

  // How visible an ambient particle is, based on where it is on screen: it
  // eases in near the bottom and eases out only in the very top slice, so the
  // most-visible upper area still has hearts in it.
  function ambientAlpha(p) {
    const yn = p.y / innerHeight; // 1 at bottom, 0 at top
    let a = 1;
    if (yn > 0.92) a = (1 - yn) / 0.08;        // fade in over the bottom 8%
    else if (yn < 0.12) a = yn / 0.12;          // fade out over the top 12%
    return Math.max(0, Math.min(1, a)) * p.life;
  }

  function drawHeart(p) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.scale(dpr, dpr);
    ctx.globalAlpha = 0.6 * (p.ambient ? ambientAlpha(p) : p.life);
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
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(p.twinkle));
    ctx.globalAlpha = twinkle * (p.ambient ? ambientAlpha(p) : p.life);
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
      if (p.ambient) {
        p.sway += p.swaySpeed;
        p.x += p.vx + Math.sin(p.sway) * 0.3; // drift left/right as it rises
        p.y += p.vy;
      } else {
        p.x += p.vx * 6;
        p.y += p.vy * 6;
        p.vy += 0.06; // burst particles arc and fall
      }
      p.rot += p.vr;
      p.twinkle += 0.15;
      p.life -= p.decay * (p.ambient ? 1 : 3);
      // Remove only once fully off the top or life exhausted.
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
