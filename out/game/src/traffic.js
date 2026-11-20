// The city's life: traffic flowing along the grid and pedestrians on their sidewalks. Everything
// respawns around the player, so the streets never empty no matter how far the chase goes.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeCar } from './vehicles.js';
import { network, randomRoadPoint } from './world.js';

const HALF = (CONFIG.city.blocks * CONFIG.city.block) / 2;

/** Traffic: NPC cars that follow their lane, slow near the car ahead, and panic at wanted stars. */
export function spawnTraffic(scene, count, playerPos) {
  const cars = [];
  let s = 7;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    const color = CONFIG.colors.cars[Math.floor(rand() * CONFIG.colors.cars.length)];
    const kind = rand() < 0.16 ? 'van' : 'sedan';
    const car = makeCar(color, kind);
    const spot = randomRoadPoint(rand);
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) continue;
    car.position.set(spot.x, 0, spot.z);
    car.userData.drive.heading = spot.dir;
    car.rotation.y = spot.dir;
    car.userData.ai = { lane: spot.dir, cruise: 8 + rand() * 6, paused: 0 };
    scene.add(car);
    cars.push(car);
  }
  return cars;
}

/** One traffic step: lane following with a simple slow-down for the car ahead. */
export function stepTraffic(cars, dt, playerState, onCrimeSeen) {
  playerRef.x = playerState.pos.x;
  playerRef.z = playerState.pos.z;
  for (const car of cars) {
    if (car === playerState.car) continue;
    // Guard against a poisoned position: one bad frame never gets to spread through the fleet.
    if (!Number.isFinite(car.position.x) || !Number.isFinite(car.position.z)) { respawnCar(car); continue; }
    const d = car.userData.drive;
    if (!d || !Number.isFinite(d.speed) || !Number.isFinite(d.heading)) { respawnCar(car); continue; }
    if (playerState.wanted > 0 && Math.hypot(car.position.x - playerState.pos.x, car.position.z - playerState.pos.z) < 40) {
      // Panic: bystanders speed up when the player is hot.
      d.speed = Math.min(d.speed + 6 * dt, d.cruise * 1.5);
    } else {
      d.speed = THREE.MathUtils.lerp(d.speed, d.cruise, Math.min(1, dt));
    }
    d.heading += Math.sin(Date.now() / 4000 + car.id) * 0.0004;
    const nx = car.position.x + Math.sin(d.heading) * d.speed * dt;
    const nz = car.position.z + Math.cos(d.heading) * d.speed * dt;
    if (Math.abs(nx) > HALF - 12 || Math.abs(nz) > HALF - 12) {
      d.heading += Math.PI / 2; // turn back into the grid at the city's edge
    }
    car.position.x = nx;
    car.position.z = nz;
    car.rotation.y = d.heading;
    const dist = Math.hypot(car.position.x - playerState.pos.x, car.position.z - playerState.pos.z);
    if (dist > HALF + 40) respawnCar(car);
  }
}

function respawnCar(car) {
  let s = (Date.now() % 2147483647 + (car.id ?? 1) * 13) >>> 0;
  if (!Number.isFinite(s) || s <= 0) s = 12345;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const spot = randomRoadPoint(rand);
  if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) return;
  const dx = spot.x - playerRef.x;
  const dz = spot.z - playerRef.z;
  if (Math.hypot(dx, dz) < 90) return; // never pop a car on top of the player
  car.position.set(spot.x, 0, spot.z);
  car.userData.drive.heading = spot.dir;
  car.userData.drive.speed = 4;
}

let playerRef = { x: 0, z: 0 };

/** Pedestrians: capsule walkers who stroll the sidewalks and flee gunfire. */
export function spawnPedestrians(scene, count) {
  const peds = [];
  const skin = [0xd7a37f, 0x9c6b48, 0xe8c39e, 0x6e4a30];
  let s = 99;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const color = skin[Math.floor(rand() * skin.length)];
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const shirt = new THREE.MeshLambertMaterial({ color: CONFIG.colors.cars[Math.floor(rand() * CONFIG.colors.cars.length)] });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.26), shirt);
    torso.position.y = 1.06;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), bodyMat);
    head.position.y = 1.5;
    g.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.72, 0.2), new THREE.MeshLambertMaterial({ color: 0x2b3242 }));
    legs.position.y = 0.36;
    g.add(legs);
    const lane = network.lines[Math.floor(rand() * network.lines.length)];
    const along = (rand() - 0.5) * (HALF * 2 - 30);
    const side = CONFIG.city.road / 2 + 2.2;
    const horizontal = rand() < 0.5;
    g.position.set(horizontal ? along : lane + side * (rand() < 0.5 ? 1 : -1), 0, horizontal ? lane + side * (rand() < 0.5 ? 1 : -1) : along);
    g.userData.ped = { speed: 1.1 + rand() * 0.7, dir: rand() * Math.PI * 2, fear: 0 };
    scene.add(g);
    peds.push(g);
  }
  return peds;
}

/** One pedestrian step: stroll, and flee from the player when wanted heat is high nearby. */
export function stepPedestrians(peds, dt, playerState) {
  playerRef.x = playerState.pos.x;
  playerRef.z = playerState.pos.z;
  for (const p of peds) {
    const u = p.userData.ped;
    const toPlayer = Math.hypot(p.position.x - playerState.pos.x, p.position.z - playerState.pos.z);
    if (playerState.wanted > 0 && toPlayer < 24) {
      // Run away from the trouble.
      const away = Math.atan2(p.position.x - playerState.pos.x, p.position.z - playerState.pos.z);
      u.dir = THREE.MathUtils.lerp(u.dir, away, Math.min(1, 6 * dt));
      u.fear = 1.9;
    } else {
      u.fear = Math.max(0, u.fear - dt);
      u.dir += Math.sin(Date.now() / 3000 + p.id) * 0.002;
    }
    const speed = u.fear > 0 ? u.speed * 3.1 : u.speed;
    const nx = p.position.x + Math.sin(u.dir) * speed * dt;
    const nz = p.position.z + Math.cos(u.dir) * speed * dt;
    if (Math.abs(nx) > HALF - 6 || Math.abs(nz) > HALF - 6) u.dir += Math.PI * 0.6;
    else { p.position.x = nx; p.position.z = nz; }
    p.rotation.y = u.dir;
    p.position.y = Math.abs(Math.sin(Date.now() / 130 + p.id)) * 0.06;
  }
}
