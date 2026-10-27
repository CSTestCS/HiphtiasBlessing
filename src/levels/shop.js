// Small shop interiors for day-off errands.
import { Level } from '../level.js';
import { PLACES } from '../data.js';

export function buildShop(kind) {
  const L = new Level('shop:' + kind);
  const P = PLACES[kind];
  const W = 26;
  const D = 20;
  L.bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 };
  L.floor(0, 0, W, D, kind === 'bank' ? '#c8b89a' : kind === 'laundromat' ? '#dfe6e9' : '#bdc3c7');
  L.wallX(-D / 2, -W / 2, W / 2, [], 3.2, '#f5f6fa');
  L.wallZ(-W / 2, -D / 2, D / 2, [], 3.2, '#f5f6fa');
  L.wallZ(W / 2, -D / 2, D / 2, [], 3.2, '#f5f6fa');
  L.wallX(D / 2, -W / 2, W / 2, [{ c: 0, w: 3 }], 3.2, '#f5f6fa');
  L.label(P.name, 0, 2.6, -D / 2 + 0.12, 0, { height: 0.5, bg: P.color });
  L.interactable('exit', 0, D / 2 - 0.7, 'Leave the shop', { r: 1.1 });
  L.spawn = { x: 0, z: D / 2 - 2.2, yaw: Math.PI };
  L.pois.entrance = { x: 0, z: D / 2 - 0.8 };
  L.pois.customerSpots = [];
  L.pois.clerks = [];
  L.pois.queue = [];
  L.pois.hideSpots = [];
  const S = (tag, x, z, yaw, label) => L.station(tag, x, z, yaw, label, kind);

  // counter / tellers at the back
  const counterZ = -D / 2 + 2.2;
  const nCounter = kind === 'bank' || kind === 'postoffice' ? 3 : kind === 'supermarket' ? 2 : 1;
  for (let i = 0; i < nCounter; i++) {
    const x = (i - (nCounter - 1) / 2) * 5;
    L.box(x, counterZ, 3, 0.8, 1.1, P.color);
    L.pois.clerks.push({ x, z: counterZ - 1, yaw: 0 });
    S('checkout', x, counterZ + 1.0, Math.PI, nCounter > 1 ? `counter ${i + 1}` : 'the counter');
  }
  // queue line with rope posts
  if (kind === 'bank' || kind === 'postoffice' || kind === 'pharmacy') {
    for (let i = 0; i < 6; i++) L.box(-2.2, counterZ + 2.2 + i * 1.0, 0.1, 0.1, 0.9, '#c0392b', { occlude: false });
    S('queue', -1.2, counterZ + 5, Math.PI, 'the line');
    for (let i = 0; i < 5; i++) L.pois.queue.push({ x: -1.2, z: counterZ + 2 + i * 0.9, yaw: Math.PI });
  }
  if (kind === 'laundromat') {
    for (let i = 0; i < 8; i++) L.box(-11 + i * 1.1, 0, 0.95, 0.9, 1.0, '#ecf0f1');
    S('washer', -7, 1.2, Math.PI, 'a washing machine');
    for (let i = 0; i < 6; i++) L.box(5 + i * 1.1, 0, 0.95, 0.9, 1.0, '#dfe6e9');
    L.box(0, 5, 4, 0.6, 0.45, '#8d6e63');
    S('bench', 0, 5.8, Math.PI, 'the waiting bench');
    for (let i = 0; i < 3; i++) L.pois.customerSpots.push({ x: -1.4 + i * 1.4, z: 5, yaw: Math.PI, sit: true });
    for (const x of [-9, -5, 7, 10]) L.pois.customerSpots.push({ x, z: 1.2, yaw: Math.PI });
  } else {
    // shelves
    const rows = kind === 'bank' ? 0 : kind === 'pharmacy' || kind === 'postoffice' ? 2 : 4;
    const colors = ['#0097e6', '#44bd32', '#e1b12c', '#8c7ae6'];
    for (let i = 0; i < rows; i++) {
      const x = -9 + i * (rows > 2 ? 5 : 14) + (rows > 2 ? 1.5 : 1);
      L.box(x, 1.5, 1.1, 7, kind === 'bookstore' ? 2.2 : 1.8, colors[i % 4]);
      S('shopshelf', x + 1.15, 1.5, -Math.PI / 2, `aisle ${i + 1}`);
      L.pois.customerSpots.push({ x: x - 1.2, z: 0.5 + (i % 2) * 2, yaw: Math.PI / 2 }, { x: x + 1.2, z: 3, yaw: -Math.PI / 2 });
    }
    if (kind === 'bank') {
      for (const x of [-9, 9]) {
        L.box(x, 3, 2, 1.2, 0.76, '#6d4c41');
        L.chair(x, 4.2, Math.PI);
        L.pois.customerSpots.push({ x, z: 4.2, yaw: Math.PI, sit: true });
      }
    }
  }
  // waiting chairs
  for (let i = 0; i < 4; i++) {
    L.chair(-11 + i * 0.8, 8.5, Math.PI);
    L.pois.customerSpots.push({ x: -11 + i * 0.8, z: 8.5, yaw: Math.PI, sit: true });
  }
  L.plant(11.5, 9);
  for (const sp of L.pois.customerSpots) if (sp.sit) L.seats.push(sp);
  // baskets by the door, an umbrella stand, a display stand (cover)
  L.box(-3, 8.6, 0.8, 0.6, 0.6, '#636e72');
  L.pickup(kind === 'supermarket' || kind === 'pharmacy' ? 'basket' : 'bag', -3, 8.6, 0.6);
  L.box(3, 9.2, 0.6, 0.6, 0.9, '#576574');
  L.pickup('umbrella', 3, 9.2, 0.2);
  L.box(8, 5.5, 1.4, 1.4, 1.5, P.color);
  L.hideSpot(-12.2, -6.5, 'corner');
  L.maxCustomers = 7;
  L.finalize();
  L.buildNav(0.7);
  return L;
}
