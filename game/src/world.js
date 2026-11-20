// Sunfall City — procedural city: roads, blocks, towers, windows, neon, lamps, palms, beach.
// A seeded LCG drives every choice so the same city builds on every run.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

/** Mutable network the rest of the game reads: road line coordinates, building colliders, street props. */
export const network = { lines: [], colliders: [], props: [] };

/** Deterministic LCG random: same seed, same city, every run. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildCity(scene) {
  const { blocks, block, road } = CONFIG.city;
  const half = (blocks * block) / 2;
  const colors = CONFIG.colors;
  const rand = makeRandom(31337);

  network.lines.length = 0;
  network.colliders.length = 0;
  network.props.length = 0;

  const lines = [];
  for (let i = 0; i <= blocks; i++) lines.push(-half + i * block);
  for (const L of lines) network.lines.push(L);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 420, half * 2 + 420),
    new THREE.MeshLambertMaterial({ color: 0x120f20 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  scene.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 420, 44),
    new THREE.MeshLambertMaterial({ color: 0xd9c08c })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, -0.04, half + 26);
  scene.add(beach);

  const roadMat = new THREE.MeshLambertMaterial({ color: colors.road });
  for (const L of lines) {
    const horiz = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + road, road), roadMat);
    horiz.rotation.x = -Math.PI / 2;
    horiz.position.set(0, 0.02, L);
    scene.add(horiz);
    const vert = new THREE.Mesh(new THREE.PlaneGeometry(road, half * 2 + road), roadMat);
    vert.rotation.x = -Math.PI / 2;
    vert.position.set(L, 0.02, 0);
    scene.add(vert);
  }

  const dashGeo = new THREE.PlaneGeometry(2.6, 0.35);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd6d9e4 });
  const dashCapacity = lines.length * 2 * Math.ceil((half * 2 + road) / 8);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCapacity);
  const m4 = new THREE.Matrix4();
  const rotFlat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const rotSide = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  let di = 0;
  for (const L of lines) {
    for (let t = -half - road / 2 + 4; t <= half + road / 2; t += 8) {
      m4.copy(rotFlat).setPosition(t, 0.045, L);
      dashes.setMatrixAt(di++, m4);
      m4.copy(rotSide).multiply(rotFlat).setPosition(L, 0.045, t);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  const sidewalkMat = new THREE.MeshLambertMaterial({ color: colors.sidewalk });
  const towerMats = colors.buildings.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const windowMat = new THREE.MeshBasicMaterial({ color: colors.windowLit, transparent: true, opacity: 0.55 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2b2f3d });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.22 });
  const palmMat = new THREE.MeshLambertMaterial({ color: colors.palm });
  const trunkMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
  const neonPalette = [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xf78c6b, 0xc77dff];

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const slabGeo = new THREE.BoxGeometry(block - road, 0.3, block - road);
  const postGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6);
  const bulbGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const poolGeo = new THREE.CircleGeometry(5.2, 20);
  const neonPoolGeo = new THREE.CircleGeometry(4.5, 22);
  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.24, 4.6, 6);
  const frondGeo = new THREE.ConeGeometry(1.9, 1.5, 7);

  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      const cx = lines[i] + block / 2;
      const cz = lines[j] + block / 2;

      const slab = new THREE.Mesh(slabGeo, sidewalkMat);
      slab.position.set(cx, 0.15, cz);
      scene.add(slab);

      const towerCount = 1 + Math.floor(rand() * 3);
      const cells = [0, 1, 2, 3].sort(() => rand() - 0.5).slice(0, towerCount);
      for (const cell of cells) {
        const ox = (cell % 2 === 0 ? -1 : 1) * 15;
        const oz = (cell < 2 ? -1 : 1) * 15;
        const w = 16 + rand() * 8;
        const d = 16 + rand() * 8;
        const h = 10 + Math.pow(rand(), 1.4) * 54;
        const px = cx + ox + (rand() * 2 - 1) * Math.max(0, 12 - w / 2);
        const pz = cz + oz + (rand() * 2 - 1) * Math.max(0, 12 - d / 2);

        const tower = new THREE.Mesh(unitBox, towerMats[Math.floor(rand() * towerMats.length)]);
        tower.position.set(px, 0.3 + h / 2, pz);
        tower.scale.set(w, h, d);
        scene.add(tower);
        network.colliders.push({ x: px, z: pz, w, d, h });

        const floors = Math.max(1, Math.floor(h / 4));
        for (let f = 0; f < floors; f++) {
          if (rand() < 0.5) continue;
          const band = new THREE.Mesh(unitBox, windowMat);
          band.scale.set(w + 0.25, 1.7, d + 0.25);
          band.position.set(px, 0.3 + f * 4 + 2.4, pz);
          scene.add(band);
        }

        if (h >= 34 && rand() < 0.5) {
          const face = Math.floor(rand() * 4);
          const nx = [1, -1, 0, 0][face];
          const nz = [0, 0, 1, -1][face];
          const neon = neonPalette[Math.floor(rand() * neonPalette.length)];
          const sign = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: neon }));
          const signW = Math.min(w, d) * 0.62;
          const signY = 0.3 + Math.min(h - 5, 8 + rand() * 14);
          if (nx !== 0) {
            sign.scale.set(0.45, 3, signW);
            sign.position.set(px + nx * (w / 2 + 0.35), signY, pz + (rand() * 2 - 1) * Math.max(0.4, d / 2 - signW / 2 - 0.6));
          } else {
            sign.scale.set(signW, 3, 0.45);
            sign.position.set(px + (rand() * 2 - 1) * Math.max(0.4, w / 2 - signW / 2 - 0.6), signY, pz + nz * (d / 2 + 0.35));
          }
          scene.add(sign);

          const glow = new THREE.Mesh(neonPoolGeo, new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.42 }));
          glow.rotation.x = -Math.PI / 2;
          glow.position.set(cx + nx * 37, 0.035, cz + nz * 37);
          scene.add(glow);

          network.props.push({ kind: 'neon', x: sign.position.x, z: sign.position.z, color: neon });
        }
      }

      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lx = cx + sx * 28;
        const lz = cz + sz * 28;
        if (rand() < 0.55) {
          const post = new THREE.Mesh(postGeo, lampMat);
          post.position.set(lx, 0.3 + 2.6, lz);
          scene.add(post);
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(lx, 0.3 + 5.2, lz);
          scene.add(bulb);
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(lx + sx * 5.5, 0.03, lz + sz * 5.5);
          scene.add(pool);
          network.props.push({ kind: 'lamp', x: lx, z: lz });
        } else {
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.set(lx, 0.3 + 2.3, lz);
          trunk.rotation.z = (rand() - 0.5) * 0.14;
          scene.add(trunk);
          const frond = new THREE.Mesh(frondGeo, palmMat);
          frond.position.set(lx + (rand() - 0.5) * 0.4, 0.3 + 4.8, lz + (rand() - 0.5) * 0.4);
          scene.add(frond);
          network.props.push({ kind: 'palm', x: lx, z: lz });
        }
      }
    }
  }
}

export function randomRoadPoint(rand = Math.random) {
  const { blocks, block } = CONFIG.city;
  const half = (blocks * block) / 2;
  const line = -half + Math.floor(rand() * (blocks + 1)) * block;
  const along = (rand() * 2 - 1) * (half - 10);
  const lane = (rand() * 2 - 1) * 3.4;
  if (rand() < 0.5) {
    return { x: line + lane, z: along, dir: rand() < 0.5 ? 0 : Math.PI };
  }
  return { x: along, z: line + lane, dir: rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

export function colliders() {
  return network.colliders;
}
