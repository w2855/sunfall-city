// The heat: wanted stars, the cruisers that chase them, and the sirens that sell the chase.
// Police spawn at the city edge when the player is hot, drive at the player, and give up when
// the heat cools. Everything the wanted system needs lives here.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeCar } from './vehicles.js';
import { network } from './world.js';

const W = CONFIG.wanted;

/** Add crime heat and convert it into whole stars (0..5). */
export function addCrime(state, amount, onStar) {
  state.wantedHeat += amount;
  const stars = Math.min(5, Math.floor(state.wantedHeat));
  if (stars > state.wanted) {
    state.wanted = stars;
    onStar?.(stars);
  }
}

/** Heat cools when the player keeps clear of the police. */
export function coolHeat(state, dt, nearestCopDist) {
  if (state.wanted <= 0) return;
  if (nearestCopDist > 70) {
    state.wantedHeat -= dt / W.decaySeconds;
    const stars = Math.min(5, Math.floor(Math.max(0, state.wantedHeat)));
    if (stars < state.wanted) state.wanted = stars;
    if (state.wantedHeat <= 0) { state.wantedHeat = 0; state.wanted = 0; }
  }
}

/** Keep the cruiser pool matched to the wanted level: one cruiser per star, spawned far. */
export function maintainPolice(scene, cops, state, half) {
  const want = state.wanted;
  while (cops.length < want) {
    const cop = makeCar(CONFIG.colors.police, 'cruiser');
    cop.userData.cop = true;
    cop.userData.kind = 'police';
    cop.userData.ai = { speed: 0, target: null };
    const edge = network.lines[Math.floor(Math.random() * network.lines.length)];
    const far = Math.random() < 0.5 ? -half + 6 : half - 6;
    if (Math.random() < 0.5) cop.position.set(far, 0, edge);
    else cop.position.set(edge, 0, far);
    scene.add(cop);
    cops.push(cop);
  }
  while (cops.length > want) {
    const cop = cops.pop();
    scene.remove(cop);
  }
}

/** One police step: chase the player's position with some wobble, ram at close range. */
export function stepPolice(cops, dt, state, onBumpPlayer) {
  for (const cop of cops) {
    const d = cop.userData.drive;
    const dx = state.car ? state.car.position.x : state.pos.x;
    const dz = state.car ? state.car.position.z : state.pos.z;
    const dist = Math.hypot(dx - cop.position.x, dz - cop.position.z);
    // Head straight for the player: the heading is the direction the nose points.
    d.heading = Math.atan2(dx - cop.position.x, dz - cop.position.z);
    d.speed = dist > 14 ? Math.min(30, 12 + state.wanted * 4) : Math.max(6, 30 - dist * 1.4);
    const nx = cop.position.x + Math.sin(d.heading) * d.speed * dt;
    const nz = cop.position.z + Math.cos(d.heading) * d.speed * dt;
    cop.position.x = nx;
    cop.position.z = nz;
    cop.rotation.y = d.heading;
    if (cop.userData.lightBar) cop.userData.lightBar.visible = Math.floor(Date.now() / 220) % 2 === 0;
    if (cop.userData.lightBarRed) cop.userData.lightBarRed.visible = Math.floor(Date.now() / 220) % 2 === 1;
    if (dist < (state.car ? 4.4 : 2.6) && onBumpPlayer) onBumpPlayer();
  }
}

/** Distance to the closest cruiser, for the heat's decay and the HUD's blip. */
export function nearestCop(cops, state) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  let best = Infinity;
  for (const cop of cops) best = Math.min(best, Math.hypot(cop.position.x - px, cop.position.z - pz));
  return best;
}
