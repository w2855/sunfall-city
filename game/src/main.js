// Sunfall City wiring: renderer, night scene, city, avatar, traffic, pedestrians, police,
// the five-job story, HUD, audio, saves — and the window.__sunfall hook the maker uses to
// pose screenshots. Every behaviour lives in its own module; this file only connects them
// and runs the frame loop.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { buildCity, colliders, network } from './world.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';
import { makeAvatar, createPlayerState, stepOnFoot, nearestCar } from './player.js';
import { spawnTraffic, stepTraffic, spawnPedestrians, stepPedestrians } from './traffic.js';
import { addCrime, coolHeat, maintainPolice, stepPolice, nearestCop } from './police.js';
import { createMissionRunner } from './missions.js';
import { initHud, toast, banner, updateHud, cacheMinimapGrid } from './hud.js';
import { initAudio, setEngine, siren, gunshot, thud } from './audio.js';

const HALF = CONFIG.city.blocks * CONFIG.city.block / 2;
const SAVE_KEY = 'sunfall-save-v1';
const SPAWN = { x: 33.5, z: -HALF + 60 }; // on the first north-south road, near the beach
const DOCK = { x: -12, z: -HALF + 14 }; // the sandy south dock where the wasted wake up

// --- stage -----------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.sky);
scene.fog = new THREE.Fog(CONFIG.colors.fog, 70, 560);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(SPAWN.x, 4, SPAWN.z - 12);

scene.add(new THREE.HemisphereLight(0x8f9bff, 0x1c1533, 0.9));
const moon = new THREE.DirectionalLight(0xc3ccff, 0.55);
moon.position.set(90, 150, -50);
scene.add(moon);
const fill = new THREE.DirectionalLight(0x3355cc, 0.35);
fill.position.set(-60, 40, 80);
scene.add(fill);

buildCity(scene);
cacheMinimapGrid(network.lines);
initHud();

// --- state -------------------------------------------------------------------
const state = createPlayerState(SPAWN);
try {
  const save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (save) {
    if (Number.isFinite(save.money)) state.money = save.money;
    if (Number.isFinite(save.deliveries)) state.deliveries = save.deliveries;
  }
} catch {
  // a broken save just means starting fresh
}

const avatar = makeAvatar();
scene.add(avatar);

const cars = spawnTraffic(scene, 26);
const parked = makeCar(CONFIG.colors.cars[5], 'sedan');
parked.position.set(SPAWN.x + 7, 0, SPAWN.z + 6);
parked.rotation.y = 0.25;
parked.userData.drive.heading = 0.25;
scene.add(parked);
cars.push(parked);

const peds = spawnPedestrians(scene, 42);
const cops = [];
const missions = createMissionRunner(scene, HALF);
let missionDone = false;

// --- input -------------------------------------------------------------------
const keys = new Set();
let camBearing = 0; // where the camera looks (and the walker runs) on foot
let started = false;
let paused = false;

const menu = document.getElementById('menu');
const enterBtn = document.getElementById('enter');

function startGame() {
  if (!started) {
    started = true;
    toast('WELCOME TO SUNFALL CITY');
    banner('SUNFALL CITY', 2.4);
  }
  paused = false;
  menu.classList.add('hidden');
  enterBtn.textContent = 'RESUME';
  initAudio();
}

function pauseGame() {
  if (!started) return;
  paused = true;
  menu.classList.remove('hidden');
}

enterBtn.addEventListener('click', startGame);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (paused) startGame();
    else pauseGame();
    return;
  }
  if (!started || paused) return;
  keys.add(e.code);
  if (e.code === 'KeyE') tryEnterExit();
  if (e.code === 'KeyQ') {
    state.armed = !state.armed;
    toast(state.armed ? 'PISTOL DRAWN' : 'PISTOL HOLSTERED');
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousemove', (e) => {
  if (started && !paused) camBearing -= e.movementX * 0.0026;
});
canvas.addEventListener('mousedown', () => {
  if (started && !paused && state.armed && !state.car) shoot();
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- actions -----------------------------------------------------------------
function onStar(n) {
  toast(`WANTED — ★${n}`);
}

function tryEnterExit() {
  if (state.car) {
    const car = state.car;
    const d = car.userData.drive;
    // step out to the left of the nose, kept out of walls
    const lx = Math.cos(d.heading);
    const lz = -Math.sin(d.heading);
    const res = resolveBox(car.position.x, car.position.z,
      car.position.x + lx * 2.4, car.position.z + lz * 2.4, colliders(), CONFIG.player.radius);
    state.pos.set(res.x, 0, res.z);
    d.speed = 0;
    state.car = null;
    state.heading = d.heading;
    toast('OUT OF THE CAR');
  } else {
    const car = nearestCar(state, cars, 3.6);
    if (!car) return;
    const stolen = !!car.userData.ai;
    car.userData.ai = null;
    state.car = car;
    toast(stolen ? 'CAR JACKED — THEY SAW THAT' : 'IN THE CAR');
    if (stolen) addCrime(state, CONFIG.wanted.crimePoints.stealCar, onStar);
  }
}

const raycaster = new THREE.Raycaster();
raycaster.far = 60;
const screenCentre = new THREE.Vector2(0, 0);

function shoot() {
  gunshot();
  raycaster.setFromCamera(screenCentre, camera);
  const targets = [];
  for (const ped of peds) if (ped.userData.hitMesh) targets.push(ped.userData.hitMesh);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit || !hit.object.userData.pedRef) return;
  const ped = hit.object.userData.pedRef;
  const i = peds.indexOf(ped);
  if (i !== -1) peds.splice(i, 1);
  scene.remove(ped);
  peds.push(...spawnPedestrians(scene, 1)); // a fresh walker somewhere else keeps the streets busy
  state.money += 40;
  addCrime(state, 3, onStar);
  toast('HIT CONFIRMED — $40');
}

// --- frame loop ----------------------------------------------------------------
let last = performance.now();
let deadTimer = 0;
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  if (state.car) {
    const d = state.car.userData.drive;
    camTarget.set(
      state.car.position.x - Math.sin(d.heading) * 10.5,
      4.4,
      state.car.position.z - Math.cos(d.heading) * 10.5
    );
    camLook.set(
      state.car.position.x + Math.sin(d.heading) * 6,
      1.2,
      state.car.position.z + Math.cos(d.heading) * 6
    );
  } else {
    camTarget.set(
      state.pos.x - Math.sin(camBearing) * 7,
      3.4,
      state.pos.z - Math.cos(camBearing) * 7
    );
    camLook.set(state.pos.x, 1.7, state.pos.z);
  }
  camera.position.lerp(camTarget, 1 - Math.pow(0.002, dt));
  // keep the chase camera out of building interiors: push it to the nearest face
  const pushed = resolveBox(camTarget.x, camTarget.z, camera.position.x, camera.position.z, colliders(), 1.1);
  camera.position.set(pushed.x, Math.max(camera.position.y, pushed.moved ? 2.2 : camera.position.y), pushed.z);
  camera.lookAt(camLook);
}

function step(dt) {
  // the player: driving or on foot
  if (state.car) {
    const input = {
      throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
      handbrake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
    driveCar(state.car, input, dt, colliders(), cars);
    state.pos.set(state.car.position.x, 0, state.car.position.z);
    state.heading = state.car.userData.drive.heading;
    avatar.visible = false;
  } else {
    const input = {
      forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
    stepOnFoot(state, avatar, input, dt, colliders(), camBearing);
    avatar.visible = true;
  }

  // the city's life
  stepTraffic(cars, dt, state);
  stepPedestrians(peds, dt, state);

  // knocking a pedestrian down with the car is a crime
  if (state.car && Math.abs(state.car.userData.drive.speed) > 3.5) {
    const car = state.car;
    const heavy = Math.abs(car.userData.drive.speed) > 13;
    for (const ped of peds) {
      const p = ped.userData.ped;
      if (p.downT > 0) continue;
      if (Math.hypot(ped.position.x - car.position.x, ped.position.z - car.position.z) < 2.4) {
        p.downT = 1.6;
        thud();
        addCrime(state, heavy ? CONFIG.wanted.crimePoints.hitPedestrian : CONFIG.wanted.crimePoints.bumpPedestrian, onStar);
      }
    }
  }

  // the heat
  maintainPolice(scene, cops, state, HALF);
  stepPolice(cops, dt, state, () => {
    if (!state.alive) return;
    state.health -= 12;
    thud();
  });
  const cop = nearestCop(cops, state);
  coolHeat(state, dt, cop ? cop.position.distanceTo(state.pos) : Infinity);

  // the story
  if (missions.step(state, dt) === 'done' && !missionDone) {
    missionDone = true;
    banner('SUNFALL IS YOURS', 3.5);
  }

  // wasted: zero health means the dock, and half the cash is gone
  if (state.alive && state.health <= 0) {
    state.alive = false;
    state.health = 0;
    deadTimer = 2.4;
    banner('WASTED', 2.2);
    if (state.car) {
      state.car.userData.ai = null;
      state.car = null;
    }
  }
  if (!state.alive) {
    deadTimer -= dt;
    if (deadTimer <= 0) {
      state.alive = true;
      state.health = 100;
      state.money = Math.floor(state.money / 2);
      state.wanted = 0;
      state.wantedHeat = 0;
      state.pos.set(DOCK.x, 0, DOCK.z);
      camBearing = 0;
      toast('YOU WOKE UP AT THE DOCK — HALF THE CASH IS GONE');
    }
  }

  // audio tracks the world
  if (state.car) setEngine(Math.min(1, Math.abs(state.car.userData.drive.speed) / CONFIG.car.topSpeed), true);
  else setEngine(0, false);
  siren(cops.length > 0, !!cop && cop.position.distanceTo(state.pos) < 45);

  updateHud(state, cops, peds, HALF, [missions.blip()].filter(Boolean));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started && !paused) step(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// money and deliveries persist in the browser, saved every two seconds
setInterval(() => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: state.money, deliveries: state.deliveries }));
  } catch {
    // private mode or full quota: the city keeps running without saves
  }
}, 2000);

// the debug hook the maker poses screenshots with
window.__sunfall = {
  state,
  avatar,
  camera,
  cars,
  cops,
  peds,
  missions,
  colliders: network.colliders,
  place(x, z) {
    if (state.car) state.car.position.set(Number(x) || 0, 0, Number(z) || 0);
    else state.pos.set(Number(x) || 0, 0, Number(z) || 0);
  },
  giveCar() {
    const car = makeCar(CONFIG.colors.cars[(Math.random() * CONFIG.colors.cars.length) | 0], 'sedan');
    const px = state.car ? state.car.position.x : state.pos.x;
    const pz = state.car ? state.car.position.z : state.pos.z;
    car.position.set(px + 4, 0, pz);
    scene.add(car);
    cars.push(car);
    state.car = car;
    return car;
  },
  exitCar() {
    if (!state.car) return;
    state.car.userData.ai = null;
    state.car.userData.drive.speed = 0;
    state.pos.set(state.car.position.x, 0, state.car.position.z);
    state.car = null;
  },
  arm(v) {
    state.armed = !!v;
  },
  heat(n) {
    const stars = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    state.wanted = Math.max(state.wanted, stars);
    state.wantedHeat = Math.max(state.wantedHeat, stars);
    state.grace = 5;
  },
  money(n) {
    state.money += Number(n) || 0;
    return state.money;
  },
  bearing(b) {
    camBearing = Number(b) || 0;
  },
};

// ?autostart=1 skips the menu, for headless captures
if (new URLSearchParams(window.location.search).has('autostart')) {
  startGame();
  // the capture flow expects to open behind the wheel: seat the player in the parked car
  state.onFoot = false;
  state.car = parked;
  avatar.visible = false;
}
