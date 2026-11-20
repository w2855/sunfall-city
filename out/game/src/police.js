// The heat: crime points pile up and become whole wanted stars (0..5), cruisers spawn
// one per star at the city edge nearest the player and hunt nose-first with blinking
// light bars. Heat only cools when the nearest cruiser is far away.
import { CONFIG } from './config.js';
import { colliders } from './world.js';
import { makeCar, driveCar } from './vehicles.js';

const HALF = CONFIG.city.blocks * CONFIG.city.block / 2;
let clock = 0; // seconds since load; drives blink phase and bump cooldowns

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function addCrime(state, amount, onStar) {
  const before = state.wanted;
  state.wantedHeat = Math.min(5.999, state.wantedHeat + amount);
  state.wanted = Math.min(5, Math.floor(state.wantedHeat));
  state.grace = 5; // cruisers need a moment to arrive before heat may cool
  if (state.wanted > before && onStar) onStar(state.wanted);
}

export function coolHeat(state, dt, nearestCopDist) {
  if (state.wantedHeat <= 0) return;
  if (state.grace > 0) {
    state.grace -= dt;
    return;
  }
  if (nearestCopDist !== null && nearestCopDist !== undefined && nearestCopDist < 70) return;
  state.wantedHeat = Math.max(0, state.wantedHeat - dt / CONFIG.wanted.decaySeconds);
  // cooling only ever steps the star count down, so a forced reset (the maker's
  // window.__sunfall hook, or a respawn) stays reset even while heat lingers
  const stars = Math.min(5, Math.floor(state.wantedHeat));
  if (stars < state.wanted) state.wanted = stars;
}

// A point on the outer ring road nearest the player, biased along the edge toward them,
// facing into the city.
function edgeSpawn(state) {
  const edges = [
    { x: 0, z: -HALF, heading: 0, along: 'x' },
    { x: 0, z: HALF, heading: Math.PI, along: 'x' },
    { x: -HALF, z: 0, heading: Math.PI / 2, along: 'z' },
    { x: HALF, z: 0, heading: -Math.PI / 2, along: 'z' },
  ];
  let best = edges[0];
  let bestD = Infinity;
  for (const e of edges) {
    const d = Math.hypot(e.x - state.pos.x, e.z - state.pos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  const near = best.along === 'x' ? state.pos.x : state.pos.z;
  const along = Math.max(-HALF + 8, Math.min(HALF - 8, near + (Math.random() * 240 - 120)));
  return best.along === 'x'
    ? { x: along, z: best.z, heading: best.heading }
    : { x: best.x, z: along, heading: best.heading };
}

export function maintainPolice(scene, cops, state, half) {
  const want = Math.max(0, Math.min(5, state.wanted | 0));
  while (cops.length < want) {
    const cop = makeCar(CONFIG.colors.police, 'cruiser');
    const spot = edgeSpawn(state);
    cop.position.set(spot.x, 0, spot.z);
    cop.userData.drive.heading = spot.heading;
    cop.rotation.y = spot.heading;
    cop.userData.cop = { lastBump: -10, stuck: 0 };
    scene.add(cop);
    cops.push(cop);
  }
  while (cops.length > want) scene.remove(cops.pop());
}

export function stepPolice(cops, dt, state, onBumpPlayer) {
  clock += dt;
  const phase = Math.floor(clock * 3) % 2;
  for (const cop of cops) {
    const d = cop.userData.drive;
    const u = cop.userData.cop;

    // guard: a cruiser whose numbers went NaN goes back to the edge
    if (!Number.isFinite(cop.position.x + cop.position.z + d.speed + d.heading)) {
      const spot = edgeSpawn(state);
      cop.position.set(spot.x, 0, spot.z);
      d.heading = spot.heading;
      d.speed = 0;
      continue;
    }

    // steer nose-first at the player, faster with more stars
    const target = Math.atan2(state.pos.x - cop.position.x, state.pos.z - cop.position.z);
    const steer = Math.max(-1, Math.min(1, wrapAngle(target - d.heading) * 2.2));
    const cruise = Math.min(30, 10 + state.wanted * 4);
    const throttle = d.speed < cruise ? 1 : -0.2;
    driveCar(cop, { throttle, steer, handbrake: false }, dt, colliders(), cops);

    // alternating light bars
    if (cop.userData.lightBar) cop.userData.lightBar.visible = phase === 0;
    if (cop.userData.lightBarRed) cop.userData.lightBarRed.visible = phase === 1;

    // stuck against a wall for too long: go back to the edge and try again
    if (Math.abs(d.speed) < 1.2) {
      u.stuck += dt;
      if (u.stuck > 3) {
        const spot = edgeSpawn(state);
        cop.position.set(spot.x, 0, spot.z);
        d.heading = spot.heading;
        d.speed = 0;
        u.stuck = 0;
      }
    } else {
      u.stuck = 0;
    }

    // ramming the player hurts, with a per-cruiser cooldown
    const dist = Math.hypot(state.pos.x - cop.position.x, state.pos.z - cop.position.z);
    if (dist < 2.7 && Math.abs(d.speed) > 5 && clock - u.lastBump > 0.9) {
      u.lastBump = clock;
      onBumpPlayer();
    }
  }
}

export function nearestCop(cops, state) {
  let best = null;
  let bestD = Infinity;
  for (const cop of cops) {
    const d = Math.hypot(state.pos.x - cop.position.x, state.pos.z - cop.position.z);
    if (d < bestD) {
      bestD = d;
      best = cop;
    }
  }
  return best;
}
