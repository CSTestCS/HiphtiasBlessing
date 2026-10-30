// The lobby of your apartment building, between your apartment and the street.
// Each complex has its own name sign and colors.
import { Level } from '../level.js';

export function buildLobby(apt = null) {
  const L = new Level('lobby');
  L.bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };
  const W = apt?.lobbyWall || '#e3d5c3';
  L.floor(0, 0, 18, 14, apt?.lobbyFloor || '#8d6e63');
  if (apt) L.label(apt.name.toUpperCase(), 0, 2.85, -6.88, 0, { height: 0.42, bg: apt.color });
  L.floor(0, 1, 6, 8, '#a1887f', 0.006);
  L.wallX(-7, -9, 9, [{ c: -5, w: 2.2 }, { c: 5, w: 2.2 }], 3.4, W);
  L.wallZ(-9, -7, 7, [], 3.4, W);
  L.wallZ(9, -7, 7, [], 3.4, W);
  L.wallX(7, -9, 9, [{ c: 0, w: 2.6 }], 3.4, W);
  L.box(0, 7.05, 2.6, 0.08, 2.6, '#aed6f1', { occlude: false, static: false, matOpts: { transparent: true, opacity: 0.25 } });
  // elevators (north wall)
  for (const x of [-5, 5]) {
    L.box(x, -7.15, 2.2, 0.1, 2.5, '#b2bec3', { collide: true });
    L.label('ELEVATOR', x, 2.8, -6.88, 0, { height: 0.24, bg: '#2d3436' });
  }
  L.interactable('elevator', -5, -6.2, 'Take the elevator up to your apartment', { r: 1.4 });
  L.interactable('elevator2', 5, -6.2, 'Take the elevator up to your apartment', { r: 1.4 });
  L.interactable('lobbydoor', 0, 6.2, 'Go out to the street', { r: 1.3 });
  // mailboxes (west wall)
  L.box(-8.6, -1.5, 0.5, 3.2, 1.7, '#7f8c8d');
  L.interactable('mailbox', -7.9, -1.5, 'Check your mailbox', { r: 1.1 });
  // front desk with the doorman
  L.box(5.5, 2.5, 3, 0.9, 1.1, '#5d4037');
  L.pois.clerks = [{ x: 5.5, z: 1.6, yaw: Math.PI }];
  // sofas and plants (cover), seats
  L.sofa(-5.5, 3.45, 2.6, 0, '#3d5a80');
  L.seat(-5.5, 3.3, 0, 'lobby sofa');
  L.seat(-6.3, 3.3, 0, 'lobby sofa');
  L.box(-5.5, 5.2, 1.4, 0.8, 0.45, '#6d4c41', { occlude: false });
  L.pickup('newspaper', -5.5, 5.2, 0.45);
  L.plant(-8.2, 6.2, 1.3);
  L.plant(8.2, 6.2, 1.3);
  L.plant(8.2, -6.2, 1.3);
  L.box(0, -2, 1.0, 1.0, 1.3, '#2d6a4f'); // central planter
  L.box(7.9, 5.5, 0.6, 0.6, 0.9, '#576574'); // umbrella stand
  L.pickup('umbrella', 7.9, 5.5, 0.2);
  L.pois.customerSpots = [
    { x: -5.5, z: 3.3, yaw: 0, sit: true },
    { x: -7.9, z: -1.5, yaw: -Math.PI / 2 },
    { x: 3, z: -5.5, yaw: Math.PI },
    { x: -3, z: -5.5, yaw: Math.PI },
  ];
  L.pois.entrance = { x: 0, z: 6.4 };
  L.pois.hideSpots = [];
  L.hideSpot(8.2, -4.6, 'behind the plant');
  L.spawnFromHome = { x: -5, z: -5.4, yaw: 0 };
  L.spawnFromStreet = { x: 0, z: 5.4, yaw: Math.PI };
  L.spawn = L.spawnFromHome;
  L.maxCustomers = 3;
  L.finalize();
  L.buildNav(0.6);
  return L;
}
