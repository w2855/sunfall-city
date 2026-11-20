// The player: a low-poly avatar, the state bag, and walking around the city.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveBox } from './vehicles.js';
import { groundHeight } from './world.js';

const jacketMat = new THREE.MeshLambertMaterial({ color: 0xd7263d });
const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const capMat = new THREE.MeshLambertMaterial({ color: 0x1d1f2a });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x23233a });
const gunMat = new THREE.MeshLambertMaterial({ color: 0x2a2d38 });

// A low-poly person. Limbs pivot at their tops; the gun rides the right arm.
export function makeAvatar() {
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacketMat);
  torso.position.y = 1.12;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.72;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.38), capMat);
  cap.position.y = 1.92;
  group.add(cap);

  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  legGeo.translate(0, -0.36, 0); // pivot at the hip
  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.16, 0.76, 0);
  const legR = new THREE.Mesh(legGeo, darkMat);
  legR.position.set(0.16, 0.76, 0);
  group.add(legL, legR);

  const armGeo = new THREE.BoxGeometry(0.17, 0.62, 0.19);
  armGeo.translate(0, -0.31, 0); // pivot at the shoulder
  const armL = new THREE.Mesh(armGeo, jacketMat);
  armL.position.set(-0.42, 1.42, 0);
  const armR = new THREE.Mesh(armGeo, jacketMat);
  armR.position.set(0.42, 1.42, 0);
  group.add(armL, armR);

  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.34), gunMat);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), gunMat);
  grip.position.set(0, -0.12, 0.06);
  gun.add(barrel, grip);
  gun.position.set(0, -0.58, 0.12);
  gun.visible = false;
  armR.add(gun);

  group.userData = { legL, legR, armL, armR, gun };
  return group;
}

export function createPlayerState(spawn) {
  return {
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    heading: spawn.heading ?? 0,
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

// One walking step: WASD relative to the camera bearing, resolved out of buildings.
export function stepOnFoot(state, avatar, input, dt, colliders, cameraBearing) {
  const mz = input.moveZ || 0; // forward/back
  const mx = input.moveX || 0; // right/left
  let dx = 0;
  let dz = 0;
  let speed = 0;

  if (mx !== 0 || mz !== 0) {
    const sinB = Math.sin(cameraBearing);
    const cosB = Math.cos(cameraBearing);
    // forward = (sinB, cosB); right = (-cosB, sinB)
    dx = sinB * mz - cosB * mx;
    dz = cosB * mz + sinB * mx;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      speed = (input.sprint && state.onFoot ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed) * (input.immobilized ? 0 : 1);
    }
  }

  const nx = state.pos.x + dx * speed * dt;
  const nz = state.pos.z + dz * speed * dt;
  const res = resolveBox(state.pos.x, state.pos.z, nx, nz, colliders, CONFIG.player.radius);
  state.pos.x = res.x;
  state.pos.z = res.z;
  state.pos.y = groundHeight(res.x, res.z);

  if (speed > 0) {
    state.heading = Math.atan2(dx, dz);
    state.walkPhase += speed * dt * 2.4;
  }

  // Pose the avatar: position, heading, swinging limbs, the gun arm.
  avatar.position.set(state.pos.x, state.pos.y, state.pos.z);
  avatar.rotation.y = state.heading;
  const { legL, legR, armL, armR, gun } = avatar.userData;
  const swing = Math.sin(state.walkPhase) * 0.62;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  if (state.armed) {
    armR.rotation.x = -Math.PI / 2; // pistol raised
  } else {
    armR.rotation.x = swing * 0.8;
  }
  gun.visible = state.armed;
}

// The closest car within reach of the player, for entering and exiting.
export function nearestCar(state, cars, reach) {
  let best = null;
  let bestD = reach;
  for (const car of cars) {
    const dx = car.position.x - state.pos.x;
    const dz = car.position.z - state.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
