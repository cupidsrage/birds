:root {
  --ink: #1a1220;
  --ink-2: #241830;
  --card: #2b1d38;
  --card-2: #34233f;
  --line: #453252;
  --rose: #e08a9e;
  --rose-deep: #c96a82;
  --gold: #e8c39e;
  --text: #f3e9ef;
  --muted: #b39cb0;
  --yes: #7bc99a;
  --maybe: #e8c39e;
  --no: #8a7690;
  --shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background:
    radial-gradient(120% 80% at 50% -10%, #2a1a30 0%, var(--ink) 55%) fixed;
  color: var(--text);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

.wrap { max-width: 560px; margin: 0 auto; padding: 0 18px 120px; }

/* ---- Login ---- */
.login {
  min-height: 100vh; display: grid; place-items: center; padding: 24px;
}
.login-card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 26px; padding: 40px 30px; width: 100%; max-width: 380px;
  box-shadow: var(--shadow); text-align: center;
}
.mark { font-size: 46px; line-height: 1; }
.login-card h1 {
  font-family: var(--serif); font-weight: 500; font-size: 34px;
  margin: 14px 0 4px; letter-spacing: 0.5px;
}
.login-card p { color: var(--muted); margin: 0 0 26px; font-size: 15px; }

input, textarea, select {
  width: 100%; background: var(--ink-2); color: var(--text);
  border: 1px solid var(--line); border-radius: 14px;
  padding: 13px 15px; font-size: 16px; font-family: inherit;
}
input:focus, textarea:focus, select:focus {
  outline: 2px solid var(--rose); outline-offset: 1px; border-color: transparent;
}
textarea { resize: vertical; min-height: 84px; }

button {
  font-family: inherit; cursor: pointer; border: none;
  border-radius: 14px; font-size: 15px; font-weight: 600;
  padding: 13px 18px; color: var(--ink);
  background: linear-gradient(180deg, var(--rose), var(--rose-deep));
  transition: transform 0.08s ease, filter 0.15s ease;
}
button:hover { filter: brightness(1.06); }
button:active { transform: translateY(1px); }
button.ghost {
  background: transparent; color: var(--rose); border: 1px solid var(--line);
}
button.small { padding: 8px 12px; font-size: 13px; border-radius: 10px; }

.err { color: #ff9db0; font-size: 14px; min-height: 20px; margin-top: 10px; }

/* ---- Header + countdown ---- */
.top { padding: 30px 0 8px; text-align: center; }
.top .hi { color: var(--muted); font-size: 14px; letter-spacing: 0.4px; }
.countdown {
  font-family: var(--serif); margin-top: 6px;
}
.countdown .big {
  font-size: 58px; font-weight: 500; line-height: 1.05;
  background: linear-gradient(180deg, var(--rose) 0%, var(--gold) 120%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.countdown .lbl { color: var(--muted); font-size: 14px; font-family: var(--sans); }
.logout {
  position: absolute; top: 16px; right: 18px;
  background: none; color: var(--muted); border: 1px solid var(--line);
  padding: 6px 12px; font-size: 12px; border-radius: 20px;
}

/* ---- Tabs ---- */
.tabs {
  display: flex; gap: 6px; overflow-x: auto; padding: 18px 0 4px;
  scrollbar-width: none; -ms-overflow-style: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 0 0 auto; background: transparent; color: var(--muted);
  border: 1px solid transparent; padding: 9px 15px; border-radius: 22px;
  font-weight: 600; font-size: 14px;
}
.tab.on { background: var(--card); color: var(--text); border-color: var(--line); }

/* ---- Cards ---- */
.panel { margin-top: 14px; animation: rise 0.35s ease; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 20px; padding: 18px; margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.card h2 {
  font-family: var(--serif); font-weight: 500; font-size: 22px; margin: 0 0 4px;
}
.card .sub { color: var(--muted); font-size: 14px; margin: 0 0 14px; }
.row { display: flex; gap: 8px; }
.row > input, .row > select { flex: 1; }
.stack > * + * { margin-top: 10px; }

.item {
  background: var(--card-2); border: 1px solid var(--line);
  border-radius: 14px; padding: 13px 15px; margin-top: 10px;
}
.item .who { font-size: 12px; color: var(--rose); font-weight: 700; letter-spacing: 0.3px; }
.item .body { margin-top: 4px; line-height: 1.5; }
.item .meta { font-size: 12px; color: var(--muted); margin-top: 6px; }
.locked { color: var(--muted); font-style: italic; }
.done { opacity: 0.5; text-decoration: line-through; }

.empty { color: var(--muted); text-align: center; padding: 24px 10px; font-size: 14px; }

/* Desire menu */
.desire {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line);
}
.desire:last-child { border-bottom: none; }
.desire .t { flex: 1; font-size: 15px; line-height: 1.35; }
.choices { display: flex; gap: 6px; }
.choice {
  padding: 7px 11px; border-radius: 10px; font-size: 12px; font-weight: 700;
  background: var(--ink-2); color: var(--muted); border: 1px solid var(--line);
}
.choice.yes.on { background: var(--yes); color: #10231a; border-color: transparent; }
.choice.maybe.on { background: var(--maybe); color: #2c2110; border-color: transparent; }
.choice.no.on { background: var(--no); color: #fff; border-color: transparent; }

.match {
  display: flex; align-items: center; gap: 10px;
  background: var(--card-2); border: 1px solid var(--line);
  border-radius: 12px; padding: 11px 14px; margin-top: 8px;
}
.match .dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.match .dot.yes { background: var(--yes); }
.match .dot.maybe { background: var(--maybe); }

/* Points */
.score { display: flex; gap: 10px; }
.score .p {
  flex: 1; text-align: center; background: var(--card-2);
  border: 1px solid var(--line); border-radius: 16px; padding: 16px;
}
.score .p .n { font-family: var(--serif); font-size: 40px; color: var(--rose); }
.score .p .who { color: var(--muted); font-size: 13px; }

/* Deck card */
.draw {
  min-height: 150px; display: grid; place-items: center; text-align: center;
  background: linear-gradient(160deg, var(--card-2), var(--card));
  border: 1px solid var(--line); border-radius: 18px; padding: 26px;
}
.draw .kind {
  font-size: 12px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--gold); margin-bottom: 10px;
}
.draw .q { font-family: var(--serif); font-size: 22px; line-height: 1.4; }
