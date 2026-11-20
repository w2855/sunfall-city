// Ambient life: cruising traffic cars and strolling pedestrians, both panic-prone.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';
import { randomRoadPoint, CITY_HALF, groundHeight, colliders as cityColliders } from './world.js';

const block = CONFIG.city.block;
const road = CONFIG.city.road;
const lane = road * 0.25;

const CAR_COLORS = CONFIG.colors.cars;
const PED_SHIRTS = [0xe0e4ea, 0xf78c6b, 0x118ab2, 0xffd166, 0x8d99ae, 0x06d6a0, 0xc77dff, 0xef476f];
const PED_SKINS = [0xd9a066, 0xb97f52, 0x8a5c3c, 0xe8b98a];

const nearestLine = (v) => -CITY_HALF + Math.round((v + CITY_HALF) / block) * block;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function spawnTraffic(scene, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const color = CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
    const car = makeCar(color, Math.random() < 0.18 ? 'van' : 'sedan');
    const spot = randomRoadPoint();
    car.position.set(spot.x, 0, spot.z);
    car.userData.drive.heading = spot.dir;
    car.userData.ai = {
      cruise: 8 + Math.random() * 6,
      turnIn: 8 + Math.random() * 16,
      swayPhase: Math.random() * 6.28,
    };
    scene.add(car);
    cars.push(car);
  }
  return cars;
}

function respawnCar(car, scene, px, pz) {
  let spot = randomRoadPoint();
  for (let tries = 0; tries < 8; tries++) {
    spot = randomRoadPoint();
    if (Math.hypot(spot.x - px, spot.z - pz) > 80) break;
  }
  car.position.set(spot.x, 0, spot.z);
  const drive = car.userData.drive;
  drive.speed = 0;
  drive.heading = spot.dir;
}

// Every free car: cruise the lanes, panic when the heat is high, never leave the grid for long.
export function stepTraffic(cars, dt, state) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  const wanted = state.wanted;

  for (const car of cars) {
    if (car === state.car) continue;
    const drive = car.userData.drive;
    const ai = car.userData.ai;

    // A car whose numbers went NaN respawns instead of spreading poison.
    if (
      !Number.isFinite(car.position.x) || !Number.isFinite(car.position.z) ||
      !Number.isFinite(drive.speed) || !Number.isFinite(drive.heading)
    ) {
      respawnCar(car, px, pz);
      continue;
    }

    const distToPlayer = Math.hypot(car.position.x - px, car.position.z - pz);
    const panic = wanted >= 3 && distToPlayer < 40;

    // Turn onto a crossing lane now and then; panic makes it twitchy.
    ai.turnIn -= dt * (panic ? 2.5 : 1);
    if (ai.turnIn <= 0) {
      ai.turnIn = 8 + Math.random() * 16;
      const alongX = Math.abs(Math.sin(drive.heading)) > 0.5;
      const lz = nearestLine(car.position.z);
      const lx = nearestLine(car.position.x);
      if (alongX && Math.abs(car.position.z - lz) < 6) {
        drive.heading = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.position.z = lz + (drive.heading === Math.PI / 2 ? lane : -lane);
      } else if (!alongX && Math.abs(car.position.x - lx) < 6) {
        drive.heading = Math.random() < 0.5 ? 0 : Math.PI;
        car.position.x = lx + (drive.heading === 0 ? -lane : lane);
      }
    }

    // Near the rim and still heading outward: fold back into the grid.
    if (Math.abs(car.position.x) > CITY_HALF - 8 && Math.sin(drive.heading) * car.position.x > 0) {
      drive.heading = car.position.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      car.position.z = nearestLine(car.position.z) + (drive.heading === Math.PI / 2 ? lane : -lane);
    }
    if (Math.abs(car.position.z) > CITY_HALF - 8 && Math.cos(drive.heading) * car.position.z > 0) {
      drive.heading = car.position.z > 0 ? Math.PI : 0;
      car.position.x = nearestLine(car.position.x) + (drive.heading === 0 ? -lane : lane);
    }

    if (panic) drive.heading += Math.sin(ai.swayPhase + ai.turnIn * 3.1) * 0.8 * dt;

    // Match cruise speed, faster and wilder under panic.
    const target = panic ? Math.min(26, ai.cruise * 2.4) : ai.cruise;
    const throttle = drive.speed < target ? 1 : drive.speed > target + 2 ? -0.6 : 0;
    driveCar(car, { throttle, steer: 0, handbrake: false }, dt, cityColliders(), cars);

    // Strayed beyond the city plus 40 metres: respawn far from the player.
    if (
      Math.abs(car.position.x) > CITY_HALF + 40 ||
      Math.abs(car.position.z) > CITY_HALF + 40
    ) {
      respawnCar(car, px, pz);
    }
  }
}

const shirtMat = (color) => new THREE.MeshLambertMaterial({ color });
const pedSkinMats = PED_SKINS.map(shirtMat);
const legMat = new THREE.MeshLambertMaterial({ color: 0x2c2e3e });

// A capsule little person: torso, head, two legs, origin at the feet.
function makePed() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.62, 8),
    shirtMat(PED_SHIRTS[(Math.random() * PED_SHIRTS.length) | 0]),
  );
  torso.position.y = 0.86;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    pedSkinMats[(Math.random() * pedSkinMats.length) | 0],
  );
  head.position.y = 1.38;
  group.add(head);
  const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
  legGeo.translate(0, -0.275, 0); // pivot at the hip
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.55, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.13, 0.55, 0);
  group.add(legL, legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function spawnPedestrians(scene, count) {
  const peds = [];
  const half = CITY_HALF;
  for (let i = 0; i < count; i++) {
    const ped = makePed();
    const bx = -half + block / 2 + ((Math.random() * CONFIG.city.blocks) | 0) * block;
    const bz = -half + block / 2 + ((Math.random() * CONFIG.city.blocks) | 0) * block;
    const r = block / 2 - road / 2 - 2;
    ped.position.set(
      bx + (Math.random() * 2 - 1) * r,
      0.3,
      bz + (Math.random() * 2 - 1) * r,
    );
    ped.userData.ped = {
      speed: 1.1 + Math.random() * 1.1,
      dir: Math.random() * Math.PI * 2,
      home: { x: bx, z: bz, r },
      scareUntil: 0,
      phase: Math.random() * 6.28,
      dead: false,
    };
    scene.add(ped);
    peds.push(ped);
  }
  return peds;
}

// Pedestrians stroll their sidewalks, turn back near the rim, and flee the wanted player.
export function stepPedestrians(peds, dt, state, time) {
  const px = state.car ? state.car.position.x : state.pos.x;
  const pz = state.car ? state.car.position.z : state.pos.z;
  const wanted = state.wanted;

  for (const ped of peds) {
    const pd = ped.userData.ped;
    if (pd.dead) continue;

    if (!Number.isFinite(ped.position.x) || !Number.isFinite(ped.position.z) || !Number.isFinite(pd.dir)) {
      ped.position.set(pd.home.x, 0.3, pd.home.z);
      pd.dir = Math.random() * Math.PI * 2;
      continue;
    }

    const distToPlayer = Math.hypot(ped.position.x - px, ped.position.z - pz);
    let speed = pd.speed;
    const fleeing = (wanted > 0 && distToPlayer < 24) || time < pd.scareUntil;
    if (fleeing) {
      // Run straight away from the player, three times the stroll speed.
      pd.dir = Math.atan2(ped.position.x - px, ped.position.z - pz);
      speed = pd.speed * 3;
    } else {
      // Keep inside the home slab; drift the heading gently.
      if (
        Math.abs(ped.position.x - pd.home.x) > pd.home.r ||
        Math.abs(ped.position.z - pd.home.z) > pd.home.r
      ) {
        pd.dir = Math.atan2(pd.home.x - ped.position.x, pd.home.z - ped.position.z);
      } else {
        pd.dir += Math.sin(time * 0.6 + pd.phase) * 0.4 * dt;
      }
    }

    const nx = ped.position.x + Math.sin(pd.dir) * speed * dt;
    const nz = ped.position.z + Math.cos(pd.dir) * speed * dt;
    const res = resolveBox(ped.position.x, ped.position.z, nx, nz, cityColliders(), 0.35);
    ped.position.x = res.x;
    ped.position.z = res.z;
    ped.position.y = groundHeight(res.x, res.z);

    // Leg swing, faster when fleeing.
    pd.phase += speed * dt * 4;
    const swing = Math.sin(pd.phase) * (fleeing ? 0.75 : 0.45);
    ped.userData.legL.rotation.x = swing;
    ped.userData.legR.rotation.x = -swing;
  }
}
