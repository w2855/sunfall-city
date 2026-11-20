// Sunfall City: a procedurally built coastal city grid — roads, blocks of towers, sidewalks,
// streetlights and palms — plus the road network the traffic and the police drive on, and the
// building colliders the player and the cars bump into. Same seed, same city, every run.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const C = CONFIG.city;

/** The road network: centre lines across x and z, as the grid draws them. */
export const network = { lines: [], colliders: [], props: [] };

function rnd(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Every collider box, for the player, the cars and the bullets to hit. */
export function colliders() {
  return network.colliders;
}

/** Build the whole city into `scene` and return the spawn point. */
export function buildCity(scene) {
  const rand = rnd(20261120);
  const span = C.blocks * C.block;
  const half = span / 2;
  const g = new THREE.Group();

  // The ground the city stands on, and the sea that surrounds it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 600, span + 600),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  g.add(ground);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 900, span + 900),
    new THREE.MeshLambertMaterial({ color: 0x0d2740 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;
  g.add(sea);

  // Road centre lines: one per grid row and column, kept for the traffic.
  const lineCoords = [];
  for (let i = 0; i <= C.blocks; i++) lineCoords.push(-half + i * C.block + C.block / 2 - C.road / 2 + C.road / 2);
  for (let i = 0; i <= C.blocks; i++) {
    const at = -half + i * C.block;
    lineCoords[i] = at;
    // Horizontal and vertical asphalt strips.
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span, C.road), new THREE.MeshLambertMaterial({ color: CONFIG.colors.road }));
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, at);
    g.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(C.road, span), new THREE.MeshLambertMaterial({ color: CONFIG.colors.road }));
    v.rotation.x = -Math.PI / 2;
    v.position.set(at, 0.02, 0);
    g.add(v);
    network.lines.push(at);
  }

  // Lane markings: short dashes along every road, cheap and legible.
  const dash = new THREE.BoxGeometry(2.2, 0.02, 0.3);
  const dashMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.line });
  for (const at of network.lines) {
    for (let t = -half + 6; t < half; t += 8) {
      const a = new THREE.Mesh(dash, dashMat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(t, 0.03, at);
      g.add(a);
      const b = new THREE.Mesh(dash, dashMat);
      b.rotation.x = -Math.PI / 2;
      b.rotation.z = Math.PI / 2;
      b.position.set(at, 0.03, t);
      g.add(b);
    }
  }

  // One block at a time: sidewalks, one to three towers, palms and lights.
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.sidewalk });
  const palmMat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.palm });
  const trunkMat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.trunk });
  const lightPostMat = new THREE.MeshLambertMaterial({ color: 0x46505e });
  const lightBulbMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.windowLit });
  const inner = C.block - C.road;
  for (let bx = 0; bx < C.blocks; bx++) {
    for (let bz = 0; bz < C.blocks; bz++) {
      const cx = -half + bx * C.block + C.block / 2;
      const cz = -half + bz * C.block + C.block / 2;
      const walk = new THREE.Mesh(new THREE.BoxGeometry(inner, 0.22, inner), sidewalkMat);
      walk.position.set(cx, 0.11, cz);
      g.add(walk);

      // Beach on the south-east corner stays a park: palms, no towers.
      const isPark = bx >= C.blocks - 2 && bz <= 1;
      if (!isPark) {
        const count = 1 + Math.floor(rand() * 2.4);
        const cells = count === 1 ? [[0, 0, inner, inner]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]].slice(0, count);
        for (const [ox, oz] of cells.length > 2 || count === 1 ? (count === 1 ? [[0, 0, inner, inner]] : cells.map(([a, b]) => [a, b])) : cells) {
          const w = (count === 1 ? inner : inner / 2 - 4) * (0.72 + rand() * 0.26);
          const d = (count === 1 ? inner : inner / 2 - 4) * (0.72 + rand() * 0.26);
          const bx0 = count === 1 ? cx : cx + ox * (inner / 4 + 2);
          const bz0 = count === 1 ? cz : cz + oz * (inner / 4 + 2);
          const hgt = 10 + rand() * (CONFIG.colors.buildings.length, C.maxBuildingHeight - 10);
          const col = CONFIG.colors.buildings[Math.floor(rand() * CONFIG.colors.buildings.length)];
          const tower = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshLambertMaterial({ color: col }));
          tower.position.set(bx0, hgt / 2 + 0.2, bz0);
          g.add(tower);
          network.colliders.push({ x: bx0, z: bz0, w, d, h: hgt });
          // Lit windows: a lit strip per floor, emissive-cheap via basic material.
          const floors = Math.floor(hgt / 4);
          const winGeo = new THREE.BoxGeometry(w * 0.86, 1.05, d * 0.86);
          const winMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.windowLit, transparent: true, opacity: 0.55 });
          for (let f = 1; f <= floors; f += 1) {
            if (rand() < 0.45) continue;
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(bx0, f * 4 + 1.4, bz0);
            g.add(win);
          }
          // A neon sign on some towers: a glowing colour panel by the road, the city's nightlife.
          if (rand() < 0.55 && hgt > 18) {
            const neonCols = [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xc77dff];
            const neonCol = neonCols[Math.floor(rand() * neonCols.length)];
            const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2.2, 0.4), new THREE.MeshBasicMaterial({ color: neonCol }));
            const face = rand() < 0.5 ? 1 : -1;
            sign.position.set(bx0, 6 + rand() * (hgt - 10), bz0 + face * (d / 2 + 0.3));
            if (face < 0) sign.rotation.y = Math.PI;
            g.add(sign);
            // A painted wash of the sign's colour on the street below it.
            const wash = new THREE.Mesh(new THREE.CircleGeometry(6.5, 16), new THREE.MeshBasicMaterial({ color: neonCol, transparent: true, opacity: 0.3, depthWrite: false }));
            wash.rotation.x = -Math.PI / 2;
            wash.position.set(bx0, 0.06, bz0 + face * (d / 2 + 3.2));
            g.add(wash);
          }
          if (rand() < 0.5) {
            const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 3, d * 0.35), new THREE.MeshLambertMaterial({ color: 0x4a3f55 }));
            crown.position.set(bx0, hgt + 1.7, bz0);
            g.add(crown);
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef476f }));
            beacon.position.set(bx0, hgt + 3.4, bz0);
            g.add(beacon);
            network.props.push({ kind: 'beacon', mesh: beacon });
          }
        }
      }

      // Sidewalk palms and streetlights at the block corners.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = cx + sx * (inner / 2 - 2.2);
        const pz = cz + sz * (inner / 2 - 2.2);
        if (rand() < 0.5) {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 5.4, 6), trunkMat);
          trunk.position.set(px, 2.9, pz);
          g.add(trunk);
          const frond = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 7), palmMat);
          frond.position.set(px, 6.1, pz);
          g.add(frond);
        } else {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), lightPostMat);
          post.position.set(px, 3.7, pz);
          g.add(post);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), lightBulbMat);
          bulb.position.set(px, 7.4, pz);
          g.add(bulb);
          // A painted pool of lamplight on the road: the glow a real light would cast, at no cost.
          const pool = new THREE.Mesh(new THREE.CircleGeometry(5.2, 16), new THREE.MeshBasicMaterial({ color: 0x6b5a2e, transparent: true, opacity: 0.5, depthWrite: false }));
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(px, 0.05, pz);
          g.add(pool);
        }
      }
    }
  }

  // The beach strip on the south edge: sand and water the player can walk to.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(span, 60), new THREE.MeshLambertMaterial({ color: 0xc9b287 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, half + 44);
  g.add(sand);

  scene.add(g);
  return { spawn: new THREE.Vector3(network.lines[Math.floor(network.lines.length / 2)] + 6, 0, network.lines[1] + 6), half, span };
}

/** A random point on a road lane, heading along its direction, for spawning cars and pedestrians. */
export function randomRoadPoint(rand) {
  const at = network.lines[Math.floor(rand() * network.lines.length)];
  const along = (rand() - 0.5) * (C.blocks * C.block - 30);
  const horizontal = rand() < 0.5;
  const lane = (C.road / 4) * (rand() < 0.5 ? 1 : -1);
  return horizontal
    ? { x: along, z: at + lane, dir: rand() < 0.5 ? 0 : Math.PI }
    : { x: at + lane, z: along, dir: rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}
