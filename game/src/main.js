// Sunfall City — the wiring. Renderer and night scene, the built city, the walker and the
// player state, ambient traffic and pedestrians, police heat, the five-step story, input,
// a lerped chase camera, synthesized engine and siren, a two-second localStorage save, the
// WASTED respawn at the dock, and window.__sunfall for the maker to pose screenshots.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { buildCity, network } from './world.js';
import { makeCar, driveCar } from './vehicles.js';
import { makeAvatar, createPlayerState, stepOnFoot, nearestCar } from './player.js';
import { spawnTraffic, stepTraffic, spawnPedestrians, stepPedestrians } from './traffic.js';
import { addCrime, coolHeat, maintainPolice, stepPolice, nearestCop } from './police.js';
import { createMissionRunner } from './missions.js';
import { initHud, toast, banner, updateHud, cacheMinimapGrid } from './hud.js';
import { initAudio, setEngine, siren, gunshot, thud } from './audio.js';

// ---- renderer and night scene -------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.sky);
scene.fog = new THREE.Fog(CONFIG.colors.fog, 110, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

scene.add(new THREE.HemisphereLight(0x8a86c9, 0x241d38, 0.85)); // purple sky over dark ground
const moon = new THREE.DirectionalLight(0xc3caff, 0.7);          // the moon
moon.position.set(-140, 200, -80);
scene.add(moon);
const fill = new THREE.DirectionalLight(0x3a5fd9, 0.35);         // blue bounce off the streets
fill.position.set(110, 80, 140);
scene.add(fill);

// ---- world and actors -----------------------------------------------------------
buildCity(scene);
cacheMinimapGrid(network.lines);
const worldHalf = (CONFIG.city.blocks * CONFIG.city.block) / 2;

const SPAWN = new THREE.Vector3(0, 0, worldHalf - 4); // on the southern ring road
const DOCK = { x: 30, z: worldHalf + 26 }; // on the sand, where the wasted wake up

const avatar = makeAvatar();
scene.add(avatar);
const state = createPlayerState(SPAWN);
avatar.position.set(state.pos.x, 0, state.pos.z);
avatar.rotation.y = state.heading;

const cars = spawnTraffic(scene, 26);

// One parked car near the spawn, nose along the kerb.
const parked = makeCar(0xe0e4ea, 'sedan');
parked.position.set(8, 0, worldHalf - 5);
parked.userData.drive.heading = Math.PI / 2;
parked.userData.parked = true;
parked.rotation.y = Math.PI / 2;
scene.add(parked);
cars.push(parked);

const peds = spawnPedestrians(scene, 42);
const cops = [];
state.cars = cars; // the cruisers shove this traffic aside as they close in

initHud();
const missions = createMissionRunner(scene, worldHalf);

// ---- input ------------------------------------------------------------------------
const keys = new Set();
let camBearing = Math.PI; // facing north, into the city
let started = false;
let paused = false;
let bumpCd = 0;
let wastedTimer = 0;

const menu = document.getElementById('menu');
document.getElementById('enter').addEventListener('click', () => {
  if (started) return;
  started = true;
  menu.classList.add('hidden');
  initAudio();
  banner('WELCOME TO SUNFALL CITY', 3);
  toast('FOLLOW THE LIGHT COLUMN · YOUR RIDE IS BY THE KERB');
});

function onStar(n) {
  banner(`WANTED · ${n} STAR${n > 1 ? 'S' : ''}`, 1.8);
}

function tryEnterExit() {
  if (!state.alive) return;
  if (state.car) {
    exitCar();
    return;
  }
  const car = nearestCar(state, cars, 3.8);
  if (!car) return;
  state.car = car;
  state.onFoot = false;
  avatar.visible = false;
  if (!car.userData.stolen) {
    car.userData.stolen = true;
    car.userData.parked = false;
    if (!car.userData.ai) car.userData.ai = { cruise: 10, turnIn: 8, turning: 0, stuck: 0 };
    addCrime(state, CONFIG.wanted.crimePoints.stealCar, onStar); // stealing it draws heat
    toast('CAR STOLEN — THE CITY NOTICED');
  }
}

function exitCar() {
  const car = state.car;
  if (!car) return;
  const d = car.userData.drive;
  // Step out on the left of the car, clear of the body.
  const lx = Math.cos(d.heading);
  const lz = -Math.sin(d.heading);
  state.pos.x = car.position.x + lx * 2.6;
  state.pos.z = car.position.z + lz * 2.6;
  state.car = null;
  state.onFoot = true;
  avatar.visible = true;
  avatar.position.set(state.pos.x, 0, state.pos.z);
  if (car.userData.ai) car.userData.ai.cruise = 0; // a dumped car stays dumped
}

function toggleArm() {
  state.armed = !state.armed;
  toast(state.armed ? 'PISTOL DRAWN' : 'PISTOL HOLSTERED');
}

// A click fires a ray from the crosshair; the closest pedestrian along it, inside 60 m, dies.
function shoot() {
  if (!state.armed || !state.alive) return;
  gunshot();

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position;
  let target = null;
  let bestT = 60;
  for (const ped of peds) {
    const p = ped.userData.ped;
    if (!p || p.down > 0) continue;
    const vx = ped.position.x - origin.x;
    const vy = ped.position.y + 1 - origin.y;
    const vz = ped.position.z - origin.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 2 || t > bestT) continue;
    const ox = vx - dir.x * t;
    const oy = vy - dir.y * t;
    const oz = vz - dir.z * t;
    if (Math.hypot(ox, oy, oz) < 1.4) {
      bestT = t;
      target = ped;
    }
  }
  if (target) {
    target.userData.ped.down = 20;
    target.rotation.x = Math.PI / 2;
    target.position.y = 0.28;
    thud();
    state.money += 40;
    addCrime(state, CONFIG.wanted.crimePoints.hitPedestrian, onStar); // a kill is three stars of heat
    toast('+$40 · THE STREET WENT QUIET');
  } else {
    addCrime(state, CONFIG.wanted.crimePoints.shootNear, onStar); // firing in public draws its own heat
  }
}

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!started) return;
  if (e.code === 'Escape' && !e.repeat) {
    paused = !paused;
    banner(paused ? 'PAUSED — ESC RESUMES' : 'BACK ON THE STREET', 1.6);
  }
  if (paused) return;
  if (e.code === 'KeyE' && !e.repeat) tryEnterExit();
  if (e.code === 'KeyQ' && !e.repeat) toggleArm();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
  if (!started || paused) return;
  camBearing -= e.movementX * 0.0026;
  camBearing = Math.atan2(Math.sin(camBearing), Math.cos(camBearing));
});
addEventListener('mousedown', () => {
  if (started && !paused) shoot();
});

// ---- damage, death and the dock ----------------------------------------------------
function onBumpPlayer() {
  if (bumpCd > 0 || !state.alive) return;
  bumpCd = 0.9;
  state.health = Math.max(0, state.health - (state.car ? 8 : 14));
  thud();
  if (state.car) state.car.userData.drive.speed *= 0.5;
}

// Knocking a pedestrian down with the car is a crime: hard at speed, a bump when slow.
function carPedBumps() {
  if (!state.car) return;
  const car = state.car;
  const speed = Math.abs(car.userData.drive.speed);
  if (speed < 3) return;
  for (const ped of peds) {
    const p = ped.userData.ped;
    if (!p || p.down > 0) continue;
    if (Math.hypot(ped.position.x - car.position.x, ped.position.z - car.position.z) < 2.6) {
      p.down = 20;
      ped.rotation.x = Math.PI / 2;
      ped.position.y = 0.28;
      thud();
      car.userData.drive.speed *= 0.75;
      addCrime(state, speed > 6 ? CONFIG.wanted.crimePoints.hitPedestrian : CONFIG.wanted.crimePoints.bumpPedestrian, onStar);
    }
  }
}

function respawnAtDock() {
  state.alive = true;
  state.health = 100;
  state.money = Math.floor(state.money / 2); // the hospital takes half
  state.wanted = 0;
  state.wantedHeat = 0;
  state.car = null;
  state.onFoot = true;
  avatar.visible = true;
  state.pos.x = DOCK.x;
  state.pos.z = DOCK.z;
  avatar.position.set(state.pos.x, 0, state.pos.z);
  camera.position.set(state.pos.x - 6, 4, state.pos.z - 9);
  toast('YOU CAME TO ON THE DOCK · HALF YOUR CASH IS GONE');
}

// ---- the save in your browser --------------------------------------------------------
const SAVE_KEY = 'sunfall-save';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: state.money, deliveries: state.deliveries }));
  } catch (err) { /* private mode: the run just does not persist */ }
}
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const s = JSON.parse(raw);
    if (typeof s.money === 'number') state.money = s.money;
    if (typeof s.deliveries === 'number') state.deliveries = s.deliveries;
  }
} catch (err) { /* a broken save is a fresh start */ }

// ---- the maker's debug hook ------------------------------------------------------------
window.__sunfall = {
  state,
  avatar,
  camera,
  cars,
  cops,
  peds,
  missions,
  place(x, z) {
    state.pos.x = Number(x) || 0;
    state.pos.z = Number(z) || 0;
    if (state.car) {
      state.car.position.x = state.pos.x;
      state.car.position.z = state.pos.z;
    }
    avatar.position.set(state.pos.x, 0, state.pos.z);
  },
  giveCar(color = 0xffd166) {
    const car = makeCar(color, 'sedan');
    car.position.set(state.pos.x + 3.5, 0, state.pos.z + 2);
    car.userData.ai = { cruise: 10, turnIn: 8, turning: 0, stuck: 0 };
    scene.add(car);
    cars.push(car);
    state.car = car;
    state.onFoot = false;
    avatar.visible = false;
    return car;
  },
  exitCar: () => exitCar(),
  arm(on = true) {
    state.armed = Boolean(on);
  },
  heat(n = 2) {
    addCrime(state, n, onStar);
  },
  money(n = 1000) {
    state.money += n;
  },
};

// ---- the chase camera --------------------------------------------------------------------
const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();
camera.position.set(SPAWN.x, 3.4, SPAWN.z - 7);

function updateCamera(dt) {
  if (state.car) {
    const d = state.car.userData.drive;
    const fx = Math.sin(d.heading);
    const fz = Math.cos(d.heading);
    camGoal.set(state.car.position.x - fx * 9.5, 4.6, state.car.position.z - fz * 9.5);
    camLook.set(state.car.position.x + fx * 7, 1.4, state.car.position.z + fz * 7);
  } else {
    const fx = Math.sin(camBearing);
    const fz = Math.cos(camBearing);
    camGoal.set(state.pos.x - fx * 6.2, 3.4, state.pos.z - fz * 6.2);
    camLook.set(state.pos.x + fx * 5, 1.5, state.pos.z + fz * 5);
  }
  const k = 1 - Math.exp(-dt * 5.5);
  camera.position.lerp(camGoal, k);
  camera.lookAt(camLook);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- the loop ------------------------------------------------------------------------------
const clock = new THREE.Clock();
let saveT = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  bumpCd = Math.max(0, bumpCd - dt);

  if (started && !paused) {
    if (state.alive) {
      // The player: driving or walking.
      if (state.car) {
        const input = {
          throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
          handbrake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        };
        driveCar(state.car, input, dt, network.colliders, cars.concat(cops));
        state.pos.x = state.car.position.x;
        state.pos.z = state.car.position.z;
      } else {
        stepOnFoot(state, avatar, keys, dt, network.colliders, camBearing);
      }

      // The city, the heat and the story.
      stepTraffic(cars, dt, state);
      stepPedestrians(peds, dt, state);
      maintainPolice(scene, cops, state, worldHalf);
      stepPolice(cops, dt, state, onBumpPlayer);
      const copDist = nearestCop(cops, state);
      coolHeat(state, dt, copDist);
      missions.step(state, dt);
      carPedBumps();

      // Engine tracks the revs; the siren wails while the heat rides along.
      const revs = state.car ? Math.abs(state.car.userData.drive.speed) / CONFIG.car.topSpeed : 0;
      setEngine(0.25 + revs * 0.75, Boolean(state.car));
      siren(cops.length > 0, copDist < 55);

      // The save: money and deliveries, every two seconds.
      saveT += dt;
      if (saveT >= 2) {
        saveT = 0;
        saveGame();
      }
    } else {
      // Wasted: hold on the banner, then wake up at the dock.
      wastedTimer -= dt;
      if (wastedTimer <= 0) respawnAtDock();
      setEngine(0, false);
      siren(false, false);
    }

    if (state.alive && state.health <= 0) {
      state.alive = false;
      wastedTimer = 3;
      if (state.car && state.car.userData.ai) state.car.userData.ai.cruise = 0;
      banner('WASTED', 4);
    }
  }

  updateCamera(dt);
  updateHud(state, cops, peds, worldHalf, [missions.blip()]);
  renderer.render(scene, camera);
}
tick();
