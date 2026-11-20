// Sunfall City — the five-step story. A translucent light column plus a glowing orb marks the
// current spot; arriving (on foot or in a car, meeting the step's extra condition) pays out,
// toasts, and renames the objective. After the fifth the city is yours.
import * as THREE from '../vendor/three.module.min.js';
import { setObjective, toast } from './hud.js';
import { chime } from './audio.js';

// Spots are fractions of worldHalf; each one lands on a road, the pavement or the sand,
// never inside a tower.
const STEPS = [
  { name: 'WOKE UP IN SUNFALL', brief: 'ANSWER THE PAYPHONE ON MERIDIAN PLAZA', pay: 300, spot: [-0.075, 0.985], color: 0xffd166, need: null },
  { name: 'THE COURIER JOB', brief: 'RUN THE DUFFEL DOWN TO THE MARINA', pay: 550, spot: [0.55, 1.05], color: 0x06d6a0, need: null },
  { name: 'HOT METAL', brief: 'STEAL A CAR AND DRIVE IT TO THE WEST-SIDE LOCKUP', pay: 800, spot: [-0.97, 0.12], color: 0xef476f, need: 'car' },
  { name: 'PICKUP ON PALM ROW', brief: 'COLLECT THE ENVELOPE WAITING ON PALM ROW', pay: 1000, spot: [0.333, -0.52], color: 0x118ab2, need: null },
  { name: 'THE LAST FERRY', brief: 'LOSE THE HEAT, THEN MAKE THE LAST FERRY AT THE DOCK', pay: 2000, spot: [0.04, 1.02], color: 0xffd166, need: 'calm' },
];

export function createMissionRunner(scene, worldHalf) {
  let index = 0;
  let done = false;
  let clock = 0;
  let hintCool = 0;

  // A translucent light column plus a glowing orb marks the current spot.
  const marker = new THREE.Group();
  const columnMat = new THREE.MeshBasicMaterial({
    color: 0xffd166, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false,
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 26, 16, 1, true), columnMat);
  column.position.y = 13;
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), orbMat);
  orb.position.y = 2.4;
  marker.add(column, orb);
  scene.add(marker);

  const spotOf = (s) => ({ x: s.spot[0] * worldHalf, z: s.spot[1] * worldHalf });

  // Point the marker at the current step and repaint its glow.
  function place() {
    const s = STEPS[index];
    const { x, z } = spotOf(s);
    marker.position.set(x, 0, z);
    columnMat.color.set(s.color);
    orbMat.color.set(s.color);
    setObjective(`[${index + 1}/5] ${s.name} — ${s.brief}`);
  }

  /** One step: spin the marker, bob the orb, pay out when the player (or car) reaches the spot. */
  function step(state, dt) {
    clock += dt;
    hintCool = Math.max(0, hintCool - dt);
    marker.rotation.y += dt * 1.2;
    orb.position.y = 2.4 + Math.sin(clock * 2.3) * 0.4;

    if (done) return 'done';

    const s = STEPS[index];
    const { x, z } = spotOf(s);
    const px = state.car ? state.car.position.x : state.pos.x;
    const pz = state.car ? state.car.position.z : state.pos.z;
    if (Math.hypot(px - x, pz - z) >= 5) return;

    // Extra conditions: the lockup wants the car you arrive in, the ferry wants clean heat.
    if (s.need === 'car' && !state.car) {
      if (hintCool <= 0) {
        toast('THE LOCKUP WANTS THE CAR YOU ARRIVE IN');
        hintCool = 2.5;
      }
      return;
    }
    if (s.need === 'calm' && state.wanted > 0) {
      if (hintCool <= 0) {
        toast('LOSE THE HEAT BEFORE THE FERRY WILL TAKE YOU');
        hintCool = 2.5;
      }
      return;
    }

    state.money += s.pay;
    state.deliveries += 1;
    toast(`+$${s.pay} · ${s.name} COMPLETE`);
    chime();

    index += 1;
    if (index >= STEPS.length) {
      done = true;
      marker.visible = false;
      setObjective('SUNFALL IS YOURS — FREE ROAM. THE CITY KEEPS ITS SECRETS.');
      return 'done';
    }
    place();
  }

  /** The current marker position (colour included) for the minimap, or null when done. */
  function blip() {
    if (done) return null;
    const s = STEPS[index];
    const { x, z } = spotOf(s);
    return { x, z, color: s.color };
  }

  place();
  return { step, blip };
}
