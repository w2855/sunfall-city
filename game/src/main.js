// Sunfall City: the wiring. Renderer, city, traffic, heat, missions, sound, save.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { buildCity, CITY_HALF, network, randomRoadPoint } from './world.js';
import { makeCar, driveCar, resolveBox } from './vehicles.js';
import { makeAvatar, createPlayerState, stepOnFoot, nearestCar } from './player.js';
import { spawnTraffic, stepTraffic, spawnPedestrians, stepPedestrians } from './traffic.js';
import { addCrime, coolHeat, maintainPolice, stepPolice, nearestCop } from './police.js';
import { createMissionRunner } from './missions.js';
import { initHud, toast, banner, setObjective, updateHud, cacheMinimapGrid } from './hud.js';
import { initAudio, setEngine, siren, gunshot, thud } from './audio.js';

// ---------------------------------------------------------------- renderer, scene, lights

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.sky);
scene.fog = new THREE.Fog(CONFIG.colors.fog, 70, 460);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(37, 6, 20);

scene.add(new THREE.HemisphereLight(0x8a7fb8, 0x2a2440, 0.9));
const moon = new THREE.DirectionalLight(0xbfb8e8, 1.0);
moon.position.set(180, 260, -140);
scene.add(moon);
const fill = new THREE.DirectionalLight(0x4a5fd0, 0.4);
fill.position.set(-160, 120, 180);
scene.add(fill);

// ---------------------------------------------------------------- the world

buildCity(scene);

// Spawn at the downtown crossing of Fifth and Meridian (a real grid line each way).
const SPAWN = { x: 37, z: 37 };
const DOCK = { x: -111, z: CITY_HALF + 16 }; // the south dock, on the sand

const avatar = makeAvatar();
scene.add(avatar);
const state = createPlayerState({ ...SPAWN, heading: 0 });
avatar.position.set(state.pos.x, 0, state.pos.z);

// ---------------------------------------------------------------- actors

const lane = (sign) => sign * CONFIG.city.road * 0.25;
const cars = spawnTraffic(scene, 26);
const parkedCar = makeCar(CONFIG.colors.cars[3], 'sedan');
parkedCar.position.set(SPAWN.x + 9, 0, SPAWN.z + lane(1));
parkedCar.userData.drive.heading = Math.PI / 2;
scene.add(parkedCar);
cars.push(parkedCar);

const peds = spawnPedestrians(scene, 42);
const cops = [];

const missions = createMissionRunner(scene, CITY_HALF);

// ---------------------------------------------------------------- hud + save

initHud();
cacheMinimapGrid(network.lines);
missions.setObjective();

const SAVE_KEY = 'sunfall-city-v1';
try {
  const save = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  if (save && typeof save === 'object') {
    if (Number.isFinite(save.money)) state.money = Math.max(0, Math.floor(save.money));
    if (Number.isFinite(save.deliveries)) state.deliveries = Math.max(0, Math.floor(save.deliveries));
  }
} catch {
  /* a broken save is no save */
}
let saveTimer = 0;
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ money: state.money, deliveries: state.deliveries }));
  } catch {
    /* storage may be unavailable; the game plays on */
  }
}

// ---------------------------------------------------------------- input

const keys = new Set();
let started = false;
let paused = false;
let cameraBearing = 0;
let mouseBearing = 0;

const menu = document.getElementById('menu');
const enterButton = document.getElementById('enter');

// A crosshair the gun aims down.
const crosshair = document.createElement('div');
crosshair.textContent = '+';
Object.assign(crosshair.style, {
  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -54%)',
  fontSize: '26px', color: '#ffd166', textShadow: '0 0 8px rgba(0,0,0,0.9)',
  display: 'none',
});
document.getElementById('hud').appendChild(crosshair);

function syncCrosshair() {
  crosshair.style.display = state.armed && !state.car && state.alive ? 'block' : 'none';
}

function onStar(stars) {
  toast(`WANTED — ${'\u2605'.repeat(stars)}`);
}

function arm(v) {
  if (state.car) return; // no shooting from inside the car
  state.armed = typeof v === 'boolean' ? v : !state.armed;
  syncCrosshair();
}

function enterCar(car) {
  state.car = car;
  state.onFoot = false;
  avatar.visible = false;
  arm(false);
  state.pos.set(car.position.x, 0, car.position.z);
  const drive = car.userData.drive;
  state.heading = drive.heading;
  mouseBearing = drive.heading;
  cameraBearing = drive.heading;
}

function tryEnterNearestCar() {
  const car = nearestCar(state, cars, 3.6);
  if (!car) return;
  enterCar(car);
  addCrime(state, CONFIG.wanted.crimePoints.stealCar, onStar);
  toast(car === parkedCar ? 'That one was parked. The owner saw everything.' : 'Car borrowed. Nobody asked.');
}

function exitCar() {
  const car = state.car;
  if (!car) return;
  state.car = null;
  state.onFoot = true;
  avatar.visible = true;
  // Step out on the left, pushed out of any building.
  let sx = car.position.x - Math.cos(car.userData.drive.heading) * 2.2;
  let sz = car.position.z + Math.sin(car.userData.drive.heading) * 2.2;
  const res = resolveBox(car.position.x, car.position.z, sx, sz, network.colliders, CONFIG.player.radius);
  state.pos.set(res.x, 0, res.z);
  state.heading = car.userData.drive.heading;
  mouseBearing = state.heading;
  cameraBearing = state.heading;
  syncCrosshair();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (started) {
      paused = !paused;
      toast(paused ? 'PAUSED — Esc to resume' : 'Back on the street.');
    }
    return;
  }
  keys.add(e.code);
  if (!started || paused || !state.alive) return;
  if (e.code === 'KeyE') {
    if (state.car) exitCar();
    else tryEnterNearestCar();
  }
  if (e.code === 'KeyQ') arm();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('mousemove', (e) => {
  if (!started || paused) return;
  mouseBearing -= (e.movementX || 0) * 0.0026;
});

// Shooting: a ray from the crosshair, up to 60 metres, one pedestrian at a time.
const raycaster = new THREE.Raycaster();
const rayVector = new THREE.Vector3(0, 0, 0);
const rayTmp = new THREE.Vector3();

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !started || paused || !state.alive) return;
  if (!state.armed || state.car) return;
  gunshot();
  raycaster.setFromCamera(rayVector, camera);
  const ray = raycaster.ray;
  let best = null;
  let bestAlong = 60;
  for (const ped of peds) {
    if (ped.userData.ped.dead) continue;
    rayTmp.copy(ped.position);
    rayTmp.y += 1.0;
    rayTmp.sub(ray.origin);
    const along = rayTmp.dot(ray.direction);
    if (along <= 0 || along >= 60) continue;
    const perp2 = rayTmp.lengthSq() - along * along;
    if (perp2 > 2.56) continue; // 1.6 m off the line
    if (along < bestAlong) {
      bestAlong = along;
      best = ped;
    }
  }
  if (!best) return;
  killPed(best);
  state.money += 40;
  addCrime(state, 3, onStar);
  toast('MURDER — $40 found on the body. Heat surging.');
});

function killPed(ped) {
  const pd = ped.userData.ped;
  pd.dead = true;
  ped.rotation.x = Math.PI / 2;
  ped.position.y = groundHeight(ped.position.x, ped.position.z) + 0.15;
}

// The menu's only job: open the city.
enterButton.addEventListener('click', () => {
  if (started) return;
  started = true;
  menu.classList.add('hidden');
  initAudio();
  banner('SUNFALL CITY', 2.5);
  toast('A payphone is ringing downtown — follow the light.');
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- crime interactions

let lastBump = 0;
function onBumpPlayer(speed) {
  const now = clock;
  if (now - lastBump < 0.6) return;
  lastBump = now;
  state.health -= 8 + speed * 0.45;
  thud();
  toast('Rammed by a cruiser!');
}

let lastCrashSound = 0;
let lastPedBump = 0;

function carInteractions(dt) {
  const car = state.car;
  if (!car) return;
  const drive = car.userData.drive;
  const speed = Math.abs(drive.speed);

  for (const ped of peds) {
    const pd = ped.userData.ped;
    if (pd.dead) continue;
    const dx = ped.position.x - car.position.x;
    const dz = ped.position.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > drive.length * 0.5 + 0.9) continue;
    if (speed > 6) {
      // Knocked down: a proper crime.
      killPed(ped);
      addCrime(state, CONFIG.wanted.crimePoints.hitPedestrian, onStar);
      thud();
      toast('You hit a pedestrian!');
    } else if (speed > 1.5 && clock > lastPedBump + 2) {
      // A shove: they scatter and the city remembers.
      lastPedBump = clock;
      pd.scareUntil = clock + 3;
      pd.dir = Math.atan2(dx, dz);
      addCrime(state, CONFIG.wanted.crimePoints.bumpPedestrian, onStar);
    }
  }
}

// ---------------------------------------------------------------- wasted + respawn

let deathTimer = 0;
function respawn() {
  state.alive = true;
  state.health = 100;
  state.money = Math.floor(state.money / 2);
  state.wanted = 0;
  state.wantedHeat = 0;
  if (state.car) exitCar();
  state.pos.set(DOCK.x, 0, DOCK.z);
  state.heading = Math.PI; // facing back into the city
  arm(false);
  avatar.visible = true;
  toast('You wake up at the south dock — half your cash is gone.');
  saveGame();
}

// ---------------------------------------------------------------- the loop

const camEye = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let clock = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (started && !paused) {
    clock += dt;

    // The nearest cruiser matters whether you're alive, dying or respawned.
    const copInfo = nearestCop(cops, state);

    if (state.alive) {
      // The player's own movement.
      if (state.car) {
        const input = {
          throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
          handbrake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        };
        const speedBefore = state.car.userData.drive.speed;
        const res = driveCar(state.car, input, dt, network.colliders, cars);
        if (res.moved && Math.abs(speedBefore) > 8 && clock - lastCrashSound > 0.4) {
          lastCrashSound = clock;
          thud();
        }
        state.pos.set(state.car.position.x, 0, state.car.position.z);
        state.heading = state.car.userData.drive.heading;
      } else {
        stepOnFoot(state, avatar, {
          moveZ: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          moveX: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
          sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        }, dt, network.colliders, cameraBearing);
      }

      // The city, living.
      stepTraffic(cars, dt, state);
      stepPedestrians(peds, dt, state, clock);
      maintainPolice(scene, cops, state, CITY_HALF);
      stepPolice(cops, dt, state, onBumpPlayer);
      carInteractions(dt);
      coolHeat(state, dt, copInfo ? copInfo.dist : null);
      missions.step(state, dt);

      // Death by cop.
      if (state.health <= 0) {
        state.alive = false;
        state.health = 0;
        deathTimer = 2.4;
        banner('WASTED', 3.4);
        if (state.car) exitCar();
        avatar.rotation.x = Math.PI / 2; // down on the pavement
      }
    } else {
      deathTimer -= dt;
      if (deathTimer <= 0) {
        avatar.rotation.x = 0;
        respawn();
      }
    }

    // The engine hum and the wail, tracking the moment.
    if (state.car) {
      const revs = Math.min(1, Math.abs(state.car.userData.drive.speed) / CONFIG.car.topSpeed);
      setEngine(0.15 + revs * 0.85, true);
    } else {
      setEngine(0.12, false);
    }
    siren(state.wanted > 0, copInfo ? Math.max(0, Math.min(1, 1 - copInfo.dist / 130)) : 0);

    // Pocket the save every two seconds.
    saveTimer += dt;
    if (saveTimer >= 2) {
      saveTimer = 0;
      saveGame();
    }
  }

  // The chase camera, always lerped, behind the car or the walker.
  if (state.car) {
    const h = state.car.userData.drive.heading;
    camEye.set(
      state.car.position.x - Math.sin(h) * 9.5,
      5.4,
      state.car.position.z - Math.cos(h) * 9.5,
    );
    camLook.set(
      state.car.position.x + Math.sin(h) * 4,
      1.8,
      state.car.position.z + Math.cos(h) * 4,
    );
    cameraBearing += wrapAngle(h - cameraBearing) * 0.08;
  } else {
    camEye.set(
      state.pos.x - Math.sin(cameraBearing) * 7.5,
      state.pos.y + 5,
      state.pos.z - Math.cos(cameraBearing) * 7.5,
    );
    camLook.set(state.pos.x, state.pos.y + 1.6, state.pos.z);
  }
  camera.position.lerp(camEye, Math.min(1, dt * 5));
  camera.lookAt(camLook);

  updateHud(state, cops, peds, CITY_HALF, [missions.blip()]);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- the maker's hooks

window.__sunfall = {
  state,
  avatar,
  camera,
  cars,
  cops,
  peds,
  missions,
  place(x, z) {
    if (state.car) exitCar();
    state.pos.set(Number(x) || 0, 0, Number(z) || 0);
  },
  giveCar(color) {
    const car = makeCar(Number(color) || CONFIG.colors.cars[1], 'sedan');
    car.position.set(state.pos.x + 4, 0, state.pos.z);
    car.userData.drive.heading = state.heading;
    scene.add(car);
    cars.push(car);
    enterCar(car);
    return car;
  },
  exitCar,
  arm(v) {
    if (state.car) return;
    state.armed = typeof v === 'boolean' ? v : !state.armed;
    syncCrosshair();
  },
  heat(n) {
    addCrime(state, Number(n) || 1, onStar);
  },
  money(n) {
    state.money = Number.isFinite(Number(n)) ? Math.floor(Number(n)) : state.money + 100;
  },
};
