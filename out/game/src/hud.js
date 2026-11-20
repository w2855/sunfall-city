// The HUD: wanted stars, health and cash, the objective line, the feed of what just happened,
// and a canvas minimap of the city grid with every blip the player should know about.
import { CONFIG } from './config.js';

const hud = () => document.getElementById('hud');

let minimapCtx = null;
let feedLines = [];

export function initHud() {
  const root = hud();
  root.innerHTML = `
    <div style="position:absolute;top:14px;right:16px;text-align:right">
      <div id="stars" style="font-size:22px;letter-spacing:3px;color:#ffd166;text-shadow:0 0 12px rgba(255,209,102,.4)"></div>
      <div id="cash" style="font:700 24px 'Segoe UI';color:#06d6a0">$0</div>
      <div style="height:8px;width:170px;background:rgba(10,14,22,.7);border-radius:4px;margin-top:6px;overflow:hidden">
        <div id="healthbar" style="height:100%;width:100%;background:linear-gradient(90deg,#ef476f,#ff8fa3)"></div>
      </div>
      <div id="mode" style="font-size:12px;color:#9aa7bd;margin-top:4px">ON FOOT · unarmed</div>
    </div>
    <canvas id="minimap" width="210" height="210" style="position:absolute;bottom:16px;left:16px;background:rgba(8,11,17,.82);border-radius:12px;border:1px solid rgba(255,255,255,.14)"></canvas>
    <div id="objective" style="position:absolute;bottom:16px;left:246px;max-width:420px;font:600 14px 'Segoe UI';color:#ffd166;text-shadow:0 2px 8px rgba(0,0,0,.6)"></div>
    <div id="feed" style="position:absolute;bottom:70px;left:246px;font:500 12.5px 'Segoe UI';color:#c9d3e4;text-shadow:0 1px 6px rgba(0,0,0,.7);line-height:1.55"></div>
    <div id="banner" style="position:absolute;top:34%;width:100%;text-align:center;font:700 44px 'Segoe UI';color:#ffd166;text-shadow:0 4px 30px rgba(0,0,0,.8);opacity:0;transition:opacity .5s"></div>`;
  minimapCtx = document.getElementById('minimap').getContext('2d');
}

export function toast(text) {
  feedLines.unshift(text);
  feedLines = feedLines.slice(0, 5);
  const el = document.getElementById('feed');
  if (el) el.innerHTML = feedLines.map((t) => '› ' + t).join('<br>');
}

export function banner(text, seconds = 2.4) {
  const el = document.getElementById('banner');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, seconds * 1000);
}

export function setObjective(text) {
  const el = document.getElementById('objective');
  if (el) el.textContent = text || '';
}

/** One HUD refresh per frame: numbers, stars, mode line, and the minimap's every blip. */
export function updateHud(state, cops, peds, objective, worldHalf, minimapBlips) {
  const stars = document.getElementById('stars');
  if (stars) stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  const cash = document.getElementById('cash');
  if (cash) cash.textContent = '$' + state.money.toLocaleString('en-US');
  const bar = document.getElementById('healthbar');
  if (bar) bar.style.width = Math.max(0, state.health) + '%';
  const mode = document.getElementById('mode');
  if (mode) mode.textContent = (state.car ? 'DRIVING ' + state.car.userData.drive.kind.toUpperCase() : 'ON FOOT') + (state.armed && !state.car ? ' · armed' : '');
  if (minimapCtx) drawMinimap(state, cops, peds, worldHalf, minimapBlips);
  const obj = document.getElementById('objective');
  if (obj && objective !== undefined) obj.textContent = objective;
}

function drawMinimap(state, cops, peds, worldHalf, blips) {
  const ctx = minimapCtx;
  const size = 210;
  const view = 320; // metres of city the minimap shows around the player
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  const toMap = (x, z) => [((x - px) / view) * size + size / 2, ((z - pz) / view) * size + size / 2];
  ctx.clearRect(0, 0, size, size);
  // The road grid around the player.
  ctx.strokeStyle = 'rgba(160,175,200,.28)';
  ctx.lineWidth = 3;
  for (const at of networkLinesCached) {
    const [x1, z1] = toMap(at, -worldHalf);
    const [x2, z2] = toMap(at, worldHalf);
    ctx.beginPath(); ctx.moveTo(x1, z1); ctx.lineTo(x2, z2); ctx.stroke();
    const [a1, b1] = toMap(-worldHalf, at);
    const [a2, b2] = toMap(worldHalf, at);
    ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke();
  }
  // Blips: the cops that hunt, the objective marker, the peds as faint dust.
  for (const cop of cops) {
    const [x, y] = toMap(cop.position.x, cop.position.z);
    ctx.fillStyle = '#4f8dff';
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  for (const b of blips ?? []) {
    const [x, y] = toMap(b.x, b.z);
    ctx.fillStyle = b.color ?? '#ffd166';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of peds) {
    const [x, y] = toMap(p.position.x, p.position.z);
    ctx.fillStyle = 'rgba(200,210,225,.4)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  // The player, always the arrow in the middle.
  ctx.fillStyle = '#ef476f';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

let networkLinesCached = [];
export function cacheMinimapGrid(lines) { networkLinesCached = lines; }
