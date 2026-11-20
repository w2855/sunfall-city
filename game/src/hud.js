// Sunfall City — the heads-up display, built into #hud by initHud(): five wanted stars, a
// cash counter, a health bar and a mode line top-right; a 210x210 minimap bottom-left that
// draws the road grid around the player; an objective line and a toast feed bottom-centre;
// a big fading banner across the middle; and a crosshair for armed aim. The stylesheet
// comes with the module, since #hud is an empty div in the page.
let els = null;
let mapLines = [];
let bannerTimer = 0;

const STAR_COUNT = 5;
const MAP_VIEW = 150; // metres from the player shown across half the minimap

const HUD_CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; user-select: none;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #eceaf6; }
.hud-status { position: absolute; top: 18px; right: 22px; display: flex; flex-direction: column;
  align-items: flex-end; gap: 7px; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.75); }
#stars { font-size: 21px; letter-spacing: 7px; color: rgba(236, 234, 246, 0.18); }
#stars .lit { color: #ffd166; text-shadow: 0 0 14px rgba(255, 209, 102, 0.6); }
#cash { font-size: 24px; font-weight: 800; letter-spacing: 1px; color: #06d6a0; }
.bar { width: 190px; height: 10px; border-radius: 6px; overflow: hidden;
  background: rgba(10, 8, 20, 0.66); border: 1px solid rgba(236, 234, 246, 0.25); }
#health { height: 100%; width: 100%; background: #06d6a0;
  transition: width 0.2s ease, background 0.2s ease; }
#mode { font-size: 11px; letter-spacing: 2.5px; color: #b7b3cf; }
#minimap { position: absolute; left: 20px; bottom: 20px; border-radius: 10px;
  border: 1px solid rgba(236, 234, 246, 0.3); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.55); }
#feed { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; }
.toast { background: rgba(13, 10, 26, 0.85); border: 1px solid rgba(255, 209, 102, 0.45);
  color: #ffd166; font-size: 12px; letter-spacing: 1.5px; padding: 7px 16px; border-radius: 999px;
  transition: opacity 0.7s ease, transform 0.7s ease; }
.toast.gone { opacity: 0; transform: translateY(10px); }
#objective { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%);
  font-size: 13px; letter-spacing: 2px; white-space: nowrap; padding: 9px 20px;
  color: #eceaf6; background: rgba(13, 10, 26, 0.72);
  border: 1px solid rgba(236, 234, 246, 0.22); border-radius: 999px; }
#banner { position: absolute; left: 0; right: 0; top: 36%; text-align: center; opacity: 0;
  font-size: clamp(36px, 6vw, 66px); font-weight: 800; letter-spacing: 12px; color: #ffd166;
  text-shadow: 0 0 36px rgba(255, 209, 102, 0.45), 0 6px 18px rgba(0, 0, 0, 0.65);
  transition: opacity 0.45s ease; }
#banner.show { opacity: 1; }
#crosshair { position: absolute; left: 50%; top: 50%; width: 16px; height: 16px;
  transform: translate(-50%, -50%); display: none; }
#crosshair::before { content: ''; position: absolute; left: 7px; top: 0; width: 2px; height: 16px;
  background: rgba(255, 255, 255, 0.85); }
#crosshair::after { content: ''; position: absolute; top: 7px; left: 0; width: 16px; height: 2px;
  background: rgba(255, 255, 255, 0.85); }
`;

/** Build every HUD element — and its stylesheet — into #hud once. */
export function initHud() {
  const hud = document.getElementById('hud');

  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  document.head.appendChild(style);

  const status = document.createElement('div');
  status.className = 'hud-status';

  const stars = document.createElement('div');
  stars.id = 'stars';
  const starEls = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    stars.appendChild(s);
    starEls.push(s);
  }

  const cash = document.createElement('div');
  cash.id = 'cash';
  cash.textContent = '$0';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const health = document.createElement('div');
  health.id = 'health';
  bar.appendChild(health);

  const mode = document.createElement('div');
  mode.id = 'mode';

  status.append(stars, cash, bar, mode);

  const minimap = document.createElement('canvas');
  minimap.id = 'minimap';
  minimap.width = 210;
  minimap.height = 210;

  const feed = document.createElement('div');
  feed.id = 'feed';

  const objective = document.createElement('div');
  objective.id = 'objective';

  const bannerEl = document.createElement('div');
  bannerEl.id = 'banner';

  const crosshair = document.createElement('div');
  crosshair.id = 'crosshair';

  hud.append(status, minimap, feed, objective, bannerEl, crosshair);

  els = { starEls, cash, health, mode, minimap, feed, objective, bannerEl, crosshair, ctx2d: minimap.getContext('2d') };
}

/** A short line in the bottom-centre feed; the oldest scrolls out past four. */
export function toast(text) {
  if (!els) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  els.feed.appendChild(t);
  while (els.feed.children.length > 4) els.feed.removeChild(els.feed.firstChild);
  setTimeout(() => t.classList.add('gone'), 3800);
  setTimeout(() => t.remove(), 4500);
}

/** A big fading banner across the middle of the screen for `seconds`. */
export function banner(text, seconds = 3) {
  if (!els) return;
  els.bannerEl.textContent = text;
  els.bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => els.bannerEl.classList.remove('show'), seconds * 1000);
}

export function setObjective(text) {
  if (els) els.objective.textContent = text;
}

/** The road-line coordinates ({ axis, at } records) the minimap draws around the player. */
export function cacheMinimapGrid(lines) {
  mapLines = Array.isArray(lines) ? lines.slice() : [];
}

/** Refresh stars, cash, health, mode, crosshair and the whole minimap. */
export function updateHud(state, cops, peds, worldHalf, blips = []) {
  if (!els) return;
  els.starEls.forEach((s, i) => s.classList.toggle('lit', i < state.wanted));
  els.cash.textContent = '$' + Math.max(0, Math.round(state.money));
  const hp = Math.max(0, Math.min(100, state.health));
  els.health.style.width = hp + '%';
  els.health.style.background = hp > 35 ? '#06d6a0' : '#ef476f';
  els.mode.textContent = !state.alive
    ? 'WASTED'
    : state.car
      ? 'DRIVING'
      : state.armed
        ? 'ON FOOT · ARMED'
        : 'ON FOOT';
  els.crosshair.style.display = state.armed && !state.car ? 'block' : 'none';
  drawMinimap(state, cops, peds, worldHalf, blips);
}

/** The road grid around the player, plus cruisers, the blip, pedestrians and the player. */
function drawMinimap(state, cops, peds, worldHalf, blips) {
  const c = els.ctx2d;
  const size = 210;
  const half = size / 2;
  const scale = half / MAP_VIEW; // minimap pixels per metre
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  const X = (v) => half + (v - px) * scale;
  const Y = (v) => half + (v - pz) * scale;

  c.clearRect(0, 0, size, size);
  c.fillStyle = 'rgba(13, 10, 24, 0.92)';
  c.fillRect(0, 0, size, size);

  // The road grid: one band per cached line, clipped to the view.
  c.strokeStyle = '#454b60';
  c.lineWidth = Math.max(2, 14 * scale);
  c.beginPath();
  for (const l of mapLines) {
    if (l.axis === 'h') {
      const y = Y(l.at);
      if (y < -20 || y > size + 20) continue;
      c.moveTo(0, y);
      c.lineTo(size, y);
    } else {
      const x = X(l.at);
      if (x < -20 || x > size + 20) continue;
      c.moveTo(x, 0);
      c.lineTo(x, size);
    }
  }
  c.stroke();

  // The sandy strip south of the city.
  const sandY = Y(worldHalf + 7);
  if (sandY < size) {
    c.fillStyle = 'rgba(217, 192, 140, 0.35)';
    c.fillRect(0, sandY, size, size - sandY);
  }

  // Faint pedestrian specks.
  c.fillStyle = 'rgba(224, 228, 234, 0.4)';
  for (const ped of peds) {
    const p = ped.userData.ped;
    if (!p || p.down > 0) continue;
    const x = X(ped.position.x);
    const y = Y(ped.position.z);
    if (x < 0 || x > size || y < 0 || y > size) continue;
    c.fillRect(x - 1, y - 1, 2, 2);
  }

  // Cruisers as blue squares.
  c.fillStyle = '#4c8dff';
  for (const cop of cops) {
    const x = X(cop.position.x);
    const y = Y(cop.position.z);
    if (x < -6 || x > size + 6 || y < -6 || y > size + 6) continue;
    c.fillRect(x - 3, y - 3, 6, 6);
  }

  // The mission blip as a coloured dot.
  for (const b of blips) {
    if (!b) continue;
    c.fillStyle = '#' + (b.color >>> 0).toString(16).padStart(6, '0');
    c.beginPath();
    c.arc(X(b.x), Y(b.z), 4.5, 0, Math.PI * 2);
    c.fill();
  }

  // The player: a red dot with a heading tick.
  const heading = state.car ? state.car.userData.drive.heading : state.heading;
  c.strokeStyle = '#ff4d5e';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(X(px), Y(pz));
  c.lineTo(X(px) + Math.sin(heading) * 9, Y(pz) + Math.cos(heading) * 9);
  c.stroke();
  c.fillStyle = '#ff4d5e';
  c.beginPath();
  c.arc(X(px), Y(pz), 4, 0, Math.PI * 2);
  c.fill();
}
