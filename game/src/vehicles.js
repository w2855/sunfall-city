// Cars: low-poly, nose facing +z in local space, with one arcade handling model shared
// by the player, traffic and police. driveCar advances nose-first, pushes out of building
// boxes and nudges away from nearby cars so pile-ups slide instead of stacking.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const glassMat = new THREE.MeshBasicMaterial({ color: 0x0b1220 });
const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x10131a });
const headMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const paintMats = new Map(); // one paint material per colour, reused across cars

function paintMat(color) {
  let mat = paintMats.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    paintMats.set(color, mat);
  }
  return mat;
}

export function makeCar(color, kind = 'sedan') {
  const van = kind === 'van';
  const length = van ? 6.2 : 4.6;
  const width = van ? 2.2 : 2.0;
  const paint = paintMat(color);
  const car = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.62, length), paint);
  body.position.y = 0.55;
  car.add(body);

  const cabinH = van ? 1.0 : 0.55;
  const cabinL = van ? length * 0.62 : length * 0.42;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, cabinH, cabinL), glassMat);
  cabin.position.set(0, 0.86 + cabinH / 2, van ? -length * 0.02 : -length * 0.06);
  car.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.66, 0.08, cabinL * 0.62), paint);
  roof.position.set(0, cabin.position.y + cabinH / 2 + 0.05, cabin.position.z);
  car.add(roof);

  const wheels = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (width / 2 - 0.1), 0.33, sz * length * 0.31);
    car.add(wheel);
    wheels.push(wheel);
  }

  for (const s of [1, -1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), headMat);
    head.position.set(s * (width / 2 - 0.34), 0.58, length / 2 + 0.02);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), tailMat);
    tail.position.set(s * (width / 2 - 0.34), 0.58, -length / 2 - 0.02);
    car.add(tail);
  }

  // cruisers carry an emergency light bar: blue and red halves blink in stepPolice
  if (kind === 'cruiser') {
    const barY = roof.position.y + 0.16;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0x5fa8ff }));
    blue.position.set(-0.27, barY, cabin.position.z);
    car.add(blue);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0xff5566 }));
    red.position.set(0.27, barY, cabin.position.z);
    car.add(red);
    car.userData.lightBar = blue;
    car.userData.lightBarRed = red;
  }

  car.userData.drive = { speed: 0, heading: 0, steer: 0, kind, length, width };
  car.userData.wheels = wheels;
  return car;
}

// Circle-vs-AABB push-out: walk every collider box, find the shallowest face and shove
// the point out along it. Returns the corrected position and whether anything moved.
export function resolveBox(x, z, nx, nz, colliders, radius) {
  let px = nx;
  let pz = nz;
  let moved = false;
  for (const c of colliders) {
    const hx = c.w / 2 + radius;
    const hz = c.d / 2 + radius;
    const dx = px - c.x;
    const dz = pz - c.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
    const ox = hx - Math.abs(dx);
    const oz = hz - Math.abs(dz);
    if (ox < oz) px = c.x + (dx >= 0 ? hx : -hx);
    else pz = c.z + (dz >= 0 ? hz : -hz);
    moved = true;
  }
  return { x: px, z: pz, moved };
}

// The shared driving model. input is { throttle, steer, handbrake }; throttle positive
// accelerates toward topSpeed, negative brakes then reverses, no input coasts down and
// the handbrake decays faster. Steering scales with speed so parked cars don't pirouette.
export function driveCar(car, input, dt, colliders, others) {
  const d = car.userData.drive;
  const C = CONFIG.car;
  let speed = d.speed;
  let heading = d.heading;
  const throttle = input.throttle || 0;
  const handbrake = !!input.handbrake;

  if (throttle > 0) {
    speed = Math.min(C.topSpeed, speed + C.accel * dt);
  } else if (throttle < 0) {
    if (speed > 0.6) speed = Math.max(0, speed - C.brake * dt);
    else speed = Math.max(-C.reverseSpeed, speed - C.accel * 0.55 * dt);
  } else {
    const decay = (handbrake ? 14 : 3.2) * dt;
    speed = Math.abs(speed) <= decay ? 0 : speed - Math.sign(speed) * decay;
  }

  const grip = Math.min(1, Math.abs(speed) / 7) * (speed < 0 ? -1 : 1);
  heading += (input.steer || 0) * C.steer * dt * grip;

  // advance nose-first, then push out of buildings
  const ox = car.position.x;
  const oz = car.position.z;
  const nx = ox + Math.sin(heading) * speed * dt;
  const nz = oz + Math.cos(heading) * speed * dt;
  const radius = Math.max(d.width, d.length) * 0.42;
  const res = resolveBox(ox, oz, nx, nz, colliders, radius);
  if (res.moved) speed *= Math.max(0.25, 1 - Math.abs(speed) * 0.06); // scraping a wall bleeds speed

  // nudge away from nearby cars so pile-ups slide apart
  let mx = 0;
  let mz = 0;
  if (others) {
    for (const other of others) {
      if (other === car) continue;
      const dx = res.x - other.position.x;
      const dz = res.z - other.position.z;
      const dist2 = dx * dx + dz * dz;
      const minDist = (d.length + other.userData.drive.length) * 0.38;
      if (dist2 >= minDist * minDist) continue;
      if (dist2 > 1e-6) {
        const dist = Math.sqrt(dist2);
        const push = (minDist - dist) * 0.5;
        mx += (dx / dist) * push;
        mz += (dz / dist) * push;
      } else {
        mx += Math.random() - 0.5;
        mz += Math.random() - 0.5;
      }
    }
  }
  let fin = res;
  if (mx !== 0 || mz !== 0) {
    fin = resolveBox(res.x, res.z, res.x + mx, res.z + mz, colliders, radius);
  }

  car.position.set(fin.x, car.position.y, fin.z);
  car.rotation.y = heading;
  d.speed = speed;
  d.heading = heading;
  d.steer = input.steer || 0;
  if (car.userData.wheels) {
    for (const wheel of car.userData.wheels) wheel.rotation.x += (speed * dt) / 0.33;
  }
  return { moved: res.moved };
}
