// The city's life: cruising traffic and sidewalk strollers. Cars drive nose-first along
// their heading, panic when a wanted player is close, turn back into the grid near the
// city edge and respawn far away when they stray. Every step is NaN-guarded so one bad
// frame can't spread poison through the whole simulation.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { randomRoadPoint, colliders } from './world.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';

const HALF = CONFIG.city.blocks * CONFIG.city.block / 2;
const shirtMats = [0xc0654a, 0x5b7d8f, 0x8f7db0, 0x6e9c6a, 0xb09a5b, 0x9c5b74]
  .map((c) => new THREE.MeshLambertMaterial({ color: c }));
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2b3040 });
const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a06f });

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function respawnCar(car, state) {
  for (let i = 0; i < 10; i++) {
    const spot = randomRoadPoint(Math.random);
    car.position.set(spot.x, 0, spot.z);
    car.rotation.y = spot.dir;
    car.userData.drive.heading = spot.dir;
    car.userData.drive.speed = 0;
    const dx = spot.x - state.pos.x;
    const dz = spot.z - state.pos.z;
    if (dx * dx + dz * dz > 90 * 90) break;
  }
}

export function spawnTraffic(scene, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const kind = Math.random() < 0.22 ? 'van' : 'sedan';
    const color = CONFIG.colors.cars[(Math.random() * CONFIG.colors.cars.length) | 0];
    const car = makeCar(color, kind);
    const spot = randomRoadPoint(Math.random);
    car.position.set(spot.x, 0, spot.z);
    car.rotation.y = spot.dir;
    car.userData.drive.heading = spot.dir;
    car.userData.ai = { cruise: 8 + Math.random() * 6 };
    scene.add(car);
    cars.push(car);
  }
  return cars;
}

export function stepTraffic(cars, dt, state) {
  for (const car of cars) {
    if (car === state.car) continue;
    const ai = car.userData.ai;
    if (!ai) continue; // parked or abandoned cars stay where they were left
    const d = car.userData.drive;

    // guard: a car whose numbers went NaN respawns instead of spreading poison
    if (!Number.isFinite(car.position.x + car.position.z + d.speed + d.heading)) {
      respawnCar(car, state);
      continue;
    }

    const px = car.position.x;
    const pz = car.position.z;
    const distP = Math.hypot(state.pos.x - px, state.pos.z - pz);
    const panic = state.wanted >= 3 && distP < 40;
    const target = panic ? ai.cruise * 1.9 : ai.cruise;

    // turn back into the grid near the city edge
    let steer = 0;
    if (Math.abs(px) > HALF - 8 || Math.abs(pz) > HALF - 8) {
      const inward = Math.atan2(-px, -pz);
      steer = Math.max(-1, Math.min(1, wrapAngle(inward - d.heading) * 1.5));
    }
    const throttle = d.speed < target ? 1 : (d.speed > target + 2 ? -0.3 : 0);
    driveCar(car, { throttle, steer, handbrake: false }, dt, colliders(), cars);

    // strayed beyond the city: respawn far from the player
    if (Math.hypot(px, pz) > HALF + 40) respawnCar(car, state);
  }
}

function sidewalkSpot() {
  const c = CONFIG.city;
  const slabHalf = (c.block - c.road) / 2 - 2;
  const bi = (Math.random() * c.blocks) | 0;
  const bj = (Math.random() * c.blocks) | 0;
  const cx = -HALF + bi * c.block + c.block / 2;
  const cz = -HALF + bj * c.block + c.block / 2;
  const t = (Math.random() * 2 - 1) * slabHalf;
  const side = (Math.random() * 4) | 0;
  if (side === 0) return { x: cx + t, z: cz - slabHalf };
  if (side === 1) return { x: cx + t, z: cz + slabHalf };
  if (side === 2) return { x: cx - slabHalf, z: cz + t };
  return { x: cx + slabHalf, z: cz + t };
}

function makePed(x, z) {
  const ped = new THREE.Group();
  const shirt = shirtMats[(Math.random() * shirtMats.length) | 0];
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 3, 8), shirt);
  torso.position.y = 1.02;
  ped.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skinMat);
  head.position.y = 1.58;
  ped.add(head);
  const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
  legGeo.translate(0, -0.25, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.1, 0.55, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.1, 0.55, 0);
  ped.add(legL, legR);
  ped.position.set(x, 0, z);
  ped.userData.ped = { speed: 1.1 + Math.random() * 1.3, dir: Math.random() * Math.PI * 2, fear: Math.random(), downT: 0 };
  ped.userData.hitMesh = torso; // torso carries pedRef for the shooting ray
  torso.userData.pedRef = ped;
  return ped;
}

export function spawnPedestrians(scene, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const spot = sidewalkSpot();
    const ped = makePed(spot.x, spot.z);
    scene.add(ped);
    peds.push(ped);
  }
  return peds;
}

export function stepPedestrians(peds, dt, state) {
  for (const ped of peds) {
    const p = ped.userData.ped;

    // guard: a walker whose numbers went NaN gets put back on a sidewalk
    if (!Number.isFinite(ped.position.x + ped.position.z + p.dir)) {
      const spot = sidewalkSpot();
      ped.position.set(spot.x, 0, spot.z);
      p.dir = Math.random() * Math.PI * 2;
      continue;
    }

    // knocked down: lie flat until the timer runs out
    if (p.downT > 0) {
      p.downT -= dt;
      ped.rotation.x = p.downT > 0 ? -Math.PI / 2 : 0;
      continue;
    }

    const dx = state.pos.x - ped.position.x;
    const dz = state.pos.z - ped.position.z;
    const dist = Math.hypot(dx, dz);
    let speed = p.speed;
    if (state.wanted > 0 && dist < 24) {
      p.dir = Math.atan2(ped.position.x - state.pos.x, ped.position.z - state.pos.z);
      speed = p.speed * 3; // flee
    } else if (Math.abs(ped.position.x) > HALF - 5 || Math.abs(ped.position.z) > HALF - 5) {
      // turn away from the city edge
      const inward = Math.atan2(-ped.position.x, -ped.position.z);
      p.dir += Math.max(-2 * dt, Math.min(2 * dt, wrapAngle(inward - p.dir)));
    }

    const nx = ped.position.x + Math.sin(p.dir) * speed * dt;
    const nz = ped.position.z + Math.cos(p.dir) * speed * dt;
    const res = resolveBox(ped.position.x, ped.position.z, nx, nz, colliders(), 0.4);
    ped.position.set(res.x, 0, res.z);
    ped.rotation.y = p.dir;
  }
}
