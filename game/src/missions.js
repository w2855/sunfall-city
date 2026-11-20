// Missions: a short story of five jobs across Sunfall City — pickups, deliveries, a getaway and
// a score. The chain advances in order; each step names itself on the HUD and pays on arrival.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { banner, setObjective, toast } from './hud.js';

const STORY = [
  {
    name: 'WOKE UP IN SUNFALL',
    brief: 'Your boat docked at dawn with nothing but a phone number. Find the payphone on Ocean Ave and answer it.',
    pay: 300,
    spot: { x: 0.35, z: -0.62 }, // fractions of the city half, resolved at build time
    color: '#ffd166',
  },
  {
    name: 'THE COURIER JOB',
    brief: 'A duffel needs to reach the marina warehouse before the tide turns. Any car will do. Try not to get one stolen.',
    pay: 550,
    spot: { x: -0.55, z: 0.4 },
    color: '#06d6a0',
  },
  {
    name: 'HOT METAL',
    brief: 'The client wants something fast and not theirs. Steal any car and bring it to the lockup on the west side.',
    pay: 800,
    steal: true,
    spot: { x: -0.6, z: -0.5 },
    color: '#ef476f',
  },
  {
    name: 'PICKUP ON PALM ROW',
    brief: 'Collect the envelope from the courier on Palm Row. The police have been told a man in a red jacket is up to something.',
    pay: 1000,
    spot: { x: 0.5, z: 0.55 },
    color: '#118ab2',
  },
  {
    name: 'THE LAST FERRY',
    brief: 'Everything you owe is settled at the north pier. Lose the heat before you get there, or the deal walks.',
    pay: 2000,
    spot: { x: 0.1, z: 0.8 },
    requireCool: true,
    color: '#ffd166',
  },
];

export function createMissionRunner(scene, worldHalf) {
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 12, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  );
  scene.add(marker);
  const beam = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  scene.add(beam);

  const runner = { index: 0, active: true };
  const resolve = (f) => f * worldHalf;

  function place(i) {
    const step = STORY[i];
    const x = resolve(step.spot.x);
    const z = resolve(step.spot.z);
    marker.position.set(x, 6, z);
    beam.position.set(x, 1.4, z);
    marker.material.color.set(step.color);
    beam.material.color.set(step.color);
    setObjective('[' + (i + 1) + '/' + STORY.length + '] ' + step.name + ' — ' + step.brief);
  }

  place(0);

  /** One check per frame: arrive at the marker, meet the step's extra condition, get paid. */
  runner.step = function (state, dt) {
    if (!runner.active) return null;
    const step = STORY[runner.index];
    marker.rotation.y += dt * 0.8;
    const px = state.car ? state.car.position.x : state.pos.x;
    const pz = state.car ? state.car.position.z : state.pos.z;
    const dist = Math.hypot(px - marker.position.x, pz - marker.position.z);
    const cool = !step.requireCool || state.wanted === 0;
    const droveIn = !step.steal || state.car;
    if (dist < 5 && cool && droveIn) {
      state.money += step.pay;
      state.deliveries += 1;
      banner('JOB DONE  +$' + step.pay);
      toast(step.name + ' cleared. Paid $' + step.pay + '.');
      runner.index += 1;
      if (runner.index >= STORY.length) {
        runner.active = false;
        setObjective('SUNFALL CITY CLEARED — the city is yours. Cause chaos, dodge the heat, or restart from the menu.');
        return 'done';
      }
      place(runner.index);
      banner(STORY[runner.index].name);
    }
    return null;
  };

  runner.blip = function () {
    if (!runner.active) return [];
    return [{ x: marker.position.x, z: marker.position.z, color: STORY[runner.index].color }];
  };

  return runner;
}
