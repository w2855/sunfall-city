// All DOM UI: wanted stars, cash, health, mode, the minimap, objective line, toasts, banner.
let starsEls = [];
let cashEl = null;
let healthFill = null;
let modeEl = null;
let map = null;
let mapCtx = null;
let objectiveEl = null;
let feedEl = null;
let bannerEl = null;
let bannerTimer = 0;
let grid = [];

const STAR_LIT = '#ffd166';
const STAR_DIM = 'rgba(255, 209, 102, 0.22)';

function el(tag, style, parent) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (parent) parent.appendChild(node);
  return node;
}

export function initHud() {
  const root = document.getElementById('hud');
  root.innerHTML = '';

  // Top-right panel: stars, cash, health, mode.
  const panel = el('div', {
    position: 'absolute', top: '14px', right: '16px',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px',
    textShadow: '0 2px 6px rgba(0,0,0,0.7)',
  }, root);

  const starsRow = el('div', { display: 'flex', gap: '3px', fontSize: '26px', lineHeight: '1' }, panel);
  for (let i = 0; i < 5; i++) {
    const star = el('span', { color: STAR_DIM, transition: 'color 0.2s' }, starsRow);
    star.textContent = '\u2605';
    starsEls.push(star);
  }

  cashEl = el('div', { fontSize: '26px', fontWeight: '700', color: '#8ce99a', letterSpacing: '0.04em' }, panel);
  cashEl.textContent = '$0';

  const healthBack = el('div', {
    width: '190px', height: '12px', borderRadius: '6px',
    background: 'rgba(10, 8, 22, 0.75)', border: '1px solid rgba(232, 230, 242, 0.25)',
    overflow: 'hidden',
  }, panel);
  healthFill = el('div', {
    width: '100%', height: '100%',
    background: 'linear-gradient(90deg, #ef476f, #ff8fa3)',
    transition: 'width 0.15s',
  }, healthBack);

  modeEl = el('div', { fontSize: '12px', letterSpacing: '0.28em', color: '#b9b1dd' }, panel);
  modeEl.textContent = 'ON FOOT';

  // The minimap, bottom-left.
  map = el('canvas', {
    position: 'absolute', left: '16px', bottom: '16px',
    width: '210px', height: '210px',
    borderRadius: '8px', border: '1px solid rgba(232, 230, 242, 0.22)',
    background: 'rgba(10, 9, 24, 0.82)',
  }, root);
  map.width = 210;
  map.height = 210;
  mapCtx = map.getContext('2d');

  // Objective + toast feed, bottom-centre.
  const lower = el('div', {
    position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
    width: 'min(680px, 70vw)', textAlign: 'center',
  }, root);

  objectiveEl = el('div', {
    fontSize: '15px', fontWeight: '600', letterSpacing: '0.06em',
    color: '#ffd166', textShadow: '0 2px 8px rgba(0,0,0,0.8)',
  }, lower);

  feedEl = el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
  }, lower);

  // The big centre banner.
  bannerEl = el('div', {
    position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%, -50%)',
    fontSize: '54px', fontWeight: '800', letterSpacing: '0.2em',
    color: '#ef476f', textShadow: '0 0 30px rgba(239,71,111,0.5), 0 4px 12px rgba(0,0,0,0.7)',
    opacity: '0', transition: 'opacity 0.4s', whiteSpace: 'nowrap',
  }, root);
}

export function toast(text) {
  if (!feedEl) return;
  const line = el('div', {
    fontSize: '14px', letterSpacing: '0.04em', color: '#e8e6f2',
    background: 'rgba(13, 10, 24, 0.72)', padding: '5px 14px', borderRadius: '4px',
    transition: 'opacity 0.6s',
  }, feedEl);
  line.textContent = text;
  while (feedEl.children.length > 5) feedEl.firstChild.remove();
  setTimeout(() => {
    line.style.opacity = '0';
    setTimeout(() => line.remove(), 700);
  }, 3600);
}

export function banner(text, seconds = 3) {
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { bannerEl.style.opacity = '0'; }, seconds * 1000);
}

export function setObjective(text) {
  if (objectiveEl) objectiveEl.textContent = text;
}

export function cacheMinimapGrid(lines) {
  grid = lines;
}

export function updateHud(state, cops, peds, worldHalf, blips) {
  for (let i = 0; i < 5; i++) starsEls[i].style.color = i < state.wanted ? STAR_LIT : STAR_DIM;
  cashEl.textContent = `$${state.money}`;
  healthFill.style.width = `${Math.max(0, Math.min(100, state.health))}%`;
  modeEl.textContent = !state.alive
    ? 'WASTED'
    : state.car
      ? 'DRIVING'
      : state.armed ? 'ON FOOT \u00b7 ARMED' : 'ON FOOT';
  drawMinimap(state, cops, peds, worldHalf, blips);
}

function drawMinimap(state, cops, peds, worldHalf, blips) {
  const ctx = mapCtx;
  if (!ctx) return;
  const size = 210;
  const mid = size / 2;
  const view = 250; // metres of world across the map
  const s = size / view;
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  const toX = (wx) => mid + (wx - px) * s;
  const toY = (wz) => mid + (wz - pz) * s;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(10, 9, 24, 0.85)';
  ctx.fillRect(0, 0, size, size);

  // The road grid.
  ctx.strokeStyle = 'rgba(154, 163, 189, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const line of grid) {
    if (line.axis === 'h') {
      const y = toY(line.pos);
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
    } else {
      const x = toX(line.pos);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
    }
  }
  ctx.stroke();

  // The city border.
  const edge = worldHalf + 7;
  ctx.strokeStyle = 'rgba(239, 71, 111, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(toX(-edge), toY(-edge), edge * 2 * s, edge * 2 * s);

  // Pedestrians as faint specks.
  ctx.fillStyle = 'rgba(196, 202, 220, 0.38)';
  for (const ped of peds) {
    if (ped.userData.ped.dead) continue;
    ctx.fillRect(toX(ped.position.x) - 1, toY(ped.position.z) - 1, 2, 2);
  }

  // Cruisers as blue squares.
  ctx.fillStyle = '#4f8dff';
  for (const cop of cops) {
    ctx.fillRect(toX(cop.position.x) - 3, toY(cop.position.z) - 3, 6, 6);
  }

  // Mission blips as yellow dots.
  ctx.fillStyle = '#ffd166';
  for (const b of blips ?? []) {
    ctx.beginPath();
    ctx.arc(toX(b.x), toY(b.z), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // The player: a red dot with a heading tick.
  const heading = state.car ? state.car.userData.drive.heading : state.heading;
  ctx.strokeStyle = '#ef476f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mid, mid);
  ctx.lineTo(mid + Math.sin(heading) * 11, mid + Math.cos(heading) * 11);
  ctx.stroke();
  ctx.fillStyle = '#ef476f';
  ctx.beginPath();
  ctx.arc(mid, mid, 4, 0, Math.PI * 2);
  ctx.fill();
}
