// Sunfall City — ambient traffic cars and strolling pedestrians.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';
import { randomRoadPoint, colliders } from './world.js';

const halfOf = () => (CONFIG.city.blocks * CONFIG.city.block) / 2;

function turnToward(heading, target, rate, dt) {
  let diff = target - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return heading + diff * Math.min(1, rate * dt);
}

export function spawnTraffic(scene, count) {
  const cars = [];
  const palette = CONFIG.colors.cars;
  for (let i = 0; i < count; i++) {
    const car = makeCar(palette[Math.floor(Math.random() * palette.length)], Math.random() < 0.28 ? 'van' : 'sedan');
    const spot = randomRoadPoint();
    car.position.set(spot.x, 0, spot.z);
    car.userData.drive.heading = spot.dir;
    car.rotation.y = spot.dir;
    car.userData.ai = { cruise: 8 + Math.random() * 6 };
    scene.add(car);
    cars.push(car);
  }
  return cars;
}

function respawnCar(car, state) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  let spot = randomRoadPoint();
  for (let tries = 0; tries < 14 && Math.hypot(spot.x - px, spot.z - pz) <= 80; tries++) {
    spot = randomRoadPoint();
  }
  car.position.set(spot.x, 0, spot.z);
  const d = car.userData.drive;
  d.heading = spot.dir;
  d.speed = 0;
  car.rotation.y = spot.dir;
}

export function stepTraffic(cars, dt, state) {
  const h = halfOf();
  const cols = colliders();
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  for (const car of cars) {
    if (car === state.car) continue;
    const ai = car.userData.ai;
    if (!ai) continue;
    const d = car.userData.drive;
    if (
      !Number.isFinite(car.position.x) || !Number.isFinite(car.position.z) ||
      !Number.isFinite(d.speed) || !Number.isFinite(d.heading)
    ) {
      respawnCar(car, state);
      continue;
    }
    if (Math.abs(car.position.x) > h + 40 || Math.abs(car.position.z) > h + 40) {
      respawnCar(car, state);
      continue;
    }
    const panic = state.wanted >= 3 && Math.hypot(car.position.x - px, car.position.z - pz) < 40;
    const target = panic ? ai.cruise * 1.9 : ai.cruise;
    if (Math.abs(car.position.x) > h - 22 || Math.abs(car.position.z) > h - 22) {
      d.heading = turnToward(d.heading, Math.atan2(-car.position.x, -car.position.z), 2.4, dt);
    }
    driveCar(car, { throttle: 1 }, dt, cols, cars);
    if (d.speed > target) d.speed = Math.max(target, d.speed - 15 * dt);
  }
}

const shirtPalette = [0xd1495b, 0x3d8f6f, 0x4a6fb5, 0xc9a227, 0x8d5fb0, 0xd97e4a, 0x7d8a97];
const pedSkinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const pedPantsMat = new THREE.MeshLambertMaterial({ color: 0x333950 });
const pedHeadGeo = new THREE.SphereGeometry(0.13, 10, 8);
const pedTorsoGeo = new THREE.CapsuleGeometry(0.21, 0.42, 4, 8);
const pedLegGeo = new THREE.BoxGeometry(0.12, 0.52, 0.14);

export function spawnPedestrians(scene, count) {
  const peds = [];
  const { blocks, block } = CONFIG.city;
  const h = halfOf();
  for (let i = 0; i < count; i++) {
    const ped = new THREE.Group();
    const shirt = new THREE.Mesh(
      pedTorsoGeo,
      new THREE.MeshLambertMaterial({ color: shirtPalette[Math.floor(Math.random() * shirtPalette.length)] })
    );
    shirt.position.y = 0.96;
    const head = new THREE.Mesh(pedHeadGeo, pedSkinMat);
    head.position.y = 1.42;
    const legL = new THREE.Mesh(pedLegGeo, pedPantsMat);
    legL.position.set(-0.09, 0.26, 0);
    const legR = new THREE.Mesh(pedLegGeo, pedPantsMat);
    legR.position.set(0.09, 0.26, 0);
    ped.add(shirt, head, legL, legR);

    const bx = -h + Math.floor(Math.random() * blocks) * block + block / 2;
    const bz = -h + Math.floor(Math.random() * blocks) * block + block / 2;
    const edge = Math.floor(Math.random() * 4);
    const off = (Math.random() * 2 - 1) * 26;
    let x, z, dir;
    if (edge === 0) { x = bx - 28; z = bz + off; dir = Math.random() < 0.5 ? 0 : Math.PI; }
    else if (edge === 1) { x = bx + 28; z = bz + off; dir = Math.random() < 0.5 ? 0 : Math.PI; }
    else if (edge === 2) { x = bx + off; z = bz - 28; dir = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    else { x = bx + off; z = bz + 28; dir = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    ped.position.set(x, 0, z);
    ped.rotation.y = dir;
    ped.userData.ped = { speed: 1.1 + Math.random() * 0.9, dir, fear: Math.random(), down: 0 };
    scene.add(ped);
    peds.push(ped);
  }
  return peds;
}

export function stepPedestrians(peds, dt, state) {
  const h = halfOf();
  const cols = colliders();
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  for (const ped of peds) {
    const p = ped.userData.ped;
    if (!p) continue;
    if (p.down > 0) {
      p.down -= dt;
      ped.rotation.x = Math.PI / 2;
      ped.position.y = 0.35;
      if (p.down <= 0) {
        ped.rotation.x = 0;
        ped.position.y = 0;
      }
      continue;
    }
    const dist = Math.hypot(ped.position.x - px, ped.position.z - pz);
    let speed = p.speed;
    if (state.wanted > 0 && dist < 24) {
      p.dir = Math.atan2(ped.position.x - px, ped.position.z - pz) + (p.fear - 0.5) * 0.6;
      speed = p.speed * 3;
    } else if (Math.abs(ped.position.x) > h - 24 || Math.abs(ped.position.z) > h - 24) {
      p.dir = turnToward(p.dir, Math.atan2(-ped.position.x, -ped.position.z), 3, dt);
    }
    const res = resolveBox(
      ped.position.x,
      ped.position.z,
      ped.position.x + Math.sin(p.dir) * speed * dt,
      ped.position.z + Math.cos(p.dir) * speed * dt,
      cols,
      0.35
    );
    ped.position.x = res.x;
    ped.position.z = res.z;
    ped.rotation.y = p.dir;
  }
}
