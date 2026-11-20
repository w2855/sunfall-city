// The five-job story: a light column marks each spot, pays out, and moves on.
import * as THREE from '../vendor/three.module.min.js';
import { setObjective, toast } from './hud.js';
import { chime } from './audio.js';

// spot fractions are multiplied by worldHalf; each lands on a road line of the grid.
const STEPS = [
  {
    name: 'WOKE UP IN SUNFALL',
    brief: 'answer the payphone downtown',
    pay: 300,
    spot: { x: 0.111, z: 0.111 },
    color: 0xffd166,
  },
  {
    name: 'THE COURIER JOB',
    brief: 'run a duffel to the marina',
    pay: 550,
    spot: { x: -0.333, z: 0.778 },
    color: 0x06d6a0,
  },
  {
    name: 'HOT METAL',
    brief: 'steal any car and bring it to the west-side lockup',
    pay: 800,
    spot: { x: -0.778, z: -0.111 },
    color: 0xef476f,
    needCar: true,
  },
  {
    name: 'PICKUP ON PALM ROW',
    brief: 'meet the fixer on Palm Row',
    pay: 1000,
    spot: { x: 0.778, z: -0.333 },
    color: 0x118ab2,
  },
  {
    name: 'THE LAST FERRY',
    brief: 'lose the heat first, then reach the north ferry dock',
    pay: 2000,
    spot: { x: 0.333, z: -0.778 },
    color: 0xffd166,
    needCool: true,
  },
];

export function createMissionRunner(scene, worldHalf) {
  let index = 0;
  let done = false;
  let time = 0;
  let hintAt = -10;

  // The marker: a translucent light column with a glowing orb on top.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 30, 18, 1, true), beamMat);
  beam.position.y = 15;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10), orbMat);
  orb.position.y = 30.8;
  marker.add(beam, orb);
  scene.add(marker);

  const objectiveText = () =>
    `[${index + 1}/5] ${STEPS[index].name} — ${STEPS[index].brief}`;

  function place() {
    const s = STEPS[index];
    beamMat.color.setHex(s.color);
    orbMat.color.setHex(s.color);
    marker.position.set(s.spot.x * worldHalf, 0, s.spot.z * worldHalf);
    marker.visible = true;
  }

  // Rotate the marker, and pay out when the player (or their car) reaches the spot.
  function step(state, dt) {
    time += dt;
    marker.rotation.y += dt * 0.7;
    orb.position.y = 30.8 + Math.sin(time * 2.2) * 0.5;
    if (done) return;

    const s = STEPS[index];
    const px = state.car ? state.car.position.x : state.pos.x;
    const pz = state.car ? state.car.position.z : state.pos.z;
    const dist = Math.hypot(px - marker.position.x, pz - marker.position.z);
    if (dist >= 5) return;

    if (s.needCar && !state.car) {
      if (time - hintAt > 4) {
        hintAt = time;
        toast('Bring a car to the lockup.');
      }
      return;
    }
    if (s.needCool && state.wanted > 0) {
      if (time - hintAt > 4) {
        hintAt = time;
        toast('Shake the heat first — no stars at the dock.');
      }
      return;
    }

    // Paid. Toast, chime, advance, rename the objective.
    state.money += s.pay;
    state.deliveries += 1;
    chime();
    toast(`${s.name} COMPLETE — $${s.pay}`);
    index += 1;
    if (index >= STEPS.length) {
      done = true;
      marker.visible = false;
      setObjective('SUNFALL IS YOURS — cruise the strip, dodge the heat. The city keeps paying.');
      return 'done';
    }
    place();
    setObjective(objectiveText());
  }

  // The current spot for the minimap.
  function blip() {
    return { x: marker.position.x, z: marker.position.z };
  }

  place();
  return {
    step,
    blip,
    setObjective: () => setObjective(done ? 'SUNFALL IS YOURS — the city keeps paying.' : objectiveText()),
    get index() {
      return index;
    },
  };
}
