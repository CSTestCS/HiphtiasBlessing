import * as THREE from 'three';
import { Level, mat, textPlane } from '../level.js';

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCity({ workplaceName = 'Work' } = {}) {
  const L = new Level('city');
  const rng = mulberry(1234);
  L.indoor = false;
  L.bounds = { minX: -30, maxX: 30, minZ: -152, maxZ: 12 };

  // Ground
  L.floor(0, -70, 60, 164, '#9e9e9e'); // pavement base
  L.floor(0, -70, 10, 164, '#3b3b3f', 0.002); // main road
  for (const zc of [-45, -95]) L.floor(0, zc, 60, 10, '#3b3b3f', 0.003);
  // Road markings
  for (let z = 10; z > -150; z -= 6) {
    if ((z < -39 && z > -51) || (z < -89 && z > -101)) continue;
    L.floor(0, z, 0.18, 3, '#f5f6fa', 0.004);
  }
  // Crosswalks
  const crosswalk = (cx, cz, alongX) => {
    for (let i = -4; i <= 4; i++) {
      if (alongX) L.floor(cx + i * 1.1, cz, 0.55, 3, '#ecf0f1', 0.005);
      else L.floor(cx, cz + i * 1.1, 3, 0.55, '#ecf0f1', 0.005);
    }
  };
  crosswalk(0, -60, true);
  crosswalk(0, -120, true);
  crosswalk(0, 4, true);
  crosswalk(7, -45, false);
  crosswalk(-7, -45, false);
  crosswalk(7, -95, false);
  crosswalk(-7, -95, false);
  // Curbs
  for (const x of [-5.1, 5.1]) {
    for (const [z1, z2] of [
      [12, -40],
      [-50, -90],
      [-100, -152],
    ]) {
      L.box(x, (z1 + z2) / 2, 0.2, Math.abs(z1 - z2), 0.12, '#bdc3c7', { collide: false, occlude: false, shadow: false });
    }
  }

  // Buildings
  const palette = ['#d1ccc0', '#b8a99a', '#a4b0be', '#c8d6e5', '#e3c4a8', '#c7a17a', '#95a5a6', '#d6a2ad', '#b5c99a'];
  const block = (x1, x2, z1, z2, opts = {}) => {
    let z = z1;
    while (z > z2 + 0.1) {
      const len = Math.min(z - z2, 8 + rng() * 10);
      const h = opts.h || 7 + rng() * 14;
      const col = palette[Math.floor(rng() * palette.length)];
      const cz = z - len / 2;
      L.box((x1 + x2) / 2, cz, Math.abs(x2 - x1), len - 0.3, h, col);
      // shop window band facing the street
      const face = x1 > 0 ? Math.min(x1, x2) - 0.02 : Math.max(x1, x2) + 0.02;
      L.box(face, cz, 0.05, len - 1.6, 1.6, '#5dade2', { y: 0.7, collide: false, occlude: false, matOpts: { roughness: 0.2, metalness: 0.3 } });
      // windows
      for (let fy = 4; fy < h - 1; fy += 3.2) {
        L.box(face, cz, 0.04, len - 1.2, 1.2, '#34495e', { y: fy, collide: false, occlude: false, shadow: false });
      }
      z -= len;
    }
  };
  block(9.5, 28, -10, -38);
  block(9.5, 28, -52, -88);
  block(9.5, 28, -102, -150);
  block(-9.5, -28, 10, -38);
  block(-9.5, -28, -102, -125);
  block(-9.5, -28, -145, -150);

  // Apartment building (start)
  L.box(18.75, 0, 18.5, 19.6, 16, '#c8a27a');
  L.box(9.45, 0, 0.1, 1.6, 2.3, '#6d4c41', { collide: false });
  const aptSign = textPlane('Maple Court Apartments', { bg: '#5d4037', height: 0.6 });
  aptSign.position.set(9.4, 3.0, 0);
  aptSign.rotation.y = -Math.PI / 2;
  L.add(aptSign);
  L.box(8.3, 2.4, 0.8, 1.2, 1.05, '#7f8c8d'); // planter by entrance
  L.box(8.3, -2.4, 0.8, 1.2, 1.05, '#7f8c8d');

  // Workplace building (destination)
  L.box(-18.75, -135, 18.5, 19.6, 12, '#dfe4ea');
  L.box(-9.45, -135, 0.1, 2.2, 2.5, '#2f3640', { collide: false });
  const wSign = textPlane(workplaceName, { bg: '#273c75', height: 0.8 });
  wSign.position.set(-9.4, 3.5, -135);
  wSign.rotation.y = Math.PI / 2;
  L.add(wSign);

  // Park (west, between cross streets)
  L.floor(-18.5, -70, 19, 34, '#6ab04c', 0.006);
  L.floor(-18.5, -70, 2.5, 34, '#d6c7a1', 0.008);
  L.floor(-18.5, -70, 19, 2.5, '#d6c7a1', 0.008);
  const bush = (x, z, w = 1.6, d = 1.6) => {
    const m = L.box(x, z, w, d, 1.15, '#2d6a4f');
    m.geometry = new THREE.BoxGeometry(w, 1.15, d, 2, 2, 2);
  };
  const tree = (x, z) => {
    L.box(x, z, 0.35, 0.35, 2.2, '#6d4c41');
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), mat('#27ae60'));
    top.position.set(x, 3.2, z);
    top.castShadow = true;
    L.add(top);
  };
  for (const [x, z] of [
    [-12, -56], [-25, -56], [-12, -84], [-25, -84], [-14, -64], [-23, -76], [-21, -61], [-15, -79],
  ]) bush(x, z, 2 + rng() * 1.5, 1.4 + rng());
  for (const [x, z] of [[-11, -62], [-26, -68], [-12, -76], [-24, -86], [-26, -54]]) tree(x, z);
  for (const [x, z, r] of [[-16.5, -66, Math.PI / 2], [-20.5, -74, -Math.PI / 2]]) {
    L.box(x, z, 0.6, 1.8, 0.45, '#8d6e63', { rotY: 0 });
  }
  L.box(-9.6, -57.5, 0.3, 9, 0.6, '#7f8c8d', { occlude: false });
  L.box(-9.6, -82.5, 0.3, 11, 0.6, '#7f8c8d', { occlude: false });

  // Street furniture: cover opportunities
  const hedge = (x, z, len) => L.box(x, z, 0.9, len, 1.1, '#2d6a4f');
  hedge(8.4, -22, 4);
  hedge(8.4, -64, 3);
  hedge(8.4, -114, 4);
  hedge(-8.4, -24, 4);
  hedge(-8.4, -112, 3);
  hedge(-8.4, -128, 3);
  // trash cans, mailboxes, newspaper boxes
  for (const [x, z, c, h] of [
    [6, -30, '#2c3e50', 1.0], [-6, -15, '#2c3e50', 1.0], [6, -80, '#2980b9', 1.2], [-6, -105, '#c0392b', 1.1],
    [6, -130, '#2c3e50', 1.0], [-6, -140, '#27ae60', 1.15], [6, -12, '#c0392b', 1.1], [-6, -58, '#2c3e50', 1.0],
  ]) L.box(x, z, 0.7, 0.7, h, c);
  // Bus stop
  L.box(7.5, -72, 3.2, 1.2, 0.08, '#7f8c8d', { y: 2.4, collide: false, occlude: false });
  L.box(8.8, -72, 0.1, 1.2, 2.4, '#95a5a6', { collide: false, occlude: false });
  L.box(7.5, -72.6, 3.2, 0.06, 1.9, '#aed6f1', { y: 0.4, occlude: false, matOpts: { transparent: true, opacity: 0.35 } });
  L.box(7.8, -71.8, 2.2, 0.5, 0.45, '#8d6e63');
  // Street lights
  for (let z = 6; z > -150; z -= 18) {
    for (const x of [5.6, -5.6]) {
      L.box(x, z, 0.15, 0.15, 5, '#2d3436', { occlude: false });
      L.box(x + (x > 0 ? -0.5 : 0.5), z, 1.1, 0.25, 0.15, '#2d3436', { y: 5, collide: false, occlude: false });
    }
  }
  // End barriers
  for (const z of [11.2, -151.2]) {
    L.box(0, z, 60, 0.4, 1.0, '#e67e22');
    L.box(0, z, 60, 0.42, 0.2, '#ffffff', { y: 0.6, collide: false, occlude: false });
  }
  // Cross street ends
  for (const zc of [-45, -95]) {
    for (const x of [-29.8, 29.8]) L.box(x, zc, 0.4, 10, 1.0, '#e67e22');
  }

  // Cars
  const cars = [];
  const carColors = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2c3e50', '#16a085', '#8e44ad'];
  const mkCar = (axis, lane, dir, start, speed) => {
    const g = new THREE.Group();
    const col = carColors[Math.floor(rng() * carColors.length)];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.2), mat(col));
    body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), mat('#2c3e50'));
    cab.position.set(0, 1.25, -0.2);
    g.add(body, cab);
    for (const [wx, wz] of [[0.85, 1.3], [-0.85, 1.3], [0.85, -1.3], [-0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12), mat('#111111'));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.33, wz);
      g.add(w);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    L.add(g);
    const car = { g, axis, lane, dir, pos: start, speed, cur: speed };
    if (axis === 'z') {
      g.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    cars.push(car);
    return car;
  };
  for (let i = 0; i < 5; i++) mkCar('z', 2.5, -1, 10 - i * 34, 8 + rng() * 3);
  for (let i = 0; i < 5; i++) mkCar('z', -2.5, 1, -150 + i * 33, 8 + rng() * 3);
  mkCar('x', -46.5, 1, -25, 7);
  mkCar('x', -43.5, -1, 25, 7);
  mkCar('x', -96.5, 1, 0, 7);
  mkCar('x', -93.5, -1, 10, 7);
  L.cars = cars;
  L.updaters.push((dt, game) => {
    const blockers = game ? game.allBodies() : [];
    for (const c of cars) {
      // stop if someone is in front of the car
      let blocked = false;
      for (const b of blockers) {
        const along = c.axis === 'z' ? (b.z - c.pos) * c.dir : (b.x - c.pos) * c.dir;
        const side = c.axis === 'z' ? Math.abs(b.x - c.lane) : Math.abs(b.z - c.lane);
        if (along > 1.5 && along < 8 && side < 1.6) blocked = true;
      }
      const target = blocked ? 0 : c.speed;
      c.cur += (target - c.cur) * Math.min(1, dt * (blocked ? 5 : 1.2));
      c.pos += c.cur * c.dir * dt;
      if (c.axis === 'z') {
        if (c.dir < 0 && c.pos < -150) c.pos = 10;
        if (c.dir > 0 && c.pos > 10) c.pos = -150;
        c.g.position.set(c.lane, 0, c.pos);
      } else {
        if (c.dir > 0 && c.pos > 29) c.pos = -29;
        if (c.dir < 0 && c.pos < -29) c.pos = 29;
        c.g.position.set(c.pos, 0, c.lane);
      }
    }
  });

  // Doors
  L.interactable('homedoor', 8.6, 0, 'Enter your apartment', { r: 1.6 });
  L.interactable('workdoor', -8.6, -135, `Enter ${workplaceName}`, { r: 1.8 });
  L.spawnHome = { x: 7.8, z: 0, yaw: -Math.PI / 2 };
  L.spawnWork = { x: -7.8, z: -135, yaw: Math.PI / 2 };

  // Pedestrian routes
  const side = (x1, x2) => [
    { x: x1, z: 8 }, { x: x1, z: -38 }, { x: x1, z: -52 }, { x: x1, z: -88 }, { x: x1, z: -102 }, { x: x1, z: -148 },
    { x: x2, z: -148 }, { x: x2, z: -102 }, { x: x2, z: -88 }, { x: x2, z: -52 }, { x: x2, z: -38 }, { x: x2, z: 8 },
  ];
  L.pois.pedPaths = [
    side(7.9, 6.2),
    side(-7.9, -6.2),
    [{ x: -12, z: -70 }, { x: -18.5, z: -58 }, { x: -25, z: -70 }, { x: -18.5, z: -82 }],
    [{ x: -7, z: -60 }, { x: 7, z: -60 }],
    [{ x: 7, z: -120 }, { x: -7, z: -120 }],
    [{ x: 12, z: -39 }, { x: 27, z: -39 }],
  ];
  L.pois.idleSpots = [
    { x: 7.8, z: -71.8, yaw: -Math.PI / 2, sit: true },
    { x: -16.5, z: -66, yaw: Math.PI / 2, sit: true },
    { x: -20.5, z: -74, yaw: -Math.PI / 2, sit: true },
    { x: 6.5, z: -100.5, yaw: Math.PI },
    { x: -6.5, z: -39.5, yaw: 0 },
  ];
  L.spawn = L.spawnHome;
  return L;
}
