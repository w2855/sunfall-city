// The five-job story of Sunfall City: one glowing marker at a time, paid on arrival,
// with extra conditions on the steal and the final ferry. The runner owns the light
// column, the objective line, the minimap blip and the pay-outs.
import * as THREE from '../vendor/three.module.min.js';
import { setObjective, toast } from './hud.js';
import { chime } from './audio.js';

export function createMissionRunner(scene, worldHalf) {
  const steps = [
    { name: 'WOKE UP IN SUNFALL', brief: 'Answer the payphone by the south dock.', pay: 300, spot: [0.05, -0.88], color: 0xffd166, need: null },
    { name: 'THE COURIER JOB', brief: 'Run the duffel across town to the marina.', pay: 550, spot: [0.88, 0.1], color: 0x06d6a0, need: null },
    { name: 'HOT METAL', brief: 'Steal any car and bring it to the west-side lockup.', pay: 800, spot: [-0.88, 0.25], color: 0xef476f, need: 'car' },
    { name: 'PICKUP ON PALM ROW', brief: 'Grab the package waiting on Palm Row.', pay: 1000, spot: [0.12, 0.8], color: 0xf78c6b, need: null },
    { name: 'THE LAST FERRY', brief: 'Shake the heat, then make the last ferry south.', pay: 2000, spot: [0.5, -0.94], color: 0x118ab2, need: 'cold' },
  ];
  let index = 0;
  let done = false;
  let time = 0;

  // the current spot: a yellow translucent light column with a glowing sphere beside it
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 46, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    })
  );
  column.position.y = 23;
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 12, 10),
    new THREE.MeshBasicMaterial({ color: steps[0].color })
  );
  orb.position.y = 5.5;
  const marker = new THREE.Group();
  marker.add(column, orb);
  scene.add(marker);

  function placeMarker() {
    const s = steps[index];
    marker.position.set(s.spot[0] * worldHalf, 0, s.spot[1] * worldHalf);
    orb.material.color.setHex(s.color);
  }
  placeMarker();

  function label() {
    const s = steps[index];
    return `[${index + 1}/5] ${s.name} — ${s.brief}`;
  }
  setObjective(label());

  return {
    // returns 'done' on the frame the fifth job pays, and every frame after
    step(state, dt) {
      if (done) return 'done';
      time += dt;
      marker.rotation.y += dt * 0.8;
      orb.position.y = 5.5 + Math.sin(time * 2.2) * 0.8;

      const s = steps[index];
      const px = state.car ? state.car.position.x : state.pos.x;
      const pz = state.car ? state.car.position.z : state.pos.z;
      const dist = Math.hypot(px - marker.position.x, pz - marker.position.z);
      if (dist >= 5) return undefined;

      // extra conditions: a car for the steal step, clean heat for the last ferry
      if (s.need === 'car' && !state.car) return undefined;
      if (s.need === 'cold' && state.wanted > 0) return undefined;

      state.money += s.pay;
      state.deliveries += 1;
      toast(`${s.name} COMPLETE — $${s.pay}`);
      chime();

      index += 1;
      if (index >= steps.length) {
        done = true;
        marker.visible = false;
        setObjective('SUNFALL IS YOURS — THE CITY KEEPS ITS SECRETS');
        return 'done';
      }
      placeMarker();
      setObjective(label());
      return undefined;
    },

    // the current marker position (and its colour) for the minimap
    blip() {
      if (done) return null;
      const s = steps[index];
      return { x: s.spot[0] * worldHalf, z: s.spot[1] * worldHalf, color: s.color };
    },
  };
}
