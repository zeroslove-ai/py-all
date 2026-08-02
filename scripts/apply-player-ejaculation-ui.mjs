import fs from 'node:fs';

const indexPath = new URL('../pages/index.html', import.meta.url);
const sidebarPath = new URL('../pages/sidebar.js', import.meta.url);

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

let index = fs.readFileSync(indexPath, 'utf8');
index = replaceOnce(
  index,
  `    .player-inner-thought { color: var(--text-primary); font-size: .85rem; line-height: 1.55; white-space: pre-wrap; }`,
  `    .player-inner-thought { color: var(--text-primary); font-size: .85rem; line-height: 1.55; white-space: pre-wrap; }\n    .player-ejaculation-gauge { display: grid; gap: 6px; margin-top: 7px; }\n    .player-ejaculation-gauge-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: .78rem; }\n    .player-ejaculation-gauge-label { color: var(--text-secondary); font-weight: 700; }\n    .player-ejaculation-gauge-value { color: var(--text-primary); font-variant-numeric: tabular-nums; font-weight: 800; }\n    .player-ejaculation-gauge-track { position: relative; height: 10px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid var(--border); box-shadow: inset 0 1px 3px rgba(0,0,0,.45); }\n    .player-ejaculation-gauge-fill { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #f472b6 78%, #fff 100%); box-shadow: 0 0 10px rgba(244,114,182,.45); transition: width .35s ease; }\n    .player-ejaculation-gauge-threshold { position: absolute; top: -2px; bottom: -2px; left: 50%; width: 2px; background: rgba(255,255,255,.65); box-shadow: 0 0 5px rgba(255,255,255,.4); }\n    .player-ejaculation-gauge.ready .player-ejaculation-gauge-value { color: #f9a8d4; }\n    .player-ejaculation-gauge.max .player-ejaculation-gauge-fill { animation: ejaculationGaugePulse 1.1s ease-in-out infinite alternate; }\n    @keyframes ejaculationGaugePulse { from { filter: brightness(1); } to { filter: brightness(1.45); box-shadow: 0 0 16px rgba(255,255,255,.75); } }`,
  'insert ejaculation gauge CSS'
);
fs.writeFileSync(indexPath, index);

let sidebar = fs.readFileSync(sidebarPath, 'utf8');
sidebar = replaceOnce(
  sidebar,
  `        <div class="player-card-world" id="player-info-world"></div>`,
  `        <div class="player-card-world" id="player-info-world"></div>\n        <div class="player-ejaculation-gauge" id="player-ejaculation-gauge" aria-label="플레이어 사정 게이지">\n          <div class="player-ejaculation-gauge-head"><span class="player-ejaculation-gauge-label">💦 사정 게이지</span><span class="player-ejaculation-gauge-value" id="player-ejaculation-gauge-value">0/100 · 아직 사정 불가</span></div>\n          <div class="player-ejaculation-gauge-track"><div class="player-ejaculation-gauge-fill" id="player-ejaculation-gauge-fill"></div><div class="player-ejaculation-gauge-threshold" title="50부터 사정 가능"></div></div>\n        </div>`,
  'insert ejaculation gauge markup'
);
sidebar = replaceOnce(
  sidebar,
  `    const worldEl = document.getElementById('player-info-world');\n    if (worldEl) {\n      worldEl.textContent = worldParts.join('  ');\n      worldEl.style.display = worldParts.length ? '' : 'none';\n    }`,
  `    const worldEl = document.getElementById('player-info-world');\n    if (worldEl) {\n      worldEl.textContent = worldParts.join('  ');\n      worldEl.style.display = worldParts.length ? '' : 'none';\n    }\n\n    const rawMeter = Number(save?.player_sexual_state?.ejaculation_meter);\n    const meter = Number.isFinite(rawMeter) ? Math.max(0, Math.min(100, Math.round(rawMeter))) : 0;\n    const ready = meter >= 50;\n    const gauge = document.getElementById('player-ejaculation-gauge');\n    const gaugeValue = document.getElementById('player-ejaculation-gauge-value');\n    const gaugeFill = document.getElementById('player-ejaculation-gauge-fill');\n    if (gauge) {\n      gauge.classList.toggle('ready', ready);\n      gauge.classList.toggle('max', meter >= 100);\n    }\n    if (gaugeValue) gaugeValue.textContent = meter + '/100 · ' + (ready ? '사정 가능' : '아직 사정 불가');\n    if (gaugeFill) gaugeFill.style.width = meter + '%';`,
  'render ejaculation gauge from save state'
);
fs.writeFileSync(sidebarPath, sidebar);

console.log('PLAYER_EJACULATION_UI_PATCH_APPLIED');
