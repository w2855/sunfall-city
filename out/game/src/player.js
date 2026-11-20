// The runner you play: a low-poly avatar with swinging limbs and a pistol that raises
// when drawn, plus the player state and on-foot movement relative to the camera bearing.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveBox } from './vehicles.js';
import { groundHeight } from './world.js';

const skinMat = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
const jacketMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2b3040 });
const capMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
const gunMat = new THREE.MeshLambertMaterial({ color: 0x14161c });

export function makeAvatar() {
  const avatar = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), jacketMat);
  torso.position.y = 1.15;
  avatar.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
  head.position.y = 1.62;
  avatar.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), capMat);
  cap.position.y = 1.78;
  avatar.add(cap);

  // limbs pivot at their top: geometry is translated down inside the mesh
  const legGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);
  legGeo.translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.12, 0.84, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.12, 0.84, 0);
  avatar.add(legL, legR);

  const armGeo = new THREE.BoxGeometry(0.13, 0.52, 0.15);
  armGeo.translate(0, -0.26, 0);
  const armL = new THREE.Mesh(armGeo, jacketMat);
  armL.position.set(-0.33, 1.4, 0);
  const armR = new THREE.Mesh(armGeo, jacketMat);
  armR.position.set(0.33, 1.4, 0);
  avatar.add(armL, armR);

  // the pistol hangs off the gun arm's hand, hidden until drawn
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.32), gunMat);
  barrel.position.set(0, -0.5, 0.14);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), gunMat);
  grip.position.set(0, -0.56, 0.02);
  gun.add(barrel, grip);
  gun.visible = false;
  armR.add(gun);

  avatar.userData = { legL, legR, armL, armR, gun };
  return avatar;
}

export function createPlayerState(spawn) {
  return {
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    heading: 0,
    onFoot: true,
    car: null,
    health: 100,
    money: 500,
    wanted: 0,
    wantedHeat: 0,
    grace: 0, // seconds before heat may start cooling again after a crime
    armed: false,
    walkPhase: 0,
    alive: true,
    deliveries: 0,
  };
}

// WASD relative to the camera bearing, sprint on Shift, building push-out, heading faces
// the movement, limbs swing with walkPhase, and the gun arm raises when armed.
export function stepOnFoot(state, avatar, input, dt, colliders, cameraBearing) {
  const fx = Math.sin(cameraBearing);
  const fz = Math.cos(cameraBearing);
  const forward = input.forward || 0;
  const strafe = input.strafe || 0;
  // right of the bearing is (-fz, fx); movement is the mix of forward and strafe
  let mx = fx * forward - fz * strafe;
  let mz = fz * forward + fx * strafe;
  const len = Math.hypot(mx, mz);
  const C = CONFIG.player;

  if (len > 0.01) {
    if (len > 1) { mx /= len; mz /= len; }
    const speed = input.sprint ? C.runSpeed : C.walkSpeed;
    const nx = state.pos.x + mx * speed * dt;
    const nz = state.pos.z + mz * speed * dt;
    const res = resolveBox(state.pos.x, state.pos.z, nx, nz, colliders, C.radius);
    state.pos.set(res.x, 0, res.z);
    state.heading = Math.atan2(mx, mz);
    state.walkPhase += speed * dt * 1.85;
  }

  avatar.position.set(state.pos.x, groundHeight(state.pos.x, state.pos.z), state.pos.z);
  avatar.rotation.y = state.heading;
  const u = avatar.userData;
  const swing = len > 0.01 ? Math.sin(state.walkPhase) * 0.62 : Math.sin(state.walkPhase) * 0.02;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.75;
  u.armR.rotation.x = state.armed ? -Math.PI / 2 : swing * 0.75;
  u.gun.visible = !!state.armed;
}

// The closest car within reach of the player, or null.
export function nearestCar(state, cars, reach) {
  if (state.car) return null;
  let best = null;
  let bestD = reach * reach;
  for (const car of cars) {
    const dx = car.position.x - state.pos.x;
    const dz = car.position.z - state.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = car;
    }
  }
  return best;
}
