// Sunfall City — the wanted level and the heat behind it. Crimes pour heat into the meter,
// whole stars of heat become a wanted level, and one cruiser rolls in per star to ram the
// player until the streets cool down.
import { CONFIG } from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { colliders } from './world.js';

/** A crime adds heat; every whole star it crosses becomes a wanted level, announced once. */
export function addCrime(state, amount, onStar) {
  const before = state.wanted;
  state.wantedHeat = Math.min(5.999, state.wantedHeat + amount);
  state.wanted = Math.min(5, Math.floor(state.wantedHeat));
  for (let s = before + 1; s <= state.wanted; s++) {
    if (onStar) onStar(s);
  }
}

/** Heat cools only when the nearest cruiser is over 70 metres out — no cooling under watch. */
export function coolHeat(state, dt, nearestCopDist) {
  if (nearestCopDist <= 70) return;
  state.wantedHeat = Math.max(0, state.wantedHeat - dt / CONFIG.wanted.decaySeconds);
  const stars = Math.min(5, Math.floor(state.wantedHeat));
  if (stars < state.wanted) state.wanted = stars;
}

/** Keep one cruiser per wanted star: drop new ones on the ring road at the city edge. */
export function maintainPolice(scene, cops, state, half) {
  const want = Math.min(5, state.wanted);
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  while (cops.length < want) {
    const cop = makeCar(CONFIG.colors.police, 'cruiser');
    const side = Math.floor(Math.random() * 4);
    const t = (Math.random() * 2 - 1) * (half - 30);
    let x, z;
    if (side === 0) { x = -half; z = t; }
    else if (side === 1) { x = half; z = t; }
    else if (side === 2) { x = t; z = -half; }
    else { x = t; z = half; }
    cop.position.set(x, 0, z);
    cop.userData.drive.heading = Math.atan2(px - x, pz - z); // nose already aimed at the runner
    cop.rotation.y = cop.userData.drive.heading;
    cop.userData.blinkT = Math.random() * 10;
    scene.add(cop);
    cops.push(cop);
  }
  while (cops.length > want) {
    scene.remove(cops.pop());
  }
}

/** Every cruiser steers nose-first at the player, its light bar strobing blue and red. */
export function stepPolice(cops, dt, state, onBumpPlayer) {
  const cols = colliders();
  const others = state.cars ? cops.concat(state.cars) : cops; // cruisers shove traffic aside
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  for (const cop of cops) {
    const d = cop.userData.drive;
    if (!d) continue;
    // A poisoned cruiser is quarantined out of town instead of spreading NaN to the chase.
    if (
      !Number.isFinite(cop.position.x) || !Number.isFinite(cop.position.z) ||
      !Number.isFinite(d.speed) || !Number.isFinite(d.heading)
    ) {
      d.speed = 0;
      d.heading = 0;
      cop.position.set(px + 60, 0, pz + 60);
    }
    const dx = px - cop.position.x;
    const dz = pz - cop.position.z;
    const dist = Math.hypot(dx, dz);
    d.heading = Math.atan2(dx, dz); // the pursuit never turns off
    const target = Math.min(30, 11 + state.wanted * 4.5); // hotter streets, angrier cruisers
    driveCar(cop, { throttle: 1 }, dt, cols, others);
    if (d.speed > target) d.speed = Math.max(target, d.speed - 18 * dt);
    cop.userData.blinkT = (cop.userData.blinkT || 0) + dt;
    const blue = Math.sin(cop.userData.blinkT * 9) > 0;
    if (cop.userData.lightBar) cop.userData.lightBar.material.opacity = blue ? 1 : 0.15;
    if (cop.userData.lightBarRed) cop.userData.lightBarRed.material.opacity = blue ? 0.15 : 1;
    if (dist < 3.6 && d.speed > 3 && onBumpPlayer) onBumpPlayer(cop);
  }
}

/** The distance to the closest cruiser, Infinity when the streets hold none. */
export function nearestCop(cops, state) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  let best = Infinity;
  for (const cop of cops) {
    const dist = Math.hypot(cop.position.x - px, cop.position.z - pz);
    if (dist < best) best = dist;
  }
  return best;
}
