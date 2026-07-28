const root = document.getElementById("root");
let me = null;
let tab = "notes";

const api = {
  async get(p) { const r = await fetch(p); if (!r.ok) throw await r.json().catch(() => ({})); return r.json(); },
  async post(p, b) { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }); if (!r.ok) throw await r.json().catch(() => ({})); return r.json(); },
  async del(p) { const r = await fetch(p, { method: "DELETE" }); return r.json(); },
};

const h = (s) => (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  setInterval(() => {
    const el = document.querySelector(".countdown");
    if (el) { const t = timeLeft(me.countdownTarget); el.querySelector(".big").textContent = t.big; el.querySelector(".lbl").textContent = t.lbl; }
  }, 30000);
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
      </div>
      <div class="tabs">
        ${TABS.map(([k, l]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}
      </div>
      <div class="panel" id="panel"></div>
    </div>`;
  document.getElementById("logout").onclick = async () => { await api.post("/api/logout"); location.reload(); };
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderApp(); });
  renderPanel();
}

async function renderPanel() {
  const p = document.getElementById("panel");
  p.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    if (tab === "notes") return renderNotes(p);
    if (tab === "deck") return renderDeck(p);
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
  p.innerHTML = `
    <div class="card">
      <h2>Draw a card</h2>
      <p class="sub">A question or a dare. Answer it, and ${h(me.partner)} sees it too.</p>
      <div class="draw" id="draw"><div class="q">Tap to draw</div></div>
      <div style="height:12px"></div>
      <div class="row"><button id="drawbtn" style="flex:1">Draw a card</button></div>
      <div id="answerbox" style="margin-top:12px"></div>
    </div>
    <div id="alist"></div>`;
  document.getElementById("drawbtn").onclick = drawCard;
  document.getElementById("draw").onclick = drawCard;
  const list = document.getElementById("alist");
  list.innerHTML = answers.length
    ? answers.map((a) => `<div class="item"><div class="who">${h(a.person)} · ${h(a.prompt)}</div><div class="body">${h(a.body)}</div></div>`).join("")
    : `<div class="empty">No answers yet.</div>`;
}
async function drawCard() {
  currentCard = await api.get("/api/deck/draw");
  document.getElementById("draw").innerHTML =
    `<div><div class="kind">${currentCard.type}</div><div class="q">${h(currentCard.text)}</div></div>`;
  document.getElementById("answerbox").innerHTML = `
    <textarea id="ab" placeholder="Your answer…"></textarea>
    <div style="height:8px"></div>
    <button id="asend" style="width:100%">Share answer</button>
    <div class="err" id="aerr"></div>`;
  document.getElementById("asend").onclick = async () => {
    try {
      await api.post("/api/deck/answers", { prompt: currentCard.text, body: document.getElementById("ab").value });
      renderPanel();
    } catch (e) { document.getElementById("aerr").textContent = e.error || "Couldn't share."; }
  };
}

/* ---------------- Desire menu ---------------- */
async function renderDesires(p) {
  const d = await api.get("/api/desires");
  const matchHtml = d.matches.length
    ? d.matches.map((m) => `<div class="match"><span class="dot ${m.level}"></span><span>${h(m.item)}</span></div>`).join("")
    : `<div class="empty">${d.partnerAnswered ? "No overlap yet — keep answering." : `Fill yours in. Matches appear once ${h(me.partner)} answers too.`}</div>`;
  p.innerHTML = `
    <div class="card">
      <h2>The menu</h2>
      <p class="sub">Answer privately. Only the things you <em>both</em> say yes or maybe to are revealed.</p>
      <div id="menu">
        ${d.items.map((it, i) => `
          <div class="desire">
            <div class="t">${h(it.item)}</div>
            <div class="choices" data-item="${h(it.item)}">
              ${["yes", "maybe", "no"].map((c) =>
                `<button class="choice ${c} ${it.myAnswer === c ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}
            </div>
          </div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h2>You both want</h2>
      <p class="sub">Your shared list for this weekend.</p>
      ${matchHtml}
    </div>`;
  p.querySelectorAll(".choices").forEach((row) => {
    row.querySelectorAll(".choice").forEach((btn) => {
      btn.onclick = async () => {
        await api.post("/api/desires", { item: row.dataset.item, answer: btn.dataset.c });
        renderPanel();
      };
    });
  });
}

/* ---------------- Wishlist ---------------- */
async function renderWishes(p) {
  const wishes = await api.get("/api/wishes");
  p.innerHTML = `
    <div class="card">
      <h2>Wishlist</h2>
      <p class="sub">Things to do together — add anything, big or small.</p>
      <div class="row">
        <input id="wb" placeholder="Add an idea…" />
        <button id="wadd">Add</button>
      </div>
      <div class="err" id="werr"></div>
    </div>
    <div id="wlist"></div>`;
  document.getElementById("wadd").onclick = async () => {
    try { await api.post("/api/wishes", { body: document.getElementById("wb").value }); renderPanel(); }
    catch (e) { document.getElementById("werr").textContent = e.error || "Couldn't add."; }
  };
  document.getElementById("wb").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("wadd").click(); };
  const list = document.getElementById("wlist");
  list.innerHTML = wishes.length ? wishes.map((w) => `
    <div class="item">
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">
        <div class="body ${w.done ? "done" : ""}" style="flex:1">${h(w.body)}</div>
        <button class="small ghost" data-toggle="${w.id}">${w.done ? "undo" : "done"}</button>
        <button class="small ghost" data-del="${w.id}">✕</button>
      </div>
      <div class="meta">by ${h(w.author)}</div>
    </div>`).join("") : `<div class="empty">Nothing on the list yet.</div>`;
  list.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = async () => { await api.post(`/api/wishes/${b.dataset.toggle}/toggle`); renderPanel(); });
  list.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await api.del(`/api/wishes/${b.dataset.del}`); renderPanel(); });
}

/* ---------------- Points ---------------- */
async function renderPoints(p) {
  const d = await api.get("/api/points");
  p.innerHTML = `
    <div class="card">
      <h2>Points</h2>
      <p class="sub">Earn points for the little things. Cash them in this weekend.</p>
      <div class="score">
        <div class="p"><div class="n">${d.me.total}</div><div class="who">${h(d.me.name)} (you)</div></div>
        <div class="p"><div class="n">${d.partner.total}</div><div class="who">${h(d.partner.name)}</div></div>
      </div>
      <div style="height:14px"></div>
      <div class="row">
        <input id="pr" placeholder="For what? (good-morning text…)" />
        <input id="pd" type="number" value="1" style="max-width:74px" />
      </div>
      <div style="height:8px"></div>
      <button id="padd" style="width:100%">Add to your score</button>
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
  list.innerHTML = d.log.length ? d.log.map((l) => `
    <div class="item"><div class="who">${h(l.person)} · ${l.delta > 0 ? "+" : ""}${l.delta}</div><div class="body">${h(l.reason)}</div></div>
  `).join("") : `<div class="empty">No points logged yet.</div>`;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
