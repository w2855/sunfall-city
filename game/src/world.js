// Sunfall City's world builder: a blocks-by-blocks grid of asphalt and raised sidewalks,
// dark towers with lit window strips, neon signs, street lamps and palms, and a sandy
// beach beyond the south edge. A seeded LCG keeps the city identical on every run, and
// everything gameplay needs to know about it lives in `network`.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

// The mutable record of the city: road line coordinates for the minimap, collider boxes
// for driving and walking, and prop markers for lamps and palms.
export const network = { lines: [], colliders: [], props: [] };

// Half the city span in metres: roads run on every line at -CITY_HALF + i * block.
export const CITY_HALF = CONFIG.city.blocks * CONFIG.city.block / 2;

// A tiny seeded LCG: deterministic and good enough for city layout, nothing more.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Half the city span: roads run on every line at -half + i * block.
function cityHalf() {
  return CITY_HALF;
}

export function colliders() {
  return network.colliders;
}

// A random point on a random road lane, facing along the lane (right-hand traffic), for
// spawning cars. `rand` is injected so callers choose their own brand of randomness.
export function randomRoadPoint(rand = Math.random) {
  const h = cityHalf();
  const road = CONFIG.city.road;
  const line = network.lines[(rand() * network.lines.length) | 0];
  const along = (rand() * 2 - 1) * (h - 6);
  const side = rand() < 0.5 ? 1 : -1;
  if (rand() < 0.5) {
    // north-south road at x = line: drive +z on the -x lane, -z on the +x lane
    return { x: line - side * road / 4, z: along, dir: side > 0 ? 0 : Math.PI };
  }
  // east-west road at z = line: drive +x on the +z lane, -x on the -z lane
  return { x: along, z: line + side * road / 4, dir: side > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

// One InstancedMesh for a whole family of little boxes (lane dashes, window strips):
// each entry carries its own position and scale, and the batch costs a single draw call.
function addInstances(scene, entries, material) {
  if (!entries.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
  const m = new THREE.Matrix4();
  entries.forEach((t, i) => {
    m.makeScale(t.sx, t.sy, t.sz);
    m.setPosition(t.x, t.y, t.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// A glowing neon panel on a tower's street-facing side plus its painted circle of light
// on the road below — pure emissive paint, never a PointLight.
function addNeon(scene, face, tx, tz, cx, cz, towerW, towerD, y, width, color) {
  const panelW = Math.max(1.6, width);
  let panel;
  if (face < 2) {
    panel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.6, panelW), new THREE.MeshBasicMaterial({ color }));
    panel.position.set(face === 0 ? tx + towerW / 2 + 0.16 : tx - towerW / 2 - 0.16, y, tz);
  } else {
    panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 4.6, 0.22), new THREE.MeshBasicMaterial({ color }));
    panel.position.set(tx, y, face === 2 ? tz + towerD / 2 + 0.16 : tz - towerD / 2 - 0.16);
  }
  scene.add(panel);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  const toRoad = CONFIG.city.block / 2 - CONFIG.city.road / 2 + CONFIG.city.road / 2; // block edge to road centre
  if (face === 0) glow.position.set(cx + toRoad, 0.05, tz);
  else if (face === 1) glow.position.set(cx - toRoad, 0.05, tz);
  else if (face === 2) glow.position.set(tx, 0.05, cz + toRoad);
  else glow.position.set(tx, 0.05, cz - toRoad);
  scene.add(glow);
}

function addStreetLamp(scene, x, z, poolX, poolZ) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c313f })
  );
  post.position.set(x, 2.2, z);
  scene.add(post);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8 })
  );
  bulb.position.set(x, 4.5, z);
  scene.add(bulb);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 18),
    new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.14, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(poolX, 0.05, poolZ);
  scene.add(pool);
  network.props.push({ x, z, kind: 'lamp' });
}

function addPalm(scene, x, z, rand) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, 3.8, 6),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.trunk })
  );
  trunk.position.set(x, 1.9, z);
  trunk.rotation.z = (rand() - 0.5) * 0.16;
  scene.add(trunk);
  const frond = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 1.7, 7),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.palm })
  );
  frond.position.set(x, 4.2, z);
  scene.add(frond);
  network.props.push({ x, z, kind: 'palm' });
}

export function buildCity(scene) {
  const c = CONFIG.city;
  const col = CONFIG.colors;
  const h = cityHalf();
  const rand = lcg(0x5fa11); // the same seed builds the same city every run

  network.lines.length = 0;
  network.colliders.length = 0;
  network.props.length = 0;
  for (let i = 0; i <= c.blocks; i++) network.lines.push(-h + i * c.block);
  const span = 2 * h + c.road;

  // base ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 60, span + 60),
    new THREE.MeshLambertMaterial({ color: 0x171a28 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // roads: every grid line gets a horizontal and a vertical strip of asphalt
  const roadMat = new THREE.MeshLambertMaterial({ color: col.road });
  const roadGeoH = new THREE.PlaneGeometry(span, c.road);
  const roadGeoV = new THREE.PlaneGeometry(c.road, span);
  for (const line of network.lines) {
    const hr = new THREE.Mesh(roadGeoH, roadMat);
    hr.rotation.x = -Math.PI / 2;
    hr.position.set(0, 0.02, line);
    scene.add(hr);
    const vr = new THREE.Mesh(roadGeoV, roadMat);
    vr.rotation.x = -Math.PI / 2;
    vr.position.set(line, 0.035, 0);
    scene.add(vr);
  }

  // white lane dashes every 8 metres along every road, in one instanced batch
  const dashes = [];
  for (const line of network.lines) {
    for (let a = -h; a <= h; a += 8) {
      dashes.push({ x: a, y: 0.055, z: line, sx: 2.4, sy: 0.05, sz: 0.4 });
      dashes.push({ x: line, y: 0.062, z: a, sx: 0.4, sy: 0.05, sz: 2.4 });
    }
  }
  addInstances(scene, dashes, new THREE.MeshBasicMaterial({ color: 0xcdd3e0 }));

  // blocks: a raised sidewalk slab, 1-3 towers, windows, neon, and corner lamps or palms
  const slabHalf = (c.block - c.road) / 2;
  const slabGeo = new THREE.BoxGeometry(c.block - c.road, 0.24, c.block - c.road);
  const slabMat = new THREE.MeshLambertMaterial({ color: col.sidewalk });
  const towerMats = col.buildings.map((b) => new THREE.MeshLambertMaterial({ color: b }));
  const windows = [];
  const neonColors = [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xff8c42];
  const cornerSign = Math.SQRT1_2 * (slabHalf - 6); // block-corner lamp/palm distance

  for (let bi = 0; bi < c.blocks; bi++) {
    for (let bj = 0; bj < c.blocks; bj++) {
      const cx = -h + bi * c.block + c.block / 2;
      const cz = -h + bj * c.block + c.block / 2;
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(cx, 0.12, cz);
      scene.add(slab);

      const towerCount = 1 + ((rand() * 3) | 0);
      const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let i = quads.length - 1; i > 0; i--) { // shuffle, then take towerCount
        const j = (rand() * (i + 1)) | 0;
        [quads[i], quads[j]] = [quads[j], quads[i]];
      }
      // the centre block stays an open plaza, so the heart of the city keeps a sky view
      const plaza = bi === (c.blocks >> 1) && bj === (c.blocks >> 1);
      for (let t = plaza ? towerCount : 0; t < towerCount; t++) {
        const [qx, qz] = quads[t];
        const w = 12 + rand() * 10;
        const d = 12 + rand() * 10;
        const jx = (rand() * 2 - 1) * Math.max(0, 15 - w / 2);
        const jz = (rand() * 2 - 1) * Math.max(0, 15 - d / 2);
        const tx = cx + qx * 15 + jx;
        const tz = cz + qz * 15 + jz;
        const th = 10 + rand() * 54;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, th, d), towerMats[(rand() * towerMats.length) | 0]);
        tower.position.set(tx, 0.24 + th / 2, tz);
        scene.add(tower);
        network.colliders.push({ x: tx, z: tz, w, d, h: th });

        // lit window strips on one street-facing side, one per 4-metre floor, half skipped
        const face = (rand() * 4) | 0;
        const floors = Math.max(1, Math.floor((th - 4) / 4));
        for (let f = 0; f < floors; f++) {
          const y = 3.2 + f * 4;
          if (y > th - 2) break;
          if (rand() < 0.5) continue;
          if (face < 2) {
            windows.push({
              x: face === 0 ? tx + w / 2 + 0.09 : tx - w / 2 - 0.09, y, z: tz,
              sx: 0.12, sy: 0.55, sz: d * 0.72,
            });
          } else {
            windows.push({
              x: tx, y, z: face === 2 ? tz + d / 2 + 0.09 : tz - d / 2 - 0.09,
              sx: w * 0.72, sy: 0.55, sz: 0.12,
            });
          }
        }

        // a neon sign on half the tall towers
        if (th > 34 && rand() < 0.5) {
          addNeon(scene, face, tx, tz, cx, cz, w, d, th * 0.6, Math.min(w, d) * 0.45,
            neonColors[(rand() * neonColors.length) | 0]);
        }
      }

      // street lamps or palm trees at the four corners of the block
      const lamps = rand() < 0.45;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = cx + sx * cornerSign;
        const pz = cz + sz * cornerSign;
        if (lamps) addStreetLamp(scene, px, pz, cx + sx * (slabHalf + 6), cz + sz * (slabHalf + 6));
        else addPalm(scene, px, pz, rand);
      }
    }
  }
  addInstances(scene, windows, new THREE.MeshBasicMaterial({
    color: col.windowLit, transparent: true, opacity: 0.55, depthWrite: false,
  }));

  // a sandy beach strip beyond the south edge
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 40, 64),
    new THREE.MeshLambertMaterial({ color: 0xd3b98a })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.012, -h - c.road / 2 - 30);
  scene.add(beach);
}

// Sidewalk slabs sit 0.24 above the asphalt; walkers stand on them, not inside them.
export function groundHeight(x, z) {
  const c = CONFIG.city;
  const bi = Math.floor((x + CITY_HALF) / c.block);
  const bj = Math.floor((z + CITY_HALF) / c.block);
  if (bi < 0 || bi >= c.blocks || bj < 0 || bj >= c.blocks) return 0;
  const cx = -CITY_HALF + bi * c.block + c.block / 2;
  const cz = -CITY_HALF + bj * c.block + c.block / 2;
  const half = (c.block - c.road) / 2;
  return Math.abs(x - cx) <= half && Math.abs(z - cz) <= half ? 0.24 : 0;
}
