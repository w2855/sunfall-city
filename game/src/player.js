// The player: one agent on foot and behind whatever wheel they steal. Walking, driving, shooting,
// health, money, wanted stars — the state every other system reads.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveBox } from './vehicles.js';

const P = CONFIG.player;

/** Build the on-foot avatar: a low-poly runner with a jacket the camera can always tell apart. */
export function makeAvatar() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd7a37f });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xef476f });
  const pants = new THREE.MeshLambertMaterial({ color: 0x232a36 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.18;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), skin);
  head.position.y = 1.78;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x14202e }));
  cap.position.y = 1.94;
  g.add(cap);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.82, 0.24), pants);
    leg.position.set(sx * 0.16, 0.41, 0);
    g.add(leg);
    g.userData['leg' + (sx < 0 ? 'L' : 'R')] = leg;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), jacket);
    arm.position.set(sx * 0.42, 1.2, 0);
    g.add(arm);
    g.userData['arm' + (sx < 0 ? 'L' : 'R')] = arm;
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x11151c }));
  gun.position.set(0.42, 0.86, 0.26);
  gun.visible = false;
  g.add(gun);
  g.userData.gun = gun;
  return g;
}

/** The player's whole live state, created once per session. */
export function createPlayerState(spawn) {
  return {
    pos: spawn.clone(),
    heading: 0,
    onFoot: true,
    car: null,
    health: 100,
    money: 500,
    wanted: 0,
    wantedHeat: 0,
    armed: false,
    walkPhase: 0,
    alive: true,
    kills: 0,
    deliveries: 0,
  };
}

/** One on-foot movement step, with building collision and a slight walk animation. */
export function stepOnFoot(state, avatar, input, dt, colliders, cameraBearing) {
  const speed = input.sprint ? P.runSpeed : P.walkSpeed;
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += -Math.sin(cameraBearing); mz += -Math.cos(cameraBearing); }
  if (input.back) { mx += Math.sin(cameraBearing); mz += Math.cos(cameraBearing); }
  if (input.left) { mx += -Math.cos(cameraBearing); mz += Math.sin(cameraBearing); }
  if (input.right) { mx += Math.cos(cameraBearing); mz += -Math.sin(cameraBearing); }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx = (mx / len) * speed * dt;
    mz = (mz / len) * speed * dt;
    const pushed = resolveBox(state.pos.x, state.pos.z, state.pos.x + mx, state.pos.z + mz, colliders, P.radius);
    state.pos.x = pushed.x;
    state.pos.z = pushed.z;
    state.heading = Math.atan2(mx, mz);
    state.walkPhase += dt * (input.sprint ? 11 : 7);
  } else {
    state.walkPhase = 0;
  }
  avatar.position.set(state.pos.x, 0, state.pos.z);
  avatar.rotation.y = state.heading;
  const swing = Math.sin(state.walkPhase) * 0.55;
  if (avatar.userData.legL) {
    avatar.userData.legL.rotation.x = swing;
    avatar.userData.legR.rotation.x = -swing;
    avatar.userData.armL.rotation.x = -swing * 0.7;
    avatar.userData.armR.rotation.x = state.armed ? -1.35 : swing * 0.7;
  }
}

/** Enter the nearest car within reach, or leave the current one. Returns the car entered, if any. */
export function nearestCar(state, cars, reach = 3.6) {
  let best = null;
  let bestDist = reach;
  for (const car of cars) {
    if (car.userData.kind === 'police' && car.userData.cop === true) continue;
    const dist = Math.hypot(car.position.x - state.pos.x, car.position.z - state.pos.z);
    if (dist < bestDist) { best = car; bestDist = dist; }
  }
  return best;
}
