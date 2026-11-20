// Low-poly cars and the arcade driving model shared by the player, traffic and police.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { groundHeight } from './world.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
wheelGeo.rotateZ(Math.PI / 2); // spin axis along x, so every wheel is oriented to roll
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15161c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x10141f });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a3c });
const barBlueMat = new THREE.MeshBasicMaterial({ color: 0x3aa0ff });
const barRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b4e });

// The car's nose faces local +z; drive.heading rotates that into the world.
export function makeCar(color, kind = 'sedan') {
  const van = kind === 'van';
  const length = van ? 5.6 : 4.6;
  const width = van ? 2.4 : 2.15;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, length), paint);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.86, van ? 0.85 : 0.6, van ? 3.1 : 2.1),
    glassMat,
  );
  cabin.position.set(0, van ? 1.25 : 1.03, van ? -0.2 : -0.4);
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.12, van ? 2.8 : 1.7), paint);
  roof.position.set(0, van ? 1.71 : 1.37, cabin.position.z);
  group.add(roof);

  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(sx * (width / 2 - 0.12), 0.42, sz * (length / 2 - 0.85));
    group.add(wheel);
  }

  // White headlights at the nose, red tail lights at the rear.
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), headMat);
    head.position.set(sx * (width / 2 - 0.32), 0.62, length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), tailMat);
    tail.position.set(sx * (width / 2 - 0.32), 0.62, -length / 2 - 0.02);
    group.add(tail);
  }

  if (kind === 'cruiser') {
    // The emergency light bar: blue on the left, red on the right.
    const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.17, 0.32), barBlueMat);
    barBlue.position.set(-0.31, 1.5, cabin.position.z);
    group.add(barBlue);
    const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.17, 0.32), barRedMat);
    barRed.position.set(0.31, 1.5, cabin.position.z);
    group.add(barRed);
    group.userData.lightBar = barBlue;
    group.userData.lightBarRed = barRed;
  }

  group.userData.drive = { speed: 0, heading: 0, steer: 0, kind, length, width };
  return group;
}

// Push a circle at (nx, nz) out of every axis-aligned box, along the nearest face.
export function resolveBox(x, z, nx, nz, colliders, radius) {
  let px = nx;
  let pz = nz;
  let moved = false;
  for (const box of colliders) {
    const hw = box.w / 2 + radius + 0.001;
    const hd = box.d / 2 + radius + 0.001;
    const dx = px - box.x;
    const dz = pz - box.z;
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
    // Inside the expanded box: exit along the shallowest axis.
    const pushX = hw - Math.abs(dx);
    const pushZ = hd - Math.abs(dz);
    if (pushX < pushZ) px = box.x + (dx >= 0 ? 1 : -1) * hw;
    else pz = box.z + (dz >= 0 ? 1 : -1) * hd;
    moved = true;
  }
  return { x: px, z: pz, moved };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// One arcade driving step. input: { throttle, steer, handbrake }; others: cars to slide off.
export function driveCar(car, input, dt, colliders, others = []) {
  const drive = car.userData.drive;
  const throttle = input.throttle || 0;

  // Longitudinal: throttle, brake-then-reverse, coast, handbrake.
  if (throttle > 0) {
    drive.speed = Math.min(CONFIG.car.topSpeed, drive.speed + CONFIG.car.accel * dt);
  } else if (throttle < 0) {
    if (drive.speed > 0) drive.speed = Math.max(0, drive.speed - CONFIG.car.brake * dt);
    else drive.speed = Math.max(-CONFIG.car.reverseSpeed, drive.speed - CONFIG.car.accel * 0.55 * dt);
  } else {
    const decay = 7 * dt;
    drive.speed = drive.speed > 0
      ? Math.max(0, drive.speed - decay)
      : Math.min(0, drive.speed + decay);
  }
  if (input.handbrake) {
    const decay = 26 * dt;
    drive.speed = drive.speed > 0
      ? Math.max(0, drive.speed - decay)
      : Math.min(0, drive.speed + decay);
  }

  // Steering turns heading, scaled by speed and reversed when backing up.
  const steerInput = input.steer || 0;
  const speedFactor = Math.min(1, Math.abs(drive.speed) / 12);
  drive.heading += steerInput * CONFIG.car.steer * speedFactor * dt * (drive.speed < 0 ? -1 : 1);
  drive.steer = steerInput;

  // Advance nose-first, then resolve buildings, then slide off neighbouring cars.
  const nx = car.position.x + Math.sin(drive.heading) * drive.speed * dt;
  const nz = car.position.z + Math.cos(drive.heading) * drive.speed * dt;
  const res = resolveBox(car.position.x, car.position.z, nx, nz, colliders, drive.length * 0.38);
  let px = res.x;
  let pz = res.z;
  if (res.moved) drive.speed *= 0.45; // scraping a wall costs momentum

  for (const other of others) {
    if (!other || other === car) continue;
    const od = other.userData.drive;
    if (!od) continue;
    const ox = px - other.position.x;
    const oz = pz - other.position.z;
    const minSep = (drive.length + od.length) * 0.31;
    const d2 = ox * ox + oz * oz;
    if (d2 > minSep * minSep || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const push = (minSep - d) * 0.5;
    px += (ox / d) * push;
    pz += (oz / d) * push;
  }

  car.position.x = px;
  car.position.z = pz;
  car.position.y = groundHeight(px, pz);
  car.rotation.y = drive.heading;
  return { moved: res.moved };
}
