// Builds Sunfall City itself: the road grid, the blocks, the towers, the neon, the beach.
// A seeded LCG drives every choice, so the same city builds on every run.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const { blocks, block, road } = CONFIG.city;
const half = (blocks * block) / 2;                    // outer road centres sit at +-half
export const CITY_EDGE = half + block / 2 + road / 2; // the outer rim of the city
const SLAB = block - road;                            // a block's buildable width
export const CITY_HALF = half;

// Mutable world records: minimap road lines, physics boxes, street furniture.
export const network = { lines: [], colliders: [], props: [] };

// Raised sidewalk rectangles, for groundHeight().
const slabs = [];

const NEON = [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xf78c6b];

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Shared materials and geometries, built once.
let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ring = new THREE.CircleGeometry(1, 20);
  ring.rotateX(-Math.PI / 2);
  shared = {
    box,
    ring,
    road: new THREE.MeshLambertMaterial({ color: CONFIG.colors.road }),
    dash: new THREE.MeshBasicMaterial({ color: 0xc4c9d6 }),
    walk: new THREE.MeshLambertMaterial({ color: CONFIG.colors.sidewalk }),
    ground: new THREE.MeshLambertMaterial({ color: 0x14111f }),
    sand: new THREE.MeshLambertMaterial({ color: 0xd6bd85 }),
    windowLit: new THREE.MeshBasicMaterial({ color: CONFIG.colors.windowLit, transparent: true, opacity: 0.55 }),
    lampPost: new THREE.MeshLambertMaterial({ color: 0x23283a }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe6b0 }),
    pool: new THREE.MeshBasicMaterial({ color: CONFIG.colors.windowLit, transparent: true, opacity: 0.13, depthWrite: false }),
    palm: new THREE.MeshLambertMaterial({ color: CONFIG.colors.palm }),
    trunk: new THREE.MeshLambertMaterial({ color: CONFIG.colors.trunk }),
  };
  return shared;
}

export function buildCity(scene) {
  network.lines.length = 0;
  network.colliders.length = 0;
  network.props.length = 0;
  slabs.length = 0;
  const S = sharedAssets();
  const rng = makeRng(0x51fa11);
  const span = half * 2 + road;

  // Dark ground far beyond the city; the beach takes the far south.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), S.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  const beach = new THREE.Mesh(new THREE.PlaneGeometry(1600, 130), S.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, half + road / 2 + 65);
  scene.add(beach);

  // The road grid: one horizontal and one vertical plane per grid line, plus lane dashes.
  for (let i = 0; i <= blocks; i++) {
    const pos = -half + i * block;

    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(span, road), S.road);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.01, pos);
    scene.add(hRoad);

    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(road, span), S.road);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(pos, 0.02, 0);
    scene.add(vRoad);

    for (let d = -half; d <= half; d += 8) {
      const hDash = new THREE.Mesh(S.box, S.dash);
      hDash.scale.set(2.6, 0.02, 0.34);
      hDash.position.set(d, 0.05, pos);
      scene.add(hDash);
      const vDash = new THREE.Mesh(S.box, S.dash);
      vDash.scale.set(0.34, 0.02, 2.6);
      vDash.position.set(pos, 0.05, d);
      scene.add(vDash);
    }

    network.lines.push({ axis: 'h', pos }, { axis: 'v', pos });
  }

  // A tower with its window strips, and maybe a neon sign.
  function addTower(scene_, cx, cz, color) {
    const w = 16 + rng() * 10;
    const d = 16 + rng() * 10;
    const h = 10 + rng() * 54;
    const base = 0.3; // the sidewalk slab's top

    const tower = new THREE.Mesh(S.box, new THREE.MeshLambertMaterial({ color }));
    tower.scale.set(w, h, d);
    tower.position.set(cx, base + h / 2, cz);
    scene_.add(tower);

    network.colliders.push({ x: cx, z: cz, w, d, h });

    // One lit strip per 4-metre floor, skipping half of them at random.
    const floors = Math.max(1, Math.floor(h / 4) - 1);
    for (let f = 0; f < floors; f++) {
      if (rng() < 0.5) continue;
      const strip = new THREE.Mesh(S.box, S.windowLit);
      strip.scale.set(w + 0.14, 0.55, d + 0.14);
      strip.position.set(cx, base + 2.4 + f * 4, cz);
      scene_.add(strip);
    }

    // Half of the tall towers get a glowing neon panel on their street-facing side,
    // and a painted circle of the same colour on the ground below it. No PointLight.
    if (h >= 34 && rng() < 0.5) {
      const color3 = NEON[(rng() * NEON.length) | 0];
      const mat = new THREE.MeshBasicMaterial({ color: color3 });
      const panel = new THREE.Mesh(S.box, mat);
      const y = base + h - 3;
      const off = rng() * (Math.min(w, d) - 6) - (Math.min(w, d) - 6) / 2;
      let px, py, pz;
      if (Math.abs(cx) >= Math.abs(cz)) {
        px = cx + Math.sign(cx || 1) * (w / 2 + 0.3);
        py = y;
        pz = cz + off;
        panel.scale.set(0.5, 2.4, 6);
      } else {
        px = cx + off;
        py = y;
        pz = cz + Math.sign(cz || 1) * (d / 2 + 0.3);
        panel.scale.set(6, 2.4, 0.5);
      }
      panel.position.set(px, py, pz);
      scene_.add(panel);

      const glow = new THREE.Mesh(S.ring, mat);
      glow.scale.set(3.4, 1, 3.4);
      glow.position.set(px, groundHeight(px, pz) + 0.04, pz);
      scene_.add(glow);
    }
  }

  // A street lamp or a palm tree at a block corner.
  function addCornerProp(scene_, x, z, kind) {
    if (kind === 'lamp') {
      const post = new THREE.Mesh(S.box, S.lampPost);
      post.scale.set(0.16, 5.4, 0.16);
      post.position.set(x, 2.7 + 0.3, z);
      scene_.add(post);
      const arm = new THREE.Mesh(S.box, S.lampPost);
      arm.scale.set(1.1, 0.12, 0.12);
      arm.position.set(x + 0.55, 5.9, z);
      scene_.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), S.bulb);
      bulb.position.set(x + 1.05, 5.82, z);
      scene_.add(bulb);
      const pool = new THREE.Mesh(S.ring, S.pool);
      pool.scale.set(3.6, 1, 3.6);
      pool.position.set(x + 1.05, groundHeight(x + 1.05, z) + 0.05, z);
      scene_.add(pool);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.8, 7), S.trunk);
      trunk.position.set(x, 1.9 + 0.3, z);
      trunk.rotation.z = (rng() - 0.5) * 0.16;
      scene_.add(trunk);
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.6, 6), S.palm);
      frond.position.set(x, 4.6 + 0.3, z);
      scene_.add(frond);
    }
    network.props.push({ kind, x, z });
  }

  // The blocks: a raised sidewalk slab each, 1-3 towers, props on the four corners.
  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const cx = -half + bx * block + block / 2;
      const cz = -half + bz * block + block / 2;
      const r = SLAB / 2;

      const slab = new THREE.Mesh(S.box, S.walk);
      slab.scale.set(SLAB, 0.3, SLAB);
      slab.position.set(cx, 0.15, cz);
      scene.add(slab);
      slabs.push({ x: cx, z: cz, r });

      const count = 1 + ((rng() * 3) | 0);
      const slots = [
        [-13, -13],
        [13, -13],
        [0, 13],
      ];
      for (let t = 0; t < count; t++) {
        const jitter = () => (rng() - 0.5) * 8;
        addTower(scene, cx + slots[t][0] + jitter(), cz + slots[t][1] + jitter(), CONFIG.colors.buildings[(rng() * CONFIG.colors.buildings.length) | 0]);
      }

      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        addCornerProp(scene, cx + sx * (r - 4), cz + sz * (r - 4), rng() < 0.55 ? 'lamp' : 'palm');
      }
    }
  }
}

// The surface height under a point: 0.3 on a sidewalk slab, 0 on road, ground or beach.
export function groundHeight(x, z) {
  for (const s of slabs) {
    if (Math.abs(x - s.x) < s.r && Math.abs(z - s.z) < s.r) return 0.3;
  }
  return 0;
}

// A random spot on a road lane, nose-first heading matching right-hand traffic.
export function randomRoadPoint(rand = Math.random) {
  const line = -half + Math.floor(rand() * (blocks + 1)) * block;
  const along = (rand() * 2 - 1) * (half - 4);
  const lane = road * 0.25;
  const eastWest = rand() < 0.5;
  const forward = rand() < 0.5;
  if (eastWest) {
    // driving +x keeps to the +z lane, -x to the -z lane
    return {
      x: along,
      z: line + (forward ? lane : -lane),
      dir: forward ? Math.PI / 2 : -Math.PI / 2,
    };
  }
  // driving +z keeps to the -x lane, -z to the +x lane
  return {
    x: line + (forward ? -lane : lane),
    z: along,
    dir: forward ? 0 : Math.PI,
  };
}

// Every physics box in the city.
export function colliders() {
  return network.colliders;
}
