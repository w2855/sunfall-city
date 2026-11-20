// Vehicles: every car, taxi, van and cruiser in Sunfall City is one of these low-poly builds,
// driven either by the player or by the traffic and the police. Same builders everywhere, so the
// city's fleet looks like one city's fleet.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const C = CONFIG.car;

/** One drivable car: body, cabin, wheels, headlights. Returns the group plus its drivetrain state. */
export function makeCar(color, kind = 'sedan') {
  const g = new THREE.Group();
  const long = kind === 'van' ? 5.6 : kind === 'cruiser' ? 5.3 : 4.7;
  const wide = 2.05;
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2634 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x20242c });

  const body = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.62, long), bodyMat);
  body.position.y = 0.72;
  g.add(body);
  const cabinW = wide - 0.3;
  const cabin = new THREE.Mesh(
    kind === 'van'
      ? new THREE.BoxGeometry(cabinW, 0.85, long * 0.62)
      : new THREE.BoxGeometry(cabinW, 0.6, long * 0.48),
    glassMat,
  );
  cabin.position.set(0, 1.32, kind === 'van' ? -0.2 : -0.35);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinW - 0.25, 0.1, long * 0.42), bodyMat);
  roof.position.set(0, 1.66, kind === 'van' ? -0.2 : -0.4);
  g.add(roof);

  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (wide / 2 - 0.1), 0.42, sz * (long / 2 - 0.95));
    g.add(wheel);
  }
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    lamp.position.set(sx * (wide / 2 - 0.42), 0.86, long / 2 + 0.02);
    g.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xb02a35 }));
    tail.position.set(sx * (wide / 2 - 0.42), 0.86, -long / 2 - 0.02);
    g.add(tail);
  }
  if (kind === 'cruiser') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x3f6dff }));
    bar.position.set(0, 1.78, -0.35);
    g.add(bar);
    const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.3), new THREE.MeshBasicMaterial({ color: 0xef476f }));
    barRed.position.set(-0.3, 1.78, -0.35);
    g.add(barRed);
    g.userData.lightBar = bar;
    g.userData.lightBarRed = barRed;
  }

  g.userData.drive = { speed: 0, heading: 0, steer: 0, kind, length: long, width: wide };
  return g;
}

/** The physics step one driven car takes: throttle, steering, grip, collision push-out. */
export function driveCar(car, input, dt, colliders, others) {
  const d = car.userData.drive;
  const forward = input.throttle ?? 0;
  const turn = input.steer ?? 0;
  if (forward > 0) d.speed = Math.min(C.topSpeed, d.speed + C.accel * forward * dt);
  else if (forward < 0) d.speed = d.speed > 0 ? Math.max(0, d.speed - C.brake * dt) : Math.max(-C.reverseSpeed, d.speed - C.accel * 0.8 * dt);
  else d.speed = d.speed * (1 - Math.min(1, 2.2 * dt));
  if (input.handbrake) d.speed = d.speed * (1 - Math.min(1, 3.4 * dt));
  d.steer = THREE.MathUtils.lerp(d.steer, turn, Math.min(1, 9 * dt));
  const speedFactor = Math.min(1, Math.abs(d.speed) / 9);
  d.heading += d.steer * CONFIG.car.steer * dt * speedFactor * (d.speed < 0 ? -1 : 1);
  // The car's nose points along (sin(heading), cos(heading)); it drives nose-first.
  const nx = car.position.x + Math.sin(d.heading) * d.speed * dt;
  const nz = car.position.z + Math.cos(d.heading) * d.speed * dt;
  const pushed = resolveBox(car.position.x, car.position.z, nx, nz, colliders, d.length / 2);
  car.position.x = pushed.x;
  car.position.z = pushed.z;
  car.rotation.y = d.heading;
  // Push other cars aside gently so pile-ups nudge rather than overlap.
  if (others) {
    for (const o of others) {
      if (o === car) continue;
      const dx = car.position.x - o.position.x;
      const dz = car.position.z - o.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = (d.length + (o.userData.drive?.length ?? 4)) / 2.2;
      if (dist > 0.01 && dist < minDist) {
        car.position.x += (dx / dist) * (minDist - dist) * 0.5;
        car.position.z += (dz / dist) * (minDist - dist) * 0.5;
      }
    }
  }
  return { speed: d.speed, crashed: pushed.moved };
}

/** Keep a moving point out of every building box, sliding along the walls it grazes. */
export function resolveBox(x, z, nx, nz, colliders, radius) {
  let px = nx;
  let pz = nz;
  let moved = false;
  for (const b of colliders) {
    const minX = b.x - b.w / 2 - radius;
    const maxX = b.x + b.w / 2 + radius;
    const minZ = b.z - b.d / 2 - radius;
    const maxZ = b.z + b.d / 2 + radius;
    if (px > minX && px < maxX && pz > minZ && pz < maxZ) {
      const pushLeft = Math.abs(px - minX);
      const pushRight = Math.abs(maxX - px);
      const pushUp = Math.abs(pz - minZ);
      const pushDown = Math.abs(maxZ - pz);
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) px = minX;
      else if (min === pushRight) px = maxX;
      else if (min === pushUp) pz = minZ;
      else pz = maxZ;
      moved = true;
    }
  }
  return { x: px, z: pz, moved };
}
