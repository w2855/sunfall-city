// The DOM heads-up display: wanted stars, cash, health and mode top-right, a live
// minimap bottom-left, objective and toast feed bottom-centre, and a big fading banner
// across the middle. Built once into the empty #hud div, then refreshed every frame.
import { CONFIG } from './config.js';

let stars = null;
let cash = null;
let healthFill = null;
let mode = null;
let minimap = null;
let mmCtx = null;
let objective = null;
let feed = null;
let bannerEl = null;
let crosshair = null;
let bannerTimer = 0;

let gridLines = null;
let gridMin = 0;
let gridMax = 0;

const MAP_SCALE = 0.55; // minimap pixels per world metre

export function initHud() {
  const hud = document.getElementById('hud');
  hud.textContent = '';

  const panel = document.createElement('div');
  panel.className = 'panel';
  stars = document.createElement('div');
  stars.className = 'stars';
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('span');
    star.textContent = '★';
    stars.appendChild(star);
  }
  cash = document.createElement('div');
  cash.className = 'cash';
  const healthbar = document.createElement('div');
  healthbar.className = 'healthbar';
  healthFill = document.createElement('div');
  healthFill.className = 'fill';
  healthbar.appendChild(healthFill);
  mode = document.createElement('div');
  mode.className = 'mode';
  panel.append(stars, cash, healthbar, mode);
  hud.appendChild(panel);

  minimap = document.createElement('canvas');
  minimap.id = 'minimap';
  minimap.width = 210;
  minimap.height = 210;
  mmCtx = minimap.getContext('2d');
  hud.appendChild(minimap);

  objective = document.createElement('div');
  objective.className = 'objective';
  hud.appendChild(objective);

  feed = document.createElement('div');
  feed.className = 'feed';
  hud.appendChild(feed);

  bannerEl = document.createElement('div');
  bannerEl.className = 'banner';
  hud.appendChild(bannerEl);

  crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  hud.appendChild(crosshair);
}

export function toast(text) {
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  feed.appendChild(el);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 550);
  }, 3600);
}

export function banner(text, seconds) {
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), (seconds || 2) * 1000);
}

export function setObjective(text) {
  if (objective) objective.textContent = text;
}

export function cacheMinimapGrid(lines) {
  gridLines = lines;
  gridMin = Math.min(...lines);
  gridMax = Math.max(...lines);
}

function drawMinimap(state, cops, peds, blips) {
  if (!mmCtx) return;
  const ctx = mmCtx;
  const px = state.pos.x;
  const pz = state.pos.z;
  const S = MAP_SCALE;

  ctx.clearRect(0, 0, 210, 210);
  ctx.fillStyle = '#0b0d18';
  ctx.fillRect(0, 0, 210, 210);
  ctx.save();
  ctx.translate(105, 105);

  // beach strip beyond the south edge
  ctx.fillStyle = '#4a4130';
  ctx.fillRect((gridMin - px) * S, (gridMin - pz) * S, (gridMax - gridMin) * S, -30 * S);

  // the road grid, north-up: world +z is up on the map
  ctx.strokeStyle = '#39405a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const line of gridLines) {
    ctx.moveTo((gridMin - px) * S, -(line - pz) * S);
    ctx.lineTo((gridMax - px) * S, -(line - pz) * S);
    ctx.moveTo((line - px) * S, -(gridMin - pz) * S);
    ctx.lineTo((line - px) * S, -(gridMax - pz) * S);
  }
  ctx.stroke();

  // pedestrians as faint specks
  ctx.fillStyle = 'rgba(150, 158, 180, 0.55)';
  for (const ped of peds) {
    ctx.fillRect((ped.position.x - px) * S - 1, -(ped.position.z - pz) * S - 1, 2, 2);
  }

  // cruisers as blue squares
  ctx.fillStyle = '#4f8cff';
  for (const cop of cops) {
    ctx.fillRect((cop.position.x - px) * S - 3, -(cop.position.z - pz) * S - 3, 6, 6);
  }

  // mission blips as coloured dots, clamped to the map edge when far away
  for (const b of blips) {
    let bx = (b.x - px) * S;
    let bz = -(b.z - pz) * S;
    const dist = Math.hypot(bx, bz);
    if (dist > 96) {
      bx = (bx / dist) * 96;
      bz = (bz / dist) * 96;
    }
    ctx.fillStyle = '#' + b.color.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.arc(bx, bz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, bz, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // the player as a red dot with a heading tick
  ctx.strokeStyle = '#ff4d5e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(state.heading) * 9, -Math.cos(state.heading) * 9);
  ctx.stroke();
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function updateHud(state, cops, peds, worldHalf, blips) {
  if (!stars) return;
  const starEls = stars.children;
  for (let i = 0; i < starEls.length; i++) starEls[i].classList.toggle('on', i < state.wanted);
  cash.textContent = '$' + Math.max(0, Math.round(state.money)).toLocaleString('en-US');
  healthFill.style.width = Math.max(0, Math.min(100, state.health)) + '%';
  const armed = state.armed ? ' · ARMED' : '';
  mode.textContent = (state.car ? 'DRIVING' : 'ON FOOT') + armed;
  crosshair.classList.toggle('on', !!state.armed && !state.car);
  drawMinimap(state, cops, peds, blips);
}
