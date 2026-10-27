import * as THREE from 'three';
import { Level, mat } from '../level.js';

function common(L, w, d, wallC, floorC) {
  L.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
  L.floor(0, 0, w, d, floorC);
  L.wall(-w / 2, -d / 2, w / 2, -d / 2, 3, wallC);
  L.wall(-w / 2, -d / 2, -w / 2, d / 2, 3, wallC);
  L.wall(w / 2, -d / 2, w / 2, d / 2, 3, wallC);
  L.wall(-w / 2, d / 2, -1.2, d / 2, 3, wallC);
  L.wall(1.2, d / 2, w / 2, d / 2, 3, wallC);
  // glass entrance doors (visual)
  L.box(0, d / 2 + 0.05, 2.4, 0.08, 2.4, '#aed6f1', { collide: true, occlude: false, matOpts: { transparent: true, opacity: 0.35 } });
  L.interactable('exit', 0, d / 2 - 0.7, 'Leave work', { r: 1.0 });
  L.spawn = { x: 0, z: d / 2 - 2.4, yaw: Math.PI };
  L.pois.entrance = { x: 0, z: d / 2 - 0.8 };
  L.indoor = true;
}

function timeClock(L, x, z, rotY) {
  L.box(x, z, 0.5, 0.25, 0.6, '#2d3436', { y: 1.1, collide: false, rotY });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ color: 0x55efc4 }));
  scr.position.set(x + Math.sin(rotY) * 0.13, 1.5, z + Math.cos(rotY) * 0.13);
  scr.rotation.y = rotY;
  L.add(scr);
  L.label('TIME CLOCK', x + Math.sin(rotY) * 0.13, 1.95, z + Math.cos(rotY) * 0.13, rotY, { height: 0.22, bg: '#c0392b' });
  L.interactable('timeclock', x + Math.sin(rotY) * 0.8, z + Math.cos(rotY) * 0.8, 'Time clock', { r: 1.2 });
}

function lockers(L, x, z, n, alongX, rotY) {
  for (let i = 0; i < n; i++) {
    const px = alongX ? x + i * 0.6 : x;
    const pz = alongX ? z : z + i * 0.6;
    L.box(px, pz, alongX ? 0.56 : 0.5, alongX ? 0.5 : 0.56, 1.9, i % 2 ? '#74b9ff' : '#0984e3');
  }
}

// ---------------------------------------------------------------------------
export function buildOffice({ coworkers = [] } = {}) {
  const L = new Level('office');
  common(L, 26, 20, '#f5f6fa', '#95a5a6');
  L.floor(0, 7, 8, 5, '#7f8c8d');
  // Reception
  L.box(0, 5.2, 4.2, 0.8, 1.1, '#e1b382');
  L.box(-2.3, 4.6, 0.8, 2.0, 1.1, '#e1b382');
  L.label('RECEPTION', 0, 1.7, 5.62, 0, { height: 0.3, bg: '#273c75' });
  L.interactable('inbox', 0, 6.2, 'Reception inbox', { r: 1.2 });
  // waiting chairs
  for (let i = 0; i < 3; i++) L.chair(-9 + i * 0.8, 8.5, Math.PI);
  L.plant(-11.8, 9);
  L.plant(11.8, 9);
  // Time clock & lockers (east entrance area)
  timeClock(L, 12.85, 6.5, -Math.PI / 2);
  lockers(L, 12.7, 2.5, 4, false);

  // Cubicles: 2 rows of 4
  const desks = [];
  const cub = (cx, cz, openSouth) => {
    const pc = '#a29bfe';
    const backZ = openSouth ? cz - 1.2 : cz + 1.2;
    L.box(cx, backZ, 3.2, 0.1, 1.35, pc);
    L.box(cx - 1.6, cz + (openSouth ? -0.45 : 0.45), 0.1, 1.5, 1.35, pc);
    L.box(cx + 1.6, cz + (openSouth ? -0.45 : 0.45), 0.1, 1.5, 1.35, pc);
    const deskZ = openSouth ? cz - 0.8 : cz + 0.8;
    L.box(cx, deskZ, 2.4, 0.7, 0.75, '#dfe6e9');
    L.box(cx, deskZ, 0.6, 0.08, 0.4, '#2d3436', { y: 0.75, collide: false });
    L.chair(cx, cz + (openSouth ? 0 : 0), openSouth ? Math.PI : 0, '#2d3436');
    desks.push({ x: cx, z: cz + (openSouth ? 0.4 : -0.4), yaw: openSouth ? Math.PI : 0, labelZ: backZ + (openSouth ? 0.06 : -0.06) });
  };
  for (const x of [-7.5, -2.5, 2.5, 7.5]) cub(x, 1.6, true);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) cub(x, -3.4, false);
  // Assign: desk 0 = player, 1.. = coworkers
  L.interactable('mydesk', desks[0].x, desks[0].z + 0.4, 'Your desk', { r: 1.2 });
  L.label('YOU', desks[0].x, 1.5, desks[0].labelZ, 0, { height: 0.22, bg: '#00b894' });
  L.taskOptions = { desk: [], cab: ['A', 'B', 'C'] };
  coworkers.forEach((c, i) => {
    const d = desks[i + 1];
    if (!d) return;
    const id = 'desk:' + i;
    L.interactable(id, d.x, d.z + (d.yaw === 0 ? -0.4 : 0.4), `${c.name}'s desk`, { r: 1.2 });
    L.label(c.name.toUpperCase(), d.x, 1.5, d.labelZ, d.yaw === 0 ? Math.PI : 0, { height: 0.22, bg: '#6c5ce7' });
    L.taskOptions.desk.push({ id: i, name: c.name });
  });
  // Printer & copier (west wall)
  L.box(-12.4, 3.5, 0.9, 1.1, 1.05, '#ecf0f1');
  L.label('PRINTER', -11.9, 1.5, 3.5, Math.PI / 2, { height: 0.2 });
  L.interactable('printer', -11.3, 3.5, 'Printer', { r: 1.2 });
  L.box(-12.3, -0.5, 1.1, 1.3, 1.15, '#bdc3c7');
  L.label('COPIER', -11.7, 1.6, -0.5, Math.PI / 2, { height: 0.2 });
  L.interactable('copier', -11.2, -0.5, 'Copier', { r: 1.2 });
  // Filing cabinets (north wall)
  ['A', 'B', 'C'].forEach((c, i) => {
    const x = -3 + i * 2.2;
    L.box(x, -9.5, 1.0, 0.7, 1.35, '#636e72');
    L.label('CABINET ' + c, x, 1.55, -9.13, 0, { height: 0.2 });
    L.interactable('cabinet' + c, x, -8.6, 'Cabinet ' + c, { r: 1.1 });
  });
  // Break room (north-west)
  L.wall(-13, -6, -7.5, -6, 3, '#dcdde1');
  L.wall(-5.4, -10, -5.4, -7.6, 3, '#dcdde1');
  L.wall(-5.4, -6, -5.6, -6, 3, '#dcdde1');
  L.floor(-9.2, -8, 7.6, 4, '#ffeaa7');
  L.box(-12.4, -8.5, 0.9, 2.5, 0.95, '#b2bec3');
  L.box(-9, -8, 1.2, 1.2, 0.75, '#fab1a0');
  L.label('BREAK ROOM', -9.5, 2.2, -5.88, 0, { height: 0.3 });
  L.box(-6.2, -9.5, 1.2, 0.6, 1.8, '#81ecec'); // supply shelf
  L.interactable('supply', -6.2, -8.7, 'Supply closet', { r: 1.1 });
  L.pois.hide = { x: -10.5, z: -9.2 };
  // Manager office (north-east)
  L.wall(6, -10, 6, -7.2, 3, '#dcdde1');
  L.wall(6, -5.8, 6, -6, 3, '#dcdde1');
  L.wall(6, -6, 13, -6, 3, '#dcdde1');
  L.box(9.5, -8.4, 2.4, 1.0, 0.78, '#6d4c41');
  L.label('MANAGER', 9.5, 2.2, -5.88, 0, { height: 0.3, bg: '#c0392b' });
  L.plant(5, 9);
  L.interactable('plant', 5, 8.1, 'Office plant', { r: 1.2 });
  L.box(-12.7, -3.5, 0.5, 1.8, 1.0, '#00cec9'); // water cooler-ish

  L.pois.stations = desks.slice(1).map((d) => ({ x: d.x, z: d.z, yaw: d.yaw }));
  L.pois.stations[2] = { x: 0, z: 4.3, yaw: 0 }; // receptionist slot stays at reception
  L.pois.wander = [
    { x: -11, z: 3.5 }, { x: -11, z: -0.5 }, { x: -9, z: -8 }, { x: 9.5, z: -7.5 }, { x: 0, z: -8.6 },
    { x: 0, z: -0.8 }, { x: -6, z: -0.8 }, { x: 6, z: -0.8 }, { x: 11, z: 4 }, { x: 0, z: 7.5 }, { x: 9, z: 6 },
  ];
  L.pois.customerSpots = [
    { x: -9, z: 8.0, yaw: Math.PI, sit: true },
    { x: -8.2, z: 8.0, yaw: Math.PI, sit: true },
    { x: 0, z: 6.6, yaw: Math.PI },
    { x: 9.5, z: -7.3, yaw: Math.PI },
    { x: 0, z: -6.2, yaw: 0 },
  ];
  L.maxCustomers = 2;
  L.buildNav(0.8);
  return L;
}

// ---------------------------------------------------------------------------
export function buildRestaurant() {
  const L = new Level('restaurant');
  common(L, 26, 20, '#f8efba', '#a0522d');
  L.floor(0, 2, 26, 12, '#c0392b');
  L.floor(0, 2, 25.6, 11.6, '#8e5b3a');
  // Host stand
  L.box(-2.2, 7.4, 1.2, 0.7, 1.15, '#4b2c20');
  L.label('HOST', -2.2, 1.45, 7.77, 0, { height: 0.2, bg: '#4b2c20' });
  L.interactable('host', -2.2, 6.5, 'Host stand', { r: 1.1 });

  // Tables 1..6
  const tables = [];
  let n = 1;
  for (const z of [-0.5, 4.2]) {
    for (const x of [-7.5, -1.2, 5.5]) {
      L.box(x, z, 1.4, 1.4, 0.76, '#ecf0f1');
      L.label(String(n), x, 0.9, z, 0, { height: 0.25, bg: '#2d3436' });
      L.chair(x, z - 1.0, 0);
      L.chair(x, z + 1.0, Math.PI);
      L.chair(x - 1.0, z, Math.PI / 2);
      L.chair(x + 1.0, z, -Math.PI / 2);
      tables.push({ n, x, z });
      L.interactable('table' + n, x + 0.0, z + (z < 2 ? 1.6 : -1.6), 'Table ' + n, { r: 1.1 });
      n++;
    }
  }
  // Booths along west wall with high backs
  for (const z of [-1, 3.5]) {
    L.box(-12.3, z, 0.8, 2.6, 1.3, '#6d214f');
  }
  L.taskOptions = { table: [1, 2, 3, 4, 5, 6] };

  // Kitchen (north)
  L.wall(-13, -4.6, -6.3, -4.6, 3, '#dfe6e9');
  L.box(-1.75, -4.6, 6.5, 0.7, 1.1, '#b2bec3'); // pass counter
  L.box(-1.75, -4.6, 6.5, 0.75, 0.05, '#ecf0f1', { y: 1.1, collide: false });
  L.wall(1.5, -4.6, 5.5, -4.6, 3, '#dfe6e9');
  L.label('KITCHEN', -1.75, 2.4, -4.2, 0, { height: 0.35, bg: '#e17055' });
  L.floor(-4, -7.3, 18, 5.4, '#dfe6e9');
  L.box(-8, -9.4, 4, 0.9, 0.95, '#636e72'); // stove
  L.box(-2, -9.4, 4, 0.9, 0.95, '#b2bec3');
  L.box(-4.5, -7.2, 3, 1.0, 0.95, '#b2bec3'); // prep island
  L.interactable('pass', -1.75, -3.6, 'Kitchen pass', { r: 1.3 });
  L.box(1.0, -4.6, 0.5, 0.4, 0.4, '#2d3436', { y: 1.1, collide: false });
  L.interactable('terminal', 1.0, -3.6, 'Order terminal', { r: 1.0 });
  // Dish station / soda fountain
  L.box(-9.5, -4.0, 1.6, 0.8, 1.0, '#7f8c8d');
  L.label('DISHES', -9.5, 1.3, -3.58, 0, { height: 0.18 });
  L.interactable('dish', -9.5, -3.0, 'Dish station', { r: 1.1 });
  L.box(8.5, -4.0, 2.4, 0.8, 1.1, '#2d3436');
  L.label('DRINKS', 8.5, 1.4, -3.58, 0, { height: 0.18 });
  L.interactable('soda', 8.5, -3.0, 'Soda fountain', { r: 1.2 });
  // Staff room (north-east): time clock, lockers, hide spot
  L.wall(5.5, -4.6, 5.5, -10, 3, '#dfe6e9');
  L.wall(10.5, -4.6, 13, -4.6, 3, '#dfe6e9');
  L.label('STAFF ONLY', 9.3, 2.3, -4.48, 0, { height: 0.25, bg: '#2d3436' });
  L.floor(9.25, -7.3, 7.5, 5.4, '#bdc3c7');
  timeClock(L, 12.85, -7.0, -Math.PI / 2);
  lockers(L, 6.3, -9.6, 5, true);
  L.pois.hide = { x: 8.5, z: -8.4 };
  L.plant(-12, 8.8);
  L.plant(12, 8.8);

  L.pois.stations = [
    { x: 2, z: 1.8, yaw: 0 },
    { x: -5, z: -8.3, yaw: Math.PI },
    { x: -2.2, z: 8.1, yaw: Math.PI },
    { x: -9.5, z: -5.3, yaw: 0 },
  ];
  L.pois.wander = [
    { x: -9.5, z: -3.0 }, { x: 8.5, z: -3.0 }, { x: -2.5, z: -3.5 }, { x: 2, z: 1.8 }, { x: -4.3, z: 1.8 },
    { x: 8.8, z: 1.8 }, { x: -4.3, z: 6.5 }, { x: 2, z: 6.5 }, { x: -6, z: -7.5 }, { x: 0, z: -7.5 },
  ];
  const spots = [];
  for (const t of tables) {
    spots.push({ x: t.x, z: t.z - 1.0, yaw: 0, sit: true });
    spots.push({ x: t.x, z: t.z + 1.0, yaw: Math.PI, sit: true });
    spots.push({ x: t.x - 1.0, z: t.z, yaw: Math.PI / 2, sit: true });
    spots.push({ x: t.x + 1.0, z: t.z, yaw: -Math.PI / 2, sit: true });
  }
  L.pois.customerSpots = spots;
  L.maxCustomers = 7;
  L.buildNav(0.7);
  return L;
}

// ---------------------------------------------------------------------------
export function buildRetail() {
  const L = new Level('retail');
  common(L, 28, 22, '#ffffff', '#dfe6e9');
  L.floor(0, 9, 28, 4, '#b2bec3');
  // Checkout counters
  for (const [x, id] of [[-7, 'register'], [-3.5, null]]) {
    L.box(x, 6.0, 2.4, 0.9, 1.05, '#e84118');
    L.box(x + 0.6, 6.0, 0.4, 0.3, 0.35, '#2d3436', { y: 1.05, collide: false });
    if (id) {
      L.interactable(id, x, 5.0, 'Register', { r: 1.1 });
      L.label('CHECKOUT 1', x, 2.2, 6.0, 0, { height: 0.3, bg: '#e84118' });
    } else {
      L.label('CHECKOUT 2', x, 2.2, 6.0, 0, { height: 0.3, bg: '#e84118' });
    }
  }
  // Display table
  L.box(6.5, 6.5, 2.4, 1.4, 0.8, '#fbc531');
  L.interactable('display', 6.5, 5.3, 'Display table', { r: 1.3 });
  // Aisles: 4 tall shelves
  const shelfX = [-9, -3.5, 2, 7.5];
  shelfX.forEach((x, i) => {
    const colors = ['#0097e6', '#44bd32', '#8c7ae6', '#e1b12c'];
    L.box(x, -1.5, 1.2, 9, 1.95, colors[i]);
    for (let s = 0; s < 4; s++) L.box(x, -1.5, 1.3, 9.05, 0.05, '#f5f6fa', { y: 0.35 + s * 0.45, collide: false, occlude: false, shadow: false });
    L.label('AISLE ' + (i + 1), x, 2.35, 3.0, 0, { height: 0.3, bg: colors[i] });
    L.interactable('shelf' + (i + 1), x + 1.25, -1.5, 'Aisle ' + (i + 1), { r: 1.4 });
  });
  L.taskOptions = { shelf: [1, 2, 3, 4] };
  // Stockroom (north)
  L.wall(-14, -7.5, -1.5, -7.5, 3, '#dcdde1');
  L.wall(1.5, -7.5, 14, -7.5, 3, '#dcdde1');
  L.label('STAFF ONLY', 0, 2.6, -7.38, 0, { height: 0.25, bg: '#2d3436' });
  L.floor(0, -9.25, 28, 3.5, '#a4b0be');
  for (let i = 0; i < 5; i++) L.box(-10 + i * 1.1, -10.2, 1.0, 1.0, 0.6 + (i % 2) * 0.5, '#c8a27a');
  L.box(5, -10.2, 3, 1.0, 1.9, '#636e72');
  L.interactable('stock', -7.8, -9.1, 'Stockroom boxes', { r: 1.4 });
  timeClock(L, 13.85, -9.2, -Math.PI / 2);
  // Fitting rooms (east wall) - hiding spot
  L.wall(11, 0, 14, 0, 2.4, '#fab1a0');
  L.wall(11, -3, 14, -3, 2.4, '#fab1a0');
  L.wall(11, -6, 14, -6, 2.4, '#fab1a0');
  L.label('FITTING ROOMS', 12.5, 2.6, 0.12, 0, { height: 0.25, bg: '#e84393' });
  L.pois.hide = { x: 12.8, z: -1.5 };
  L.plant(-13, 10);
  L.plant(13, 10);

  L.pois.stations = [
    { x: 4.7, z: 1.5, yaw: Math.PI },
    { x: 8, z: -9, yaw: 0 },
    { x: -3.5, z: 5.0, yaw: Math.PI },
    { x: -4, z: -9.2, yaw: Math.PI },
  ];
  L.pois.wander = [
    { x: -6.2, z: -1.5 }, { x: -0.7, z: -1.5 }, { x: 4.7, z: -1.5 }, { x: 10, z: -1.5 }, { x: -12, z: -1.5 },
    { x: 0, z: 4.5 }, { x: 6.5, z: 4.5 }, { x: -6, z: -9 }, { x: 4, z: -9 }, { x: 10, z: 7 },
  ];
  L.pois.customerSpots = [
    { x: -6.2, z: -4, yaw: -Math.PI / 2 }, { x: -6.2, z: 1, yaw: Math.PI / 2 }, { x: -0.7, z: -3, yaw: -Math.PI / 2 },
    { x: -0.7, z: 0.5, yaw: Math.PI / 2 }, { x: 4.7, z: -4.5, yaw: Math.PI / 2 }, { x: 4.7, z: 0, yaw: -Math.PI / 2 },
    { x: 10, z: -1, yaw: -Math.PI / 2 }, { x: -12, z: -3, yaw: Math.PI / 2 }, { x: 6.5, z: 7.8, yaw: Math.PI },
    { x: -7, z: 7.2, yaw: Math.PI }, { x: -3.5, z: 7.2, yaw: Math.PI },
  ];
  L.maxCustomers = 5;
  L.buildNav(0.8);
  return L;
}
