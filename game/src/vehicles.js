// Sunfall City — low-poly vehicles and the driving/collision model.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x0e1424 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14151c });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
wheelGeo.rotateZ(Math.PI / 2); // axle along x so the wheels can roll
const headGeo = new THREE.BoxGeometry(0.3, 0.14, 0.08);
const tailGeo = new THREE.BoxGeometry(0.34, 0.12, 0.08);

export function makeCar(color, kind = 'sedan') {
  const car = new THREE.Group();
  const van = kind === 'van';
  const length = van ? 5.8 : 4.6;
  const width = van ? 2.2 : 2.0;
  const bodyMat = new THREE.MeshLambertMaterial({ color });

  const bodyH = van ? 0.72 : 0.55;
  const bodyY = van ? 0.62 : 0.52;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, bodyH, length), bodyMat);
  body.position.y = bodyY;
  car.add(body);
  const bodyTop = bodyY + bodyH / 2;

  const cabinH = van ? 0.95 : 0.52;
  const cabinL = van ? 3.4 : 2.3;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width - 0.24, cabinH, cabinL), glassMat);
  cabin.position.set(0, bodyTop + cabinH / 2, van ? -0.3 : -0.15);
  car.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width - 0.34, 0.12, cabinL - 0.2), bodyMat);
  roof.position.set(0, bodyTop + cabinH + 0.06, cabin.position.z);
  car.add(roof);

  const wx = width / 2 - 0.12;
  const wz = length / 2 - 0.85;
  for (const [px, pz] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.position.set(px, 0.36, pz);
    car.add(wheel);
  }

  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(s * width * 0.3, bodyTop - 0.15, length / 2 + 0.02);
    car.add(head);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(s * width * 0.3, bodyTop - 0.12, -length / 2 - 0.02);
    car.add(tail);
  }

  if (kind === 'cruiser') {
    const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.34), new THREE.MeshBasicMaterial({ color: 0x2f66ff, transparent: true, opacity: 1 }));
    barBlue.position.set(-0.34, roof.position.y + 0.18, 0);
    const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2e4d, transparent: true, opacity: 0.15 }));
    barRed.position.set(0.34, roof.position.y + 0.18, 0);
    car.add(barBlue, barRed);
    car.userData.lightBar = barBlue;
    car.userData.lightBarRed = barRed;
  }

  car.userData.drive = { speed: 0, heading: 0, steer: 0, kind, length, width };
  return car;
}

export function resolveBox(x, z, nx, nz, colliders, radius) {
  let px = nx;
  let pz = nz;
  let moved = false;
  for (const c of colliders) {
    const hw = c.w / 2 + radius;
    const hd = c.d / 2 + radius;
    const dx = px - c.x;
    const dz = pz - c.z;
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
    const ox = hw - Math.abs(dx);
    const oz = hd - Math.abs(dz);
    if (dx === 0 && dz === 0) {
      const mdx = nx - x;
      const mdz = nz - z;
      if (Math.abs(mdx) >= Math.abs(mdz)) px = c.x + (mdx >= 0 ? hw : -hw);
      else pz = c.z + (mdz >= 0 ? hd : -hd);
    } else if (ox <= oz) {
      px = c.x + (dx >= 0 ? hw : -hw);
    } else {
      pz = c.z + (dz >= 0 ? hd : -hd);
    }
    moved = true;
  }
  return { x: px, z: pz, moved };
}

export function driveCar(car, input, dt, colliders, others = []) {
  const d = car.userData.drive;
  const C = CONFIG.car;
  const throttle = input.throttle || 0;
  const steer = input.steer || 0;
  const handbrake = Boolean(input.handbrake);

  if (handbrake) {
    d.speed -= d.speed * Math.min(1, 3.4 * dt);
  } else if (throttle > 0) {
    d.speed += C.accel * throttle * dt;
    if (d.speed > C.topSpeed) d.speed = C.topSpeed;
  } else if (throttle < 0) {
    if (d.speed > 0.4) {
      d.speed -= C.brake * dt;
      if (d.speed < 0) d.speed = 0;
    } else {
      d.speed -= C.accel * 0.55 * dt;
      if (d.speed < -C.reverseSpeed) d.speed = -C.reverseSpeed;
    }
  } else {
    d.speed -= d.speed * Math.min(1, 0.7 * dt);
    if (Math.abs(d.speed) < 0.06) d.speed = 0;
  }

  d.steer = steer;
  const speedFactor = Math.min(1, Math.abs(d.speed) / 9);
  d.heading += steer * C.steer * dt * speedFactor * (d.speed < 0 ? -1 : 1);

  const x = car.position.x;
  const z = car.position.z;
  const nx = x + Math.sin(d.heading) * d.speed * dt;
  const nz = z + Math.cos(d.heading) * d.speed * dt;
  const res = resolveBox(x, z, nx, nz, colliders, 1.05);
  if (res.moved) d.speed *= 0.35;
  car.position.x = res.x;
  car.position.z = res.z;

  for (const o of others) {
    if (!o || o === car || !o.userData || !o.userData.drive) continue;
    const dx = car.position.x - o.position.x;
    const dz = car.position.z - o.position.z;
    const dist = Math.hypot(dx, dz);
    const minDist = 3.6;
    if (dist > 0.0001 && dist < minDist) {
      const push = ((minDist - dist) / dist) * 0.5;
      car.position.x += dx * push;
      car.position.z += dz * push;
      o.position.x -= dx * push * 0.5;
      o.position.z -= dz * push * 0.5;
    }
  }

  car.rotation.y = d.heading;
  return { moved: res.moved };
}
