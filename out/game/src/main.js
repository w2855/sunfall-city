// Sunfall City's main loop: input, camera, the player on foot and behind wheels, traffic,
// the heat, the story missions, the HUD and the save file, one frame at a time.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { buildCity, colliders, network } from './world.js';
import { makeAvatar, createPlayerState, stepOnFoot, nearestCar } from './player.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';
import { spawnTraffic, stepTraffic, spawnPedestrians, stepPedestrians } from './traffic.js';
import { addCrime, coolHeat, maintainPolice, stepPolice, nearestCop } from './police.js';
import { createMissionRunner } from './missions.js';
import { initHud, updateHud, toast, banner, cacheMinimapGrid } from './hud.js';
import { initAudio, setEngine, siren, gunshot, chime, thud } from './audio.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.sky);
scene.fog = new THREE.Fog(CONFIG.colors.fog, 90, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
const hemi = new THREE.HemisphereLight(CONFIG.colors.hemiSky, CONFIG.colors.hemiGround, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(CONFIG.colors.sun, 1.1);
sun.position.set(180, 260, 90);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7f8fd9, 0.55);
fill.position.set(-120, 90, -160);
scene.add(fill);

const { spawn, half } = buildCity(scene);
cacheMinimapGrid(network.lines);

const avatar = makeAvatar();
scene.add(avatar);
const state = createPlayerState(spawn.clone());
avatar.position.set(state.pos.x, 0, state.pos.z);

// The city's fleet: traffic the player can steal from, plus one parked coupe at the spawn.
const cars = spawnTraffic(scene, 26, state.pos);
const parked = makeCar(CONFIG.colors.cars[3], 'sedan');
parked.position.set(spawn.x + 7, 0, spawn.z - 3);
parked.userData.drive.heading = Math.PI / 2;
parked.rotation.y = Math.PI / 2;
scene.add(parked);
cars.push(parked);
const peds = spawnPedestrians(scene, 42);
const cops = [];
const missions = createMissionRunner(scene, half);

// The save file: money, story progress and deliveries survive a reload.
const SAVE_KEY = 'sunfall-save-v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: state.money, deliveries: state.deliveries, at: Date.now() }));
  } catch { /* a private window keeps no storage; the game still plays */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.money = s.money ?? state.money;
    state.deliveries = s.deliveries ?? 0;
    toast('Save loaded: $' + state.money.toLocaleString('en-US'));
  } catch { /* corrupt save, fresh start */ }
}

// Input: the keyboard map, the mouse bearing the camera and the gun share, and the pause state.
const keys = new Set();
let mouseBearing = 0;
let paused = true;
let started = false;
window.addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyE' && started && !paused) toggleCar();
  if (e.code === 'KeyQ' && started && !paused && !state.car) { state.armed = !state.armed; avatar.userData.gun.visible = state.armed; toast(state.armed ? 'Pistol drawn. Left-click to fire.' : 'Pistol holstered.'); }
  if (e.code === 'Escape' && started) { paused = !paused; banner(paused ? 'PAUSED' : 'BACK TO IT', 1.2); }
  if (e.code === 'Space' && started && !paused && state.car) state.car.userData.drive.handbrakeNow = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousemove', (e) => { mouseBearing -= e.movementX * 0.0026; });
window.addEventListener('mousedown', (e) => {
  if (!started || paused || e.button !== 0) return;
  if (!state.car && state.armed) fire();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('start').addEventListener('click', () => {
  beginRun();
});

// A maker's shortcut: ?autostart=1 walks straight in, so a reloaded page never strands a session
// on the menu while the city's screenshots are being taken.
if (new URLSearchParams(window.location.search).get('autostart') === '1') beginRun();

function beginRun() {
  document.getElementById('menu').classList.add('hidden');
  started = true;
  paused = false;
  if (!initAudio.done) { try { initAudio(); } catch { /* no audio device, play silent */ } initAudio.done = true; }
  if (!loadGame.done) { loadGame(); loadGame.done = true; }
  banner('SUNFALL CITY');
}

// Enter or leave whatever car is closest, stealing it if it was never ours.
function toggleCar() {
  if (state.car) {
    const car = state.car;
    state.pos.set(car.position.x + Math.sin(car.userData.drive.heading + Math.PI / 2) * 2.6, 0, car.position.z + Math.cos(car.userData.drive.heading + Math.PI / 2) * 2.6);
    state.car = null;
    avatar.visible = true;
    toast('You step out.');
  } else {
    const car = nearestCar(state, cars, 4.2);
    if (!car) { toast('No car within reach.'); return; }
    state.car = car;
    avatar.visible = false;
    if (!car.userData.playerOwned && car.userData.wasTraffic !== false) {
      addCrime(state, CONFIG.wanted.crimePoints.stealCar, () => banner('WANTED ★'));
      toast('Car stolen. The city noticed.');
    }
    car.userData.playerOwned = true;
  }
}

// One shot: ray from the camera through the crosshair, nearest pedestrian or cop car pays.
const raycaster = new THREE.Raycaster();
function fire() {
  gunshot();
  addCrime(state, CONFIG.wanted.crimePoints.shootNear, () => banner('WANTED ★'));
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hitPeds = [];
  for (const p of peds) hitPeds.push(p);
  const hits = raycaster.intersectObjects(hitPeds, true);
  if (hits.length > 0) {
    const victim = hits[0].object.parent;
    const idx = peds.indexOf(victim);
    if (idx >= 0 && hits[0].distance < 60) {
      scene.remove(victim);
      peds.splice(idx, 1);
      state.kills += 1;
      state.money += 40;
      thud();
      addCrime(state, CONFIG.wanted.crimePoints.hitPedestrian, () => banner('WANTED ★★'));
      toast('A pedestrian is down. That kind of news travels.');
    }
  }
}

// The camera: a chase cam behind the nose line, riding higher and further when driving fast.
function updateCamera(dt) {
  const target = state.car ?? avatar;
  const driving = !!state.car;
  const speed = state.car ? Math.abs(state.car.userData.drive.speed) : 0;
  const dist = driving ? 10.5 + speed * 0.14 : 7.2;
  const height = driving ? 4.6 : 3.4;
  const bearing = driving ? state.car.userData.drive.heading : mouseBearing;
  const lx = target.position.x - Math.sin(bearing) * dist;
  const lz = target.position.z - Math.cos(bearing) * dist;
  camera.position.lerp(new THREE.Vector3(lx, height, lz), Math.min(1, 7 * dt));
  const look = new THREE.Vector3(target.position.x + (driving ? Math.sin(bearing) * 8 : 0), 1.9, target.position.z + (driving ? Math.cos(bearing) * 8 : 0));
  camera.lookAt(look);
}

function readInput() {
  return {
    forward: keys.has('KeyW') || keys.has('ArrowUp'),
    back: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    throttle: keys.has('KeyW') ? 1 : keys.has('KeyS') ? -1 : 0,
    steer: (keys.has('KeyA') ? 1 : 0) + (keys.has('KeyD') ? -1 : 0),
    handbrake: keys.has('Space'),
  };
}

initHud();

// A debug hook for the maker's own screenshots: place the player, hand over a car, aim the camera.
// It is inert for a normal player — nothing reads it unless the maker drives it from the console.
window.__sunfall = {
  state, avatar, camera, cars, cops, peds, missions,
  place(x, z, heading = 0) { state.pos.set(x, 0, z); state.heading = heading; },
  bearing(v) { mouseBearing = v; },
  giveCar() { const c = nearestCar(state, cars, 999); if (c) { state.car = c; avatar.visible = false; c.userData.playerOwned = true; } return c; },
  exitCar() { state.car = null; avatar.visible = true; },
  arm(yes = true) { state.armed = yes; avatar.userData.gun.visible = yes; },
  heat(n) { for (let i = 0; i < n; i++) addCrime(state, 1); },
  money(n) { state.money = n; },
};

let last = performance.now();
let frame = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame += 1;
  if (!started || paused) { renderer.render(scene, camera); return; }

  const input = readInput();
  const bearing = mouseBearing;

  if (state.car) {
    const result = driveCar(state.car, input, dt, colliders(), cars.filter((c) => c !== state.car));
    state.pos.set(state.car.position.x, 0, state.car.position.z);
    setEngine(Math.min(1, Math.abs(result.speed) / CONFIG.car.topSpeed), true);
    if (result.crashed && Math.abs(result.speed) > 8) { thud(); state.health = Math.max(0, state.health - Math.abs(result.speed) * 0.16); }
  } else {
    stepOnFoot(state, avatar, input, dt, colliders(), bearing);
    setEngine(0, false);
  }

  // Knocking a pedestrian down is a crime; so is firing where people can hear it.
  if (state.car && Math.abs(state.car.userData.drive.speed) > 6) {
    for (const p of peds) {
      if (Math.hypot(p.position.x - state.pos.x, p.position.z - state.pos.z) < 2.6) {
        scene.remove(p);
        peds.splice(peds.indexOf(p), 1);
        addCrime(state, CONFIG.wanted.crimePoints.bumpPedestrian, () => banner('WANTED ★'));
        thud();
        toast('You clipped a pedestrian. Keep driving.');
        break;
      }
    }
  }

  stepTraffic(cars, dt, state);
  stepPedestrians(peds, dt, state);
  maintainPolice(scene, cops, state, half);
  stepPolice(cops, dt, state, () => { state.health = Math.max(0, state.health - 2.6); thud(); });
  const copDist = nearestCop(cops, state);
  coolHeat(state, dt, copDist);
  siren(cops.length > 0, copDist);
  const missionDone = missions.step(state, dt);
  if (missionDone === 'done') { saveGame(); chime(); }

  updateCamera(dt);
  updateHud(state, cops, peds, undefined, half, missions.blip());
  if (frame % 120 === 0) saveGame();
  if (state.health <= 0 && state.alive) {
    state.alive = false;
    banner('WASTED', 4);
    toast('You went down in Sunfall City. The hospital keeps your cash — half of it.');
    setTimeout(() => {
      state.health = 100;
      state.alive = true;
      state.money = Math.floor(state.money / 2);
      state.wanted = 0;
      state.wantedHeat = 0;
      state.car = null;
      avatar.visible = true;
      state.pos.copy(spawn);
      saveGame();
    }, 2600);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
