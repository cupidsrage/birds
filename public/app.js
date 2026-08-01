const root = document.getElementById("root");
let me = null;
let tab = "notes";

const api = {
  async get(p) { const r = await fetch(p); if (!r.ok) throw await r.json().catch(() => ({})); return r.json(); },
  async post(p, b) { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }); if (!r.ok) throw await r.json().catch(() => ({})); return r.json(); },
  async form(p, fd) { const r = await fetch(p, { method: "POST", body: fd }); if (!r.ok) throw await r.json().catch(() => ({})); return r.json(); },
  async del(p) { const r = await fetch(p, { method: "DELETE" }); return r.json(); },
  // For slow endpoints (AI planning): explicit timeout + tolerant error parsing.
  // iOS Safari can abort long fetches silently, so we give it a clear timeout and
  // surface a real message instead of failing blank.
  async postSlow(p, b, ms = 60000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}), signal: ctrl.signal });
      if (!r.ok) {
        // Error body may be JSON or (on a gateway timeout) HTML — handle both.
        const txt = await r.text().catch(() => "");
        let msg = "";
        try { msg = JSON.parse(txt).error; } catch { msg = ""; }
        throw { error: msg || (r.status === 504 ? "That took too long — try again." : `Something went wrong (${r.status}).`) };
      }
      return r.json();
    } catch (e) {
      if (e.name === "AbortError") throw { error: "That took too long on this connection. Try again." };
      throw e.error ? e : { error: "Couldn't reach the server. Check your connection and try again." };
    } finally {
      clearTimeout(timer);
    }
  },
};

const h = (s) => (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Push notifications ----
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "This device doesn't support notifications." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notifications weren't allowed." };
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api.get("/api/push/key");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(key),
  });
  await api.post("/api/push/subscribe", { subscription: sub });
  return { ok: true };
}

async function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function timeLeft(target) {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return { big: "It's time", lbl: "together at last" };
  const d = Math.floor(ms / 86400000);
  const hh = Math.floor((ms % 86400000) / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  if (d >= 1) return { big: `${d}d ${hh}h`, lbl: "until the weekend" };
  return { big: `${hh}h ${mm}m`, lbl: "until we're together" };
}

async function boot() {
  const m = await api.get("/api/me");
  if (!m.name) return renderLogin(m.names);
  me = m;
  renderApp();
  connectEvents();
  setInterval(() => {
    const el = document.querySelector(".countdown");
    if (el) { const t = timeLeft(me.countdownTarget); el.querySelector(".big").textContent = t.big; el.querySelector(".lbl").textContent = t.lbl; }
  }, 30000);
}

// Always-on socket for live app events (attention pings, answers, status).
let eventsSock = null;
function connectEvents() {
  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    eventsSock = new WebSocket(`${proto}://${location.host}/ws/events`);
    eventsSock.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      // "buzz" is the old event name — treat it as a level-2 ping.
      if (msg.t === "attention" || msg.t === "buzz") {
        const level = msg.level || 2;
        // Their app is open — shower the screen, harder the more she held it.
        if (window.FX) FX.burst({ count: level === 3 ? 60 : level === 2 ? 40 : 20, kind: "heart" });
        if (navigator.vibrate) navigator.vibrate(level === 3 ? [60, 40, 60, 40, 140] : [60, 40, 60]);
        showAttentionToast({ from: msg.from, level, id: msg.id });
      } else if (msg.t === "attention-ack") {
        // The answer landing is the whole point — make it visible.
        attn.lastAck = { ack_text: msg.text, ack_at: Date.now() };
        attn.waiting = null;
        renderAttnMeta();
        if (window.FX) FX.burst({ count: 24 });
        if (navigator.vibrate) navigator.vibrate(40);
      } else if (msg.t === "status") {
        attn.partnerStatus = { text: msg.text, until: msg.until };
        renderAttnMeta();
      }
    };
    // Reconnect if the socket drops (backgrounded, network blip, redeploy).
    eventsSock.onclose = () => { setTimeout(connectEvents, 4000); };
    eventsSock.onerror = () => { try { eventsSock.close(); } catch {} };
  } catch {}
}

// Incoming ping. Carries reply buttons so it can be answered without leaving
// whatever tab you're on.
function showAttentionToast({ from, level, id }) {
  let el = document.getElementById("buzz-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "buzz-toast";
    document.body.appendChild(el);
  }
  const label = level === 3 ? `💗 ${from} needs you`
    : level === 1 ? `👋 ${from} says hi`
    : `💭 ${from} is thinking of you`;
  el.innerHTML = `<div class="bt-txt">${h(label)}</div>` + (id ? `
    <div class="bt-acks">
      <button class="small" data-reply="coming">On my way</button>
      <button class="small ghost" data-reply="soon">Give me 5</button>
      <button class="small ghost" data-reply="heart">❤️</button>
    </div>` : "");
  el.classList.toggle("has-acks", !!id);
  el.classList.add("show");
  el.querySelectorAll("[data-reply]").forEach((b) => {
    b.onclick = async () => {
      el.querySelector(".bt-acks").innerHTML = `<span class="bt-sent">Sent 💗</span>`;
      try { await api.post(`/api/attention/${id}/ack`, { reply: b.dataset.reply }); } catch {}
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("show"), 1400);
    };
  });
  clearTimeout(el._t);
  // Leave it up long enough to actually be answered.
  el._t = setTimeout(() => el.classList.remove("show"), id ? 14000 : 3500);
}

/* ---------------- The attention button ---------------- */
// Hold, don't tap — how long you hold picks the intensity. And the answer comes
// back to you, so a ping is never sent into silence.
const HOLD_STEPS = [
  { at: 0, level: 1, label: "👋 Say hi" },
  { at: 900, level: 2, label: "💭 Thinking of you" },
  { at: 2200, level: 3, label: "💗 I need you" },
];
const HOLD_FULL_MS = 3000; // the fill bar tops out here
const attn = { waiting: null, lastAck: null, partnerStatus: null, myStatus: null, week: 0 };

const restLabel = () => `💗 Hold for ${me.partner}`;
const levelFor = (ms) => HOLD_STEPS.reduce((l, s) => (ms >= s.at ? s.level : l), 1);
const stepLabel = (level) => HOLD_STEPS.find((s) => s.level === level).label;

function wireAttention() {
  const btn = document.getElementById("attn");
  if (!btn) return;
  const fill = btn.querySelector(".attn-fill");
  const txt = btn.querySelector(".attn-txt");
  let startedAt = 0, raf = 0, shown = 0, held = false;

  function tick() {
    const ms = Date.now() - startedAt;
    fill.style.width = Math.min(100, (ms / HOLD_FULL_MS) * 100) + "%";
    const l = levelFor(ms);
    if (l !== shown) {
      shown = l;
      txt.textContent = stepLabel(l);
      btn.dataset.level = l;
      if (navigator.vibrate) navigator.vibrate(l === 3 ? [25, 30, 25] : 20); // a tick per step up
    }
    raf = requestAnimationFrame(tick);
  }

  function release(send) {
    if (!held) return;
    held = false;
    cancelAnimationFrame(raf);
    const level = levelFor(Date.now() - startedAt);
    btn.classList.remove("holding");
    fill.style.width = "0%";
    delete btn.dataset.level;
    shown = 0;
    if (send) sendAttention(btn, txt, level);
    else txt.textContent = restLabel();
  }

  btn.addEventListener("pointerdown", (e) => {
    if (btn.disabled || held) return;
    // Capture the pointer so sliding a thumb off the button doesn't drop the hold.
    try { btn.setPointerCapture(e.pointerId); } catch {}
    held = true; startedAt = Date.now(); shown = 0;
    btn.classList.add("holding");
    tick();
  });
  btn.addEventListener("pointerup", () => release(true));
  btn.addEventListener("pointercancel", () => release(false));
  btn.addEventListener("contextmenu", (e) => e.preventDefault()); // long-press menu

  wireStatusForm();
  refreshAttention();
}

async function sendAttention(btn, txt, level) {
  btn.disabled = true;
  const r = btn.getBoundingClientRect();
  if (window.FX) FX.burst({
    x: r.left + r.width / 2, y: r.top + r.height / 2,
    count: level === 3 ? 46 : level === 2 ? 30 : 16,
    kind: level === 1 ? "mixed" : "heart",
  });
  if (navigator.vibrate) navigator.vibrate(level === 3 ? [60, 40, 60, 40, 60] : 60);
  try {
    const sent = await api.post("/api/attention", { level });
    txt.textContent = "Sent 💗";
    attn.lastAck = null;
    if (level >= 2) attn.waiting = { id: sent.id, level, created_at: Date.now() };
    renderAttnMeta();
  } catch {
    txt.textContent = "Couldn't send";
  }
  setTimeout(() => { txt.textContent = restLabel(); btn.disabled = false; }, 1600);
}

function untilLabel(until) {
  if (!until) return "";
  const d = new Date(until);
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return ` til ${hh}:${mm}${d.getHours() < 12 ? "am" : "pm"}`;
}

// One line under the button. Priority: a fresh answer, then waiting, then
// whether they're heads-down, then how often you've reached for each other.
function renderAttnMeta() {
  const el = document.getElementById("attnmeta");
  if (!el || !me) return;
  const fresh = attn.lastAck && Date.now() - attn.lastAck.ack_at < 90000;
  let main, cls = "";
  if (fresh) {
    main = `${me.partner}: ${attn.lastAck.ack_text}`; cls = "ok";
  } else if (attn.waiting) {
    main = `waiting for ${me.partner}…`; cls = "waiting";
  } else if (attn.partnerStatus && attn.partnerStatus.text) {
    main = `${me.partner} is ${attn.partnerStatus.text}${untilLabel(attn.partnerStatus.until)}`; cls = "busy";
  } else if (attn.week > 0) {
    main = `reached for each other ${attn.week}× this week`;
  } else {
    main = "hold longer for “I need you”";
  }
  const mine = attn.myStatus && attn.myStatus.text;
  el.className = `attn-meta ${cls}`;
  el.innerHTML = `<span>${h(main)}</span><button class="attn-set" id="attnset">${mine ? "Change yours" : "Set yours"}</button>`;
  document.getElementById("attnset").onclick = () => {
    const f = document.getElementById("attnform");
    f.hidden = !f.hidden;
    if (!f.hidden) {
      const i = document.getElementById("stext");
      i.value = mine || "";
      i.focus();
    }
  };
}

function wireStatusForm() {
  const form = document.getElementById("attnform");
  if (!form) return;
  const save = async (text, hours) => {
    try {
      const s = await api.post("/api/status", { text, hours });
      attn.myStatus = { text: s.text, until: s.until };
    } catch {}
    form.hidden = true;
    renderAttnMeta();
  };
  document.getElementById("ssave").onclick = () =>
    save(document.getElementById("stext").value, parseFloat(document.getElementById("shours").value));
  document.getElementById("sclear").onclick = () => save("", 0);
}

async function refreshAttention() {
  try {
    const a = await api.get("/api/attention");
    attn.waiting = a.waiting;
    attn.lastAck = a.lastAck;
    attn.week = a.week;
    attn.partnerStatus = a.partnerStatus;
    attn.myStatus = a.myStatus;
  } catch {}
  renderAttnMeta();
}

/* ---------------- Login ---------------- */
function renderLogin() {
  root.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="mark">🌙</div>
        <h1>Weekend</h1>
        <p>Just for the two of us. Enter your passphrase.</p>
        <input id="pass" type="password" placeholder="Passphrase" autocomplete="current-password" />
        <div style="height:12px"></div>
        <button id="go" style="width:100%">Come in</button>
        <div class="err" id="err"></div>
      </div>
    </div>`;
  const go = async () => {
    document.getElementById("err").textContent = "";
    try {
      await api.post("/api/login", { pass: document.getElementById("pass").value });
      boot();
    } catch (e) { document.getElementById("err").textContent = e.error || "Try again."; }
  };
  document.getElementById("go").onclick = go;
  document.getElementById("pass").onkeydown = (e) => { if (e.key === "Enter") go(); };
}

/* ---------------- Shell ---------------- */
const TABS = [
  ["notes", "Love notes"],
  ["deck", "Deck"],
  ["draw", "Draw"],
  ["dates", "Dates"],
  ["inbox", "Inbox"],
  ["desires", "The menu"],
  ["wishes", "Wishlist"],
  ["points", "Points"],
];

function renderApp() {
  const t = timeLeft(me.countdownTarget);
  root.innerHTML = `
    <button class="logout" id="logout">Sign out</button>
    <div class="wrap">
      <div class="top">
        <div class="hi">Hi ${h(me.name)} — ${h(me.partner)} is waiting</div>
        <div class="countdown">
          <div class="big">${t.big}</div>
          <div class="lbl">${t.lbl}</div>
        </div>
        <div class="attn-wrap">
          <button class="attn" id="attn">
            <span class="attn-fill"></span>
            <span class="attn-txt">💗 Hold for ${h(me.partner)}</span>
          </button>
          <div class="attn-meta" id="attnmeta"></div>
          <div class="attn-form" id="attnform" hidden>
            <input id="stext" maxlength="60" placeholder="heads-down til 3…" />
            <div class="row">
              <select id="shours">
                <option value="1">for 1 hour</option>
                <option value="3" selected>for 3 hours</option>
                <option value="8">for 8 hours</option>
                <option value="0">until I clear it</option>
              </select>
              <button class="small" id="ssave">Save</button>
              <button class="small ghost" id="sclear">Clear</button>
            </div>
          </div>
        </div>
      </div>
      <div id="pushbanner"></div>
      <div class="tabs">
        ${TABS.map(([k, l]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${l}${k === "inbox" ? `<span class="badge" id="inboxbadge" hidden></span>` : ""}</button>`).join("")}
      </div>
      <div class="panel" id="panel"></div>
    </div>`;
  document.getElementById("logout").onclick = async () => { await api.post("/api/logout"); location.reload(); };
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderApp(); });
  wireAttention();
  refreshBadge();
  maybeShowPushBanner();
  renderPanel();
}

async function maybeShowPushBanner() {
  const el = document.getElementById("pushbanner");
  if (!el) return;
  if (!(await pushSupported())) return;
  // Already granted and subscribed on the server? Then don't nag.
  if (Notification.permission === "granted") {
    try { const s = await api.get("/api/push/status"); if (s.subscribed) return; } catch {}
  }
  if (Notification.permission === "denied") return; // can't re-prompt; stay quiet
  el.innerHTML = `
    <div class="push-banner">
      <span>Get notified when ${h(me.partner)} sends you something</span>
      <button class="small" id="enablepush">Turn on</button>
    </div>`;
  document.getElementById("enablepush").onclick = async () => {
    const btn = document.getElementById("enablepush");
    btn.disabled = true; btn.textContent = "…";
    const res = await enablePush().catch(() => ({ ok: false, reason: "Something went wrong." }));
    if (res.ok) { el.innerHTML = `<div class="push-banner ok">Notifications are on 🔔</div>`; setTimeout(() => { el.innerHTML = ""; }, 2500); }
    else { el.innerHTML = `<div class="push-banner">${h(res.reason)}</div>`; }
  };
}

async function refreshBadge() {
  try {
    const { unseen } = await api.get("/api/inbox/unseen");
    const el = document.getElementById("inboxbadge");
    if (!el) return;
    if (unseen > 0) { el.textContent = unseen; el.hidden = false; }
    else el.hidden = true;
  } catch {}
}

async function renderPanel() {
  // Tearing down any live canvas connection when leaving the Draw tab.
  if (tab !== "draw" && window.__canvas && window.__canvas.teardown) {
    window.__canvas.teardown();
    window.__canvas = null;
  }
  const p = document.getElementById("panel");
  p.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    if (tab === "notes") return renderNotes(p);
    if (tab === "deck") return renderDeck(p);
    if (tab === "draw") return renderDraw(p);
    if (tab === "dates") return renderDates(p);
    if (tab === "inbox") return renderInbox(p);
    if (tab === "desires") return renderDesires(p);
    if (tab === "wishes") return renderWishes(p);
    if (tab === "points") return renderPoints(p);
  } catch (e) { p.innerHTML = `<div class="empty">${h(e.error) || "Something went wrong."}</div>`; }
}

/* ---------------- Love notes (timed dead drop) ---------------- */
async function renderNotes(p) {
  const notes = await api.get("/api/notes");
  p.innerHTML = `
    <div class="card">
      <h2>Love notes</h2>
      <p class="sub">Leave a note now, or set it to unlock later in the week.</p>
      <div class="stack">
        <textarea id="nb" placeholder="Something for ${h(me.partner)}…"></textarea>
        <div class="row">
          <input id="nu" type="datetime-local" />
          <button id="nsend">Leave it</button>
        </div>
        <div class="err" id="nerr"></div>
      </div>
    </div>
    <div id="nlist"></div>`;
  document.getElementById("nsend").onclick = async () => {
    const body = document.getElementById("nb").value;
    const unlock = document.getElementById("nu").value;
    try {
      await api.post("/api/notes", { body, unlock_at: unlock ? new Date(unlock).toISOString() : null });
      renderPanel();
    } catch (e) { document.getElementById("nerr").textContent = e.error || "Couldn't send."; }
  };
  const list = document.getElementById("nlist");
  if (!notes.length) { list.innerHTML = `<div class="empty">No notes yet. Be the first.</div>`; return; }
  list.innerHTML = notes.map((n) => {
    if (n.body === null) {
      const when = new Date(n.unlock_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
      return `<div class="item"><div class="who">${h(n.author)}</div><div class="body locked">🔒 Unlocks ${h(when)}</div></div>`;
    }
    const tag = n.mine ? "You" : n.author;
    const meta = n.unlocked ? "" : `<div class="meta">visible to you only</div>`;
    return `<div class="item"><div class="who">${h(tag)}</div><div class="body">${h(n.body)}</div>${meta}</div>`;
  }).join("");
}

/* ---------------- Deck ---------------- */
let currentCard = null;
async function renderDeck(p) {
  const answers = await api.get("/api/deck/answers");
  const heat = getHeat();
  p.innerHTML = `
    <div class="card">
      <h2>Draw a card</h2>
      <p class="sub">A fresh question or dare each time. Answer with words, a photo, or both — photos go straight to ${h(me.partner)}'s inbox.</p>
      <div class="heat">
        <div class="heat-row">
          <span class="heat-label">Heat</span>
          <span class="heat-value" id="heatval">${HEAT_NAMES[heat - 1]}</span>
        </div>
        <input id="heat" type="range" min="1" max="5" step="1" value="${heat}" />
        <div class="heat-ticks"><span>😊 mild</span><span>🔥 wild</span></div>
      </div>
      <div class="draw" id="draw"><div class="q">Tap to draw</div></div>
      <div style="height:12px"></div>
      <div class="row"><button id="drawbtn" style="flex:1">Draw a card</button></div>
      <div id="answerbox" style="margin-top:12px"></div>
    </div>
    <div id="alist"></div>`;
  const heatInput = document.getElementById("heat");
  heatInput.oninput = () => {
    setHeat(Number(heatInput.value));
    document.getElementById("heatval").textContent = HEAT_NAMES[Number(heatInput.value) - 1];
  };
  document.getElementById("drawbtn").onclick = drawCard;
  document.getElementById("draw").onclick = drawCard;
  const list = document.getElementById("alist");
  list.innerHTML = answers.length
    ? answers.map((a) => `<div class="item"><div class="who">${h(a.person)} · ${h(a.prompt)}</div><div class="body">${h(a.body)}</div></div>`).join("")
    : `<div class="empty">No answers yet.</div>`;
}

const HEAT_NAMES = ["Sweet", "Flirty", "Spicy", "Steamy", "Wild"];
function getHeat() {
  const v = parseInt(localStorage.getItem("deck_heat"), 10);
  return v >= 1 && v <= 5 ? v : 2;
}
function setHeat(v) { try { localStorage.setItem("deck_heat", String(v)); } catch {} }

async function drawCard() {
  const draw = document.getElementById("draw");
  draw.innerHTML = `<div class="q">Drawing…</div>`;
  currentCard = await api.get(`/api/deck/draw?heat=${getHeat()}`);
  draw.innerHTML = `<div><div class="kind">${currentCard.type}</div><div class="q">${h(currentCard.text)}</div></div>`;
  document.getElementById("answerbox").innerHTML = `
    <textarea id="ab" placeholder="Your answer…"></textarea>
    <div style="height:8px"></div>
    <label class="photo-pick" id="ablabel">
      📷 <span id="abname">Add a photo (optional)</span>
      <input id="af" type="file" accept="image/*" hidden />
    </label>
    <div style="height:8px"></div>
    <button id="asend" style="width:100%">Share answer</button>
    <div class="err" id="aerr"></div>`;
  const fileInput = document.getElementById("af");
  fileInput.onchange = () => {
    document.getElementById("abname").textContent = fileInput.files[0] ? fileInput.files[0].name : "Add a photo (optional)";
  };
  document.getElementById("asend").onclick = async () => {
    const btn = document.getElementById("asend");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const fd = new FormData();
      fd.append("prompt", currentCard.text);
      fd.append("body", document.getElementById("ab").value);
      if (fileInput.files[0]) fd.append("photo", fileInput.files[0]);
      await api.form("/api/deck/answers", fd);
      renderPanel();
    } catch (e) {
      document.getElementById("aerr").textContent = e.error || "Couldn't share.";
      btn.disabled = false; btn.textContent = "Share answer";
    }
  };
}

/* ---------------- Inbox ---------------- */
async function renderInbox(p) {
  const { received, sent } = await api.get("/api/inbox");
  refreshBadge();
  p.innerHTML = `
    <div class="card">
      <h2>Send ${h(me.partner)} something</h2>
      <p class="sub">A photo, a note, or both. Only ${h(me.partner)} will see it.</p>
      <textarea id="ib" placeholder="Say something…"></textarea>
      <div style="height:8px"></div>
      <label class="photo-pick" id="iblabel">
        📷 <span id="ibname">Attach a photo</span>
        <input id="if" type="file" accept="image/*" hidden />
      </label>
      <div style="height:8px"></div>
      <button id="isend" style="width:100%">Send</button>
      <div class="err" id="ierr"></div>
    </div>
    <div class="inbox-tabs">
      <button class="itab on" data-box="received">Received</button>
      <button class="itab" data-box="sent">Sent</button>
    </div>
    <div id="ilist"></div>`;

  const fileInput = document.getElementById("if");
  fileInput.onchange = () => {
    document.getElementById("ibname").textContent = fileInput.files[0] ? fileInput.files[0].name : "Attach a photo";
  };
  document.getElementById("isend").onclick = async () => {
    const btn = document.getElementById("isend");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const fd = new FormData();
      fd.append("body", document.getElementById("ib").value);
      if (fileInput.files[0]) fd.append("photo", fileInput.files[0]);
      await api.form("/api/inbox", fd);
      renderPanel();
    } catch (e) {
      document.getElementById("ierr").textContent = e.error || "Couldn't send.";
      btn.disabled = false; btn.textContent = "Send";
    }
  };

  const boxes = { received, sent };
  const draw = (which) => {
    const msgs = boxes[which];
    const list = document.getElementById("ilist");
    if (!msgs.length) { list.innerHTML = `<div class="empty">${which === "received" ? "Nothing yet." : "You haven't sent anything yet."}</div>`; return; }
    list.innerHTML = msgs.map((m) => {
      const who = which === "received" ? `From ${h(m.sender)}` : `To ${h(m.recipient)}`;
      const when = new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const tag = m.prompt ? `<div class="meta">↳ dare: ${h(m.prompt)}</div>` : "";
      const photo = m.photo ? `<img class="inbox-photo" src="/api/photo/${encodeURIComponent(m.photo)}" alt="photo" loading="lazy" />` : "";
      const body = m.body ? `<div class="body">${h(m.body)}</div>` : "";
      return `<div class="item">
        <div class="who">${who} · ${h(when)}</div>
        ${photo}${body}${tag}
        <div style="margin-top:8px"><button class="small ghost" data-del="${m.id}">delete</button></div>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await api.del(`/api/inbox/${b.dataset.del}`); renderPanel(); });
  };
  draw("received");
  p.querySelectorAll(".itab").forEach((b) => b.onclick = () => {
    p.querySelectorAll(".itab").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    draw(b.dataset.box);
  });
}

/* ---------------- Desire menu ---------------- */
async function renderDesires(p, retried) {
  const d = await api.get("/api/desires");
  // A first load right after a new week can land before generation finishes.
  if (!d.items.length && !retried) {
    p.innerHTML = `
      <div class="card">
        <h2>This week's menu</h2>
        <p class="sub">Fresh every Sunday night.</p>
        <div class="empty">Putting this week's menu together…</div>
      </div>`;
    await new Promise((r) => setTimeout(r, 1500));
    return renderDesires(p, true);
  }
  const matchHtml = d.matches.length
    ? d.matches.map((m) => `
        <div class="match">
          <span class="dot ${m.level}"></span>
          <span style="flex:1">${h(m.item)}</span>
          <button class="small" data-done="${m.id}">done</button>
        </div>`).join("")
    : `<div class="empty">${d.partnerAnswered ? "No overlap yet — keep answering." : `Fill yours in. Matches appear once ${h(me.partner)} answers too.`}</div>`;
  p.innerHTML = `
    <div class="card">
      <h2>This week's menu</h2>
      <p class="sub">Fresh every Sunday night. Answer privately — only the things you <em>both</em> say yes or maybe to are revealed below.</p>
      <div id="menu">
        ${d.items.map((it) => `
          <div class="desire ${it.done ? "done-item" : ""}">
            <div class="t">${h(it.item)}${it.done ? ` <span class="done-tag">✓ done</span>` : ""}</div>
            <div class="choices" data-id="${it.id}">
              ${["yes", "maybe", "no"].map((c) =>
                `<button class="choice ${c} ${it.myAnswer === c ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}
            </div>
          </div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h2>You both want</h2>
      <p class="sub">Check one off once you've done it — it clears from the list.${d.doneCount ? ` <span style="color:var(--rose)">${d.doneCount} done this week 🎉</span>` : ""}</p>
      ${matchHtml}
    </div>`;
  p.querySelectorAll(".choices").forEach((row) => {
    row.querySelectorAll(".choice").forEach((btn) => {
      btn.onclick = async () => {
        const before = d.matches.length;
        await api.post("/api/desires", { id: Number(row.dataset.id), answer: btn.dataset.c });
        // Re-check: if this answer created a new mutual match, celebrate.
        try {
          const after = await api.get("/api/desires");
          if (window.FX && after.matches.length > before) FX.burst({ count: 32 });
        } catch {}
        renderPanel();
      };
    });
  });
  p.querySelectorAll("[data-done]").forEach((b) => b.onclick = async () => {
    await api.post(`/api/desires/${b.dataset.done}/done`);
    renderPanel();
  });
}

/* ---------------- Wishlist ---------------- */
async function renderWishes(p, retried) {
  let wishes = await api.get("/api/wishes");
  // A first load right after a new week can land before generation finishes.
  // Retry once after a short pause before showing an empty state.
  if (!wishes.length && !retried) {
    p.innerHTML = `
      <div class="card">
        <h2>This week's wishlist</h2>
        <p class="sub">A fresh set of date ideas every Sunday night. Tap one off when you've done it together.</p>
        <div class="empty">Putting this week's list together…</div>
      </div>`;
    await new Promise((r) => setTimeout(r, 1500));
    return renderWishes(p, true);
  }
  p.innerHTML = `
    <div class="card">
      <h2>This week's wishlist</h2>
      <p class="sub">A fresh set of date ideas every Sunday night. Tap one off when you've done it together.</p>
      <div id="wlist"></div>
    </div>`;
  const list = document.getElementById("wlist");
  if (!wishes.length) {
    list.innerHTML = `<div class="empty">Couldn't load this week's list.<br><button class="small" id="wretry" style="margin-top:10px">Try again</button></div>`;
    document.getElementById("wretry").onclick = () => renderPanel();
    return;
  }
  list.innerHTML = wishes.map((w) => `
    <div class="item">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">
        <div class="body ${w.done ? "done" : ""}" style="flex:1">${h(w.body)}</div>
        <button class="small ${w.done ? "ghost" : ""}" data-toggle="${w.id}">${w.done ? "undo" : "done"}</button>
      </div>
    </div>`).join("");
  list.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = async () => { await api.post(`/api/wishes/${b.dataset.toggle}/toggle`); renderPanel(); });
}

/* ---------------- Draw (live shared canvas) ---------------- */
const PALETTE = ["#e08a9e", "#e8c39e", "#7bc99a", "#8ec5e0", "#c9a0e0", "#ffffff", "#1a1220"];

async function renderDraw(p) {
  const drawings = await api.get("/api/drawings");
  p.innerHTML = `
    <div class="card">
      <h2>Draw together</h2>
      <p class="sub">Draw with your finger — <span id="presence">connecting…</span>. Save a drawing to keep it in your gallery below.</p>
      <div class="canvas-wrap">
        <canvas id="canvas"></canvas>
      </div>
      <div class="tools">
        <div class="swatches" id="swatches">
          ${PALETTE.map((c, i) => `<button class="swatch ${i === 0 ? "on" : ""}" style="background:${c}" data-color="${c}"></button>`).join("")}
        </div>
        <div class="tool-row">
          <input id="brush" type="range" min="1" max="40" value="5" />
          <button class="small tool-btn" id="eraser">Eraser</button>
          <button class="small tool-btn" id="clear">Clear</button>
          <button class="small" id="save">Save</button>
        </div>
      </div>
      <div class="err" id="drawerr"></div>
    </div>
    <div class="card">
      <h2>Gallery</h2>
      <p class="sub">Drawings you've saved together.</p>
      <div id="gallery"></div>
    </div>`;

  renderGallery(drawings);
  setupCanvas();
}

function renderGallery(drawings) {
  const g = document.getElementById("gallery");
  if (!g) return;
  g.innerHTML = drawings.length
    ? `<div class="gallery-grid">${drawings.map((d) => `
        <div class="gitem">
          <img src="/api/photo/${encodeURIComponent(d.photo)}" loading="lazy" alt="drawing by ${h(d.author)}" />
          <button class="gdel" data-del="${d.id}">✕</button>
        </div>`).join("")}</div>`
    : `<div class="empty">No saved drawings yet.</div>`;
  g.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    await api.del(`/api/drawings/${b.dataset.del}`);
    renderGallery(await api.get("/api/drawings"));
  });
}

function setupCanvas() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  let color = PALETTE[0];
  let size = 5;
  let erasing = false;
  let drawing = false;
  let last = null;

  // Size the canvas to its container at device resolution for crisp lines.
  function fit() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Preserve what's drawn across a resize.
    const prev = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * dpr); // square canvas
    canvas.style.height = rect.width + "px";
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (prev) ctx.putImageData(prev, 0, 0);
  }
  fit();

  // Coordinates are stored normalized (0..1) so both phones render the same
  // drawing regardless of screen size.
  function norm(e) {
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    return { x: (pt.clientX - rect.left) / rect.width, y: (pt.clientY - rect.top) / rect.height };
  }
  function drawSeg(s, remote) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const hh = canvas.height / (window.devicePixelRatio || 1);
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(s.x0 * w, s.y0 * hh);
    ctx.lineTo(s.x1 * w, s.y1 * hh);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- WebSocket ----
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/canvas`);
  const presence = document.getElementById("presence");
  ws.onopen = () => { if (presence) presence.textContent = "connected"; };
  ws.onclose = () => { if (presence) presence.textContent = "offline"; };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === "init") {
      msg.strokes.forEach((s) => drawSeg(s, true));
    } else if (msg.t === "stroke") {
      drawSeg(msg, true);
    } else if (msg.t === "clear") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (msg.t === "presence") {
      if (presence) presence.textContent = msg.online >= 2 ? `${h(me.partner)} is here too` : "just you right now";
    }
  };
  const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  // ---- Pointer handling ----
  function start(e) { e.preventDefault(); drawing = true; last = norm(e); }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const pt = norm(e);
    const seg = { t: "stroke", x0: last.x, y0: last.y, x1: pt.x, y1: pt.y, color, size, erase: erasing };
    drawSeg(seg, false);
    send(seg);
    last = pt;
  }
  function end() { drawing = false; last = null; }

  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  // ---- Tools ----
  document.getElementById("swatches").querySelectorAll(".swatch").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".swatch").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    color = b.dataset.color;
    erasing = false;
    document.getElementById("eraser").classList.remove("on");
  });
  document.getElementById("brush").oninput = (e) => { size = Number(e.target.value); };
  document.getElementById("eraser").onclick = (e) => {
    erasing = !erasing;
    e.target.classList.toggle("on", erasing);
  };
  document.getElementById("clear").onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    send({ t: "clear" });
  };
  document.getElementById("save").onclick = async () => {
    const btn = document.getElementById("save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const image = canvas.toDataURL("image/png");
      await api.post("/api/drawings", { image });
      if (window.FX) FX.burst({ count: 24 });
      renderGallery(await api.get("/api/drawings"));
    } catch (e) {
      document.getElementById("drawerr").textContent = e.error || "Couldn't save.";
    } finally { btn.disabled = false; btn.textContent = "Save"; }
  };

  const onResize = () => fit();
  window.addEventListener("resize", onResize);

  // Expose teardown so leaving the tab closes the socket.
  window.__canvas = { teardown() { try { ws.close(); } catch {} window.removeEventListener("resize", onResize); } };
}

/* ---------------- Date planner ---------------- */
const VIBE_OPTIONS = [
  ["romantic", "💕 Romantic"],
  ["adventurous", "🧗 Adventurous"],
  ["chill", "😌 Chill"],
  ["foodie", "🍽️ Foodie"],
  ["cultural", "🎭 Cultural"],
  ["fun", "🎉 Fun"],
];
let lastPlan = null; // holds the most recent generated plan + inputs

async function renderDates(p) {
  const saved = await api.get("/api/date/plans");
  p.innerHTML = `
    <div class="card">
      <h2>Plan a date</h2>
      <p class="sub">Tell me where and when — I'll plan the whole thing.</p>
      <div class="stack">
        <input id="dcity" placeholder="City (e.g. Little Rock, AR)" />
        <div class="row">
          <input id="ddate" type="date" />
          <input id="dtime" type="time" value="18:00" />
        </div>
        <div class="row">
          <select id="ddur">
            <option value="2">2 hours</option>
            <option value="3">3 hours</option>
            <option value="4" selected>4 hours</option>
            <option value="6">6 hours</option>
            <option value="8">All day</option>
          </select>
          <select id="dvibe">
            ${VIBE_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
          </select>
        </div>
        <div class="budget-field">
          <span class="budget-prefix">$</span>
          <input id="dbudget" type="number" min="0" step="10" placeholder="Budget for two (optional)" />
        </div>
        <button id="dplan">Plan our date</button>
        <div class="err" id="derr"></div>
      </div>
    </div>
    <div id="dresult"></div>
    <div class="card">
      <h2>Saved dates</h2>
      <div id="dsaved"></div>
    </div>`;

  document.getElementById("dplan").onclick = planDateNow;
  renderSavedPlans(saved);
}

async function planDateNow() {
  const city = document.getElementById("dcity").value.trim();
  const err = document.getElementById("derr");
  err.textContent = "";
  if (!city) { err.textContent = "Where should the date be?"; return; }
  const btn = document.getElementById("dplan");
  btn.disabled = true; btn.textContent = "Planning… (this takes a few seconds)";
  const inputs = {
    city,
    date: document.getElementById("ddate").value || "this weekend",
    time: fmtTime(document.getElementById("dtime").value),
    duration: document.getElementById("ddur").value,
    vibe: document.getElementById("dvibe").value,
    budget: document.getElementById("dbudget").value || null,
  };
  try {
    const plan = await api.postSlow("/api/date/plan", inputs);
    lastPlan = { inputs, plan };
    renderPlanResult(plan);
  } catch (e) {
    err.textContent = e.error || "Couldn't plan the date. Try again.";
  } finally {
    btn.disabled = false; btn.textContent = "Plan our date";
  }
}

function fmtTime(v) {
  if (!v) return "6:00 PM";
  const [hh, mm] = v.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function renderPlanResult(plan) {
  const el = document.getElementById("dresult");
  if (!el) return;
  const money = (n) => (n === 0 ? "Free" : `$${n}`);
  const totalLine = plan.totalCost != null
    ? `<div class="cost-total ${plan.overBudget ? "over" : ""}">
         Estimated total: <strong>$${plan.totalCost}</strong> for two${plan.budget ? ` · budget $${plan.budget}${plan.overBudget ? " (a bit over)" : " ✓"}` : ""}
       </div>`
    : "";
  el.innerHTML = `
    <div class="card plan">
      <h2>${h(plan.title || "Your date")}</h2>
      ${plan.narrative ? `<p class="sub">${h(plan.narrative)}</p>` : ""}
      ${totalLine}
      <div class="timeline">
        ${(plan.stops || []).map((s) => `
          <div class="stop">
            <div class="stop-time">${h(s.arrival || "")}</div>
            <div class="stop-body">
              <div class="stop-name">${h(s.name || "")}${s.rating ? ` <span class="stop-rating">★ ${s.rating}</span>` : ""}${s.cost != null ? ` <span class="stop-cost">${money(s.cost)}</span>` : ""}</div>
              ${s.why ? `<div class="stop-why">${h(s.why)}</div>` : ""}
              ${s.address ? `<div class="stop-meta">${h(s.address)}</div>` : ""}
              ${s.hours && s.hours.length ? `<details class="stop-hours"><summary>Hours</summary>${s.hours.map((d) => `<div>${h(d)}</div>`).join("")}</details>` : ""}
              ${s.mapsUrl ? `<a class="stop-map" href="${h(s.mapsUrl)}" target="_blank" rel="noopener">Open in Maps →</a>` : ""}
            </div>
          </div>`).join("")}
      </div>
      <div class="row" style="margin-top:14px">
        <button id="dsave" style="flex:1">Save this date</button>
        <button class="ghost" id="dredo">Redo</button>
      </div>
      ${plan.usedRealPlaces === false ? `<div class="stop-meta" style="margin-top:8px">Tip: add a Google Places key for live ratings & hours.</div>` : ""}
    </div>`;
  document.getElementById("dsave").onclick = async () => {
    const btn = document.getElementById("dsave");
    btn.disabled = true; btn.textContent = "Saved ✓";
    try {
      await api.post("/api/date/plans", { ...lastPlan.inputs, plan });
      if (window.FX) FX.burst({ count: 20 });
      renderSavedPlans(await api.get("/api/date/plans"));
    } catch { btn.disabled = false; btn.textContent = "Save this date"; }
  };
  document.getElementById("dredo").onclick = planDateNow;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSavedPlans(saved) {
  const el = document.getElementById("dsaved");
  if (!el) return;
  if (!saved.length) { el.innerHTML = `<div class="empty">No saved dates yet.</div>`; return; }
  el.innerHTML = saved.map((s) => `
    <div class="item">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <div class="who">${h(s.plan.title || s.city)}</div>
        <button class="small ghost" data-del="${s.id}">✕</button>
      </div>
      <div class="stop-meta">${h(s.city)}${s.date ? ` · ${h(s.date)}` : ""} · by ${h(s.author)}</div>
      <div class="body" style="margin-top:6px">${(s.plan.stops || []).map((x) => h(x.name)).filter(Boolean).join(" → ")}</div>
    </div>`).join("");
  el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    await api.del(`/api/date/plans/${b.dataset.del}`);
    renderSavedPlans(await api.get("/api/date/plans"));
  });
}

/* ---------------- Points ---------------- */
async function renderPoints(p) {
  const d = await api.get("/api/points");
  p.innerHTML = `
    <div class="card">
      <h2>Points</h2>
      <p class="sub">Give ${h(me.partner)} points for the little things they do. Cash them in this weekend.</p>
      <div class="score">
        <div class="p"><div class="n">${d.me.total}</div><div class="who">${h(d.me.name)} (you)</div></div>
        <div class="p"><div class="n">${d.partner.total}</div><div class="who">${h(d.partner.name)}</div></div>
      </div>
      <div style="height:14px"></div>
      <div class="row">
        <input id="pr" placeholder="What did ${h(me.partner)} do? (good-morning text…)" />
        <input id="pd" type="number" value="1" style="max-width:74px" />
      </div>
      <div style="height:8px"></div>
      <button id="padd" style="width:100%">Give ${h(me.partner)} points</button>
      <div class="err" id="perr"></div>
    </div>
    <div id="plist"></div>`;
  document.getElementById("padd").onclick = async () => {
    try {
      await api.post("/api/points", { reason: document.getElementById("pr").value, delta: document.getElementById("pd").value });
      renderPanel();
    } catch (e) { document.getElementById("perr").textContent = e.error || "Couldn't add."; }
  };
  const list = document.getElementById("plist");
  list.innerHTML = d.log.length ? d.log.map((l) => {
    // fromMe true = you gave it to partner; false = partner gave it to you; null = legacy row
    const label = l.fromMe === true ? `You → ${h(l.person)}`
      : l.fromMe === false ? `${h(l.giver)} → you`
      : `${h(l.person)}`;
    return `<div class="item"><div class="who">${label} · ${l.delta > 0 ? "+" : ""}${l.delta}</div><div class="body">${h(l.reason)}</div></div>`;
  }).join("") : `<div class="empty">No points given yet.</div>`;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    // Check for updates whenever the app regains focus, so a redeploy is picked
    // up promptly rather than only on a cold start.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});

  // When a new service worker takes over (a new deploy), reload once so the
  // fresh HTML/JS/CSS is used immediately — no manual hard refresh needed.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
boot();
