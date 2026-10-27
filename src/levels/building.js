// Inside Maple Court Apartments: your floor's hallway, the residents' pool
// (a back way in and out of the building) and the basement laundry room.
import * as THREE from 'three';
import { Level } from '../level.js';

const WALL = '#d9cbb8';

/** 7th floor hallway: elevator at the west end, back stairs (to the pool) at the east end. */
export function buildHallway() {
  const L = new Level('hallway');
  L.bounds = { minX: -13, maxX: 13, minZ: -3.5, maxZ: 2 };
  L.floor(0, 0, 26, 3.2, '#6d5d4b');
  L.floor(0, 0, 24, 1.2, '#8d6e63', 0.006); // runner rug
  L.wallX(-1.5, -12.5, 12.5, [{ c: -6, w: 1.6 }], 2.9, WALL);
  L.wallX(1.5, -12.5, 12.5, [], 2.9, WALL);
  L.wallZ(-12.5, -1.5, 1.5, [], 2.9, WALL);
  L.wallZ(12.5, -1.5, 1.5, [], 2.9, WALL);
  // trash-chute nook: somewhere to duck into
  L.floor(-6, -2.2, 1.6, 1.4, '#5d4f40', 0.004);
  L.wallX(-2.95, -6.9, -5.1, [], 2.9, WALL);
  L.wallZ(-6.85, -2.9, -1.5, [], 2.9, WALL);
  L.wallZ(-5.15, -2.9, -1.5, [], 2.9, WALL);
  L.box(-6, -2.6, 0.7, 0.5, 1.2, '#7f8c8d');
  L.label('TRASH', -6, 2.2, -2.82, 0, { height: 0.18, bg: '#2d3436' });
  L.hideSpot(-6, -2.2, 'the trash nook');
  // apartment doors on both sides
  const doors = [-9, -3, 2, 7, 10.5];
  doors.forEach((x, i) => {
    L.box(x, -1.43, 1.0, 0.06, 2.1, '#4e342e', { collide: false, occlude: false });
    L.box(x, 1.43, 1.0, 0.06, 2.1, '#4e342e', { collide: false, occlude: false });
    L.label(`7F-0${i * 2 + 1}`, x, 2.3, -1.38, 0, { height: 0.14, bg: '#3e2723' });
    L.label(`7F-0${i * 2 + 2}`, x, 2.3, 1.38, Math.PI, { height: 0.14, bg: '#3e2723' });
  });
  L.interactable('aptdoor', 2, -0.9, 'Your apartment (7F-05)', { r: 1.2 });
  L.label('HOME', 2, 2.55, -1.36, 0, { height: 0.16, bg: '#00b894' });
  L.pois.neighborDoor = { x: 2, z: 1.0, yaw: Math.PI };
  // elevator (west) and stairs (east)
  L.box(-12.42, 0, 0.1, 1.6, 2.3, '#b2bec3', { collide: false, occlude: false });
  L.label('ELEVATOR', -12.36, 2.55, 0, Math.PI / 2, { height: 0.2, bg: '#2d3436' });
  L.interactable('elevator', -11.6, 0, 'Elevator', { r: 1.3 });
  L.box(12.42, 0, 0.1, 1.2, 2.1, '#795548', { collide: false, occlude: false });
  L.label('STAIRS · POOL', 12.36, 2.4, 0, -Math.PI / 2, { height: 0.18, bg: '#1e3799' });
  L.interactable('stairs', 11.6, 0, 'Back stairs (to the residents\' pool)', { r: 1.3 });
  // furniture: shoe racks, plants, umbrella stand, a bench by the window
  L.box(-9.9, -1.25, 0.9, 0.3, 0.8, '#6d4c41');
  L.box(5.3, 1.25, 0.9, 0.3, 0.8, '#6d4c41');
  L.plant(-11.7, -1.0, 1.1);
  L.plant(11.7, 1.0, 1.1);
  L.box(8.8, -1.2, 0.4, 0.4, 0.7, '#576574');
  L.pickup('umbrella', 8.8, -1.2, 0.2);
  L.box(-1, 1.25, 1.4, 0.4, 0.45, '#8d6e63', { occlude: false });
  L.seat(-1, 1.0, Math.PI, 'hallway bench');
  L.pickup('newspaper', 4.2, -1.2, 0.02);
  L.spawnFromElevator = { x: -10.8, z: 0, yaw: Math.PI / 2 };
  L.spawnFromStairs = { x: 10.8, z: 0, yaw: -Math.PI / 2 };
  L.spawnFromApt = { x: 2, z: -0.4, yaw: -Math.PI / 2 };
  L.spawn = L.spawnFromApt;
  L.pois.hideSpots = L.pois.hideSpots || [];
  L.pois.customerSpots = [];
  L.pois.entrance = { x: -11.2, z: 0 };
  L.indoor = true;
  L.finalize();
  L.buildNav(0.5);
  return L;
}

/** Residents' pool courtyard behind the building. Open-air, so the rain gets in. */
export function buildPool() {
  const L = new Level('pool');
  L.bounds = { minX: -16, maxX: 16, minZ: -12, maxZ: 12 };
  L.floor(0, 0, 32, 24, '#9e9e9e');
  L.floor(0, 0, 30, 22, '#bdb3a4', 0.004);
  // building wall (north) with the back door, fence on the other sides
  L.wallX(-11.2, -15.5, 15.5, [{ c: 0, w: 1.6 }], 4.5, '#8d7b68');
  L.wallX(11.2, -15.5, 15.5, [{ c: 0, w: 2 }], 2.2, '#5d6d7e');
  L.wallZ(-15.5, -11.2, 11.2, [], 2.2, '#5d6d7e');
  L.wallZ(15.5, -11.2, 11.2, [], 2.2, '#5d6d7e');
  L.label('RESIDENTS\' POOL AREA', 2.4, 1.9, 11.05, Math.PI, { height: 0.28, bg: '#1e3799' });
  L.label('POOL RULES: no running · keep gate closed', -3, 2.4, -11.05, 0, { height: 0.22, bg: '#2d3436' });
  L.interactable('backstairs', 0, -10.3, 'Back stairs up to the 7th floor', { r: 1.3 });
  L.interactable('poolgate', 0, 10.3, 'Gate out to the street', { r: 1.4 });
  // the pool (you can't walk into it)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: '#1e90ff', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85, depthWrite: false }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, -1);
  L.add(water);
  L.box(0, -1, 14.4, 6.4, 0.08, '#ecf0f1', { occlude: false });
  // loungers (seats), hedges and a changing hut (cover), towels and an umbrella
  for (const x of [-9, -6, -3, 3, 6, 9]) {
    L.box(x, 5.2, 0.7, 1.8, 0.35, '#f5f6fa', { occlude: false });
    L.seat(x, 4.9, Math.PI, 'pool lounger');
  }
  for (const z of [-6, 0, 6]) {
    L.box(-14.2, z, 1.2, 3.2, 1.3, '#2d6a4f');
    L.box(14.2, z, 1.2, 3.2, 1.3, '#2d6a4f');
  }
  L.box(11.8, -8.2, 3.2, 3, 2.5, '#d7ccc8');
  L.label('CHANGING ROOM', 11.8, 2.2, -6.68, Math.PI, { height: 0.18, bg: '#6d4c41' });
  L.hideSpot(11.8, -6.2, 'the changing room');
  L.box(-11.5, -8.8, 1.6, 0.6, 1.0, '#a1887f');
  L.pickup('towel', -11.9, -8.8, 1.0);
  L.pickup('towel', -11.1, -8.8, 1.0);
  L.pickup('towel', 7.5, 5.2, 0.35);
  L.box(-12.8, 8.8, 0.4, 0.4, 0.7, '#576574');
  L.pickup('umbrella', -12.8, 8.8, 0.2);
  for (const x of [-7, 7]) {
    L.box(x, -9.8, 0.15, 0.15, 2.2, '#b2bec3', { occlude: false });
    L.interactable('shower' + x, x, -9.3, 'Shower', { r: 0.9 });
  }
  L.plant(-4, 9.8, 1.2);
  L.plant(4, 9.8, 1.2);
  L.spawnFromStairs = { x: 0, z: -9.4, yaw: 0 };
  L.spawnFromGate = { x: 0, z: 9.4, yaw: Math.PI };
  L.spawn = L.spawnFromGate;
  L.pois.customerSpots = [
    { x: -6, z: 4.9, yaw: Math.PI, sit: true },
    { x: 6, z: 4.9, yaw: Math.PI, sit: true },
    { x: -8, z: 2.8, yaw: Math.PI },
  ];
  L.pois.entrance = { x: 0, z: 10 };
  L.indoor = false;
  L.finalize();
  L.buildNav(0.6);
  return L;
}

/** Basement laundry room. */
export function buildLaundry() {
  const L = new Level('laundry');
  L.bounds = { minX: -8, maxX: 8, minZ: -6, maxZ: 6 };
  L.floor(0, 0, 16, 12, '#a4a4a4');
  L.wallX(-5.5, -7.5, 7.5, [], 2.8, '#b8b5a8');
  L.wallX(5.5, -7.5, 7.5, [], 2.8, '#b8b5a8');
  L.wallZ(-7.5, -5.5, 5.5, [], 2.8, '#b8b5a8');
  L.wallZ(7.5, -5.5, 5.5, [], 2.8, '#b8b5a8');
  L.label('PLEASE KEEP THIS AREA CLEAN', 2.5, 2.1, -5.38, 0, { height: 0.22, bg: '#1e3799' });
  L.box(-7.42, 0, 0.1, 1.6, 2.3, '#b2bec3', { collide: false, occlude: false });
  L.label('ELEVATOR', -7.36, 2.5, 0, Math.PI / 2, { height: 0.2, bg: '#2d3436' });
  L.interactable('elevator', -6.6, 0, 'Elevator', { r: 1.3 });
  // washers (north wall) and dryers (east wall)
  for (let i = 0; i < 5; i++) {
    const x = -3.5 + i * 1.3;
    L.box(x, -4.9, 1.0, 0.9, 1.0, '#ecf0f1');
    L.interactable('washer' + i, x, -4.1, `Washer ${i + 1}`, { r: 0.8 });
  }
  for (let i = 0; i < 4; i++) {
    const z = -3.5 + i * 1.3;
    L.box(6.9, z, 0.9, 1.0, 1.9, '#dfe6e9');
    L.interactable('dryer' + i, 6.1, z, `Dryer ${i + 1}`, { r: 0.8 });
  }
  // shelves, baskets, folding table, a bench
  L.box(-2, 5.0, 5, 0.6, 2.0, '#8d6e63');
  L.pickup('towel', -3.4, 5.0, 1.1);
  L.pickup('laundry', -1.0, 5.0, 0.5);
  L.box(0.5, 0.3, 2.4, 1.0, 0.85, '#a1887f');
  L.box(3.9, 4.6, 1.8, 0.5, 0.45, '#6d4c41', { occlude: false });
  L.seat(3.9, 4.3, Math.PI, 'bench');
  L.box(5.6, 4.6, 0.8, 0.8, 0.9, '#7f8c8d'); // laundry cart
  L.box(-5.2, 4.4, 0.8, 0.8, 0.9, '#7f8c8d');
  L.hideSpot(6.6, 4.4, 'behind the laundry cart');
  L.hideSpot(-6.4, -4.6, 'the corner by the washers');
  L.spawnFromElevator = { x: -5.8, z: 0, yaw: Math.PI / 2 };
  L.spawn = L.spawnFromElevator;
  L.pois.customerSpots = [];
  L.pois.entrance = { x: -6.4, z: 0 };
  L.indoor = true;
  L.finalize();
  L.buildNav(0.5);
  return L;
}
