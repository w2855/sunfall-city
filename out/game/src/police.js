// The heat: crime points, stars that cool down, and cruisers that chase.
import { CONFIG } from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { colliders as cityColliders } from './world.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Heat accumulates; each whole star up to five lights up, and a new star fires onStar.
export function addCrime(state, amount, onStar) {
  state.wantedHeat += amount;
  const stars = Math.min(5, Math.floor(state.wantedHeat));
  if (stars > state.wanted) {
    state.wanted = stars;
    if (onStar) onStar(stars);
  }
}

// Heat cools only when the nearest cruiser is more than 70 metres away.
export function coolHeat(state, dt, nearestCopDist) {
  if (state.wantedHeat <= 0) return;
  if (nearestCopDist !== null && nearestCopDist !== undefined && nearestCopDist <= 70) return;
  state.wantedHeat = Math.max(0, state.wantedHeat - dt / CONFIG.wanted.decaySeconds);
  const stars = Math.min(5, Math.floor(state.wantedHeat));
  if (stars < state.wanted) state.wanted = stars;
}

// Keep one cruiser per wanted star: spawn newcomers at the city edge, remove extras.
export function maintainPolice(scene, cops, state, half) {
  while (cops.length < state.wanted) {
    const cop = makeCar(CONFIG.colors.police, 'cruiser');
    const angle = Math.random() * Math.PI * 2;
    cop.position.set(Math.cos(angle) * (half + 8), 0, Math.sin(angle) * (half + 8));
    cop.userData.drive.heading = Math.atan2(-cop.position.x, -cop.position.z);
    cop.userData.cop = true;
    scene.add(cop);
    cops.push(cop);
  }
  while (cops.length > state.wanted) {
    const cop = cops.pop();
    scene.remove(cop);
  }
}

let blinkClock = 0;

// Every cruiser steers nose-first at the player, blinks its bar, and reports rams.
export function stepPolice(cops, dt, state, onBumpPlayer) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  blinkClock += dt;
  const blink = ((blinkClock * 3.5) | 0) % 2 === 0;

  for (const cop of cops) {
    const drive = cop.userData.drive;

    if (
      !Number.isFinite(cop.position.x) || !Number.isFinite(cop.position.z) ||
      !Number.isFinite(drive.speed) || !Number.isFinite(drive.heading)
    ) {
      cop.position.set(px + 60, 0, pz + 60);
      drive.speed = 0;
      drive.heading = Math.PI;
    }

    // Nose-first at the player.
    const want = Math.atan2(px - cop.position.x, pz - cop.position.z);
    const diff = wrapAngle(want - drive.heading);
    drive.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));

    // Faster with the stars, easing off right on top of the player.
    const dist = Math.hypot(px - cop.position.x, pz - cop.position.z);
    const target = dist < 7
      ? Math.min(drive.speed + 4, 5)
      : Math.min(CONFIG.car.topSpeed * 0.78, 11 + state.wanted * 4);
    const throttle = drive.speed < target ? 1 : -0.5;
    driveCar(cop, { throttle, steer: 0, handbrake: false }, dt, cityColliders(), cops);

    // The alternating light bar.
    cop.userData.lightBar.visible = blink;
    cop.userData.lightBarRed.visible = !blink;

    // Ramming the player.
    if (dist < drive.length * 0.5 + 1.7 && Math.abs(drive.speed) > 3.5) {
      onBumpPlayer(Math.abs(drive.speed));
    }
  }
}

// The closest cruiser and how far it is, or null when the streets are clear.
export function nearestCop(cops, state) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  let best = null;
  let bestD = Infinity;
  for (const cop of cops) {
    const d = Math.hypot(cop.position.x - px, cop.position.z - pz);
    if (d < bestD) {
      bestD = d;
      best = cop;
    }
  }
  return best === null ? null : { cop: best, dist: bestD };
}
