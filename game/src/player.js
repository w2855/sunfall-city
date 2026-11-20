// Sunfall City — the on-foot avatar, player state and the walking model.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveBox } from './vehicles.js';

const jacketMat = new THREE.MeshLambertMaterial({ color: 0xd1495b });
const skinMat = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
const capMat = new THREE.MeshLambertMaterial({ color: 0x232742 });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2e3444 });
const gunMat = new THREE.MeshLambertMaterial({ color: 0x1d2029 });

export function makeAvatar() {
  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), jacketMat);
  torso.position.y = 1.06;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
  head.position.y = 1.57;
  g.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.34), capMat);
  cap.position.set(0, 1.72, -0.02);
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.14), capMat);
  brim.position.set(0, 1.68, 0.2);
  g.add(brim);

  const limb = (w, h, dd, mat, px, py) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const legL = limb(0.17, 0.78, 0.19, pantsMat, -0.12, 0.76);
  const legR = limb(0.17, 0.78, 0.19, pantsMat, 0.12, 0.76);
  const armL = limb(0.13, 0.6, 0.15, jacketMat, -0.31, 1.32);
  const armR = limb(0.13, 0.6, 0.15, jacketMat, 0.31, 1.32);

  const gun = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), gunMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.24), gunMat);
  barrel.position.set(0, 0.05, 0.1);
  gun.add(grip, barrel);
  gun.position.set(0, -0.62, 0.1);
  gun.visible = false;
  armR.add(gun);

  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.gun = gun;
  return g;
}

export function createPlayerState(spawn) {
  return {
    pos: spawn.clone(),
    heading: Math.PI,
    onFoot: true,
    car: null,
    health: 100,
    money: 500,
    wanted: 0,
    wantedHeat: 0,
    armed: false,
    walkPhase: 0,
    alive: true,
    deliveries: 0,
  };
}

export function stepOnFoot(state, avatar, input, dt, colliders, cameraBearing) {
  const C = CONFIG.player;
  const fx = Math.sin(cameraBearing);
  const fz = Math.cos(cameraBearing);
  const rx = Math.cos(cameraBearing);
  const rz = -Math.sin(cameraBearing);
  const f = (input.has('KeyW') ? 1 : 0) - (input.has('KeyS') ? 1 : 0);
  const s = (input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0);
  const sprint = input.has('ShiftLeft') || input.has('ShiftRight');
  const speed = sprint ? C.runSpeed : C.walkSpeed;

  let mx = fx * f + rx * s;
  let mz = fz * f + rz * s;
  const len = Math.hypot(mx, mz);
  if (len > 0.001) {
    mx = (mx / len) * speed * dt;
    mz = (mz / len) * speed * dt;
    const res = resolveBox(state.pos.x, state.pos.z, state.pos.x + mx, state.pos.z + mz, colliders, C.radius);
    state.pos.x = res.x;
    state.pos.z = res.z;
    state.heading = Math.atan2(mx, mz);
    state.walkPhase += Math.hypot(mx, mz) * 2.3;
  }

  avatar.position.set(state.pos.x, 0, state.pos.z);
  avatar.rotation.y = state.heading;

  const swing = len > 0.001 ? Math.sin(state.walkPhase) * 0.55 : 0;
  const u = avatar.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.7;
  if (state.armed) {
    u.armR.rotation.x = -Math.PI / 2;
    u.gun.visible = true;
  } else {
    u.armR.rotation.x = swing * 0.7;
    u.gun.visible = false;
  }
}

export function nearestCar(state, cars, reach) {
  let best = null;
  let bestDist = reach;
  for (const car of cars) {
    const dist = Math.hypot(car.position.x - state.pos.x, car.position.z - state.pos.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}
