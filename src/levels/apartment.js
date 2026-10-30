import * as THREE from 'three';
import { Level } from '../level.js';

export function buildApartment() {
  const L = new Level('apartment');
  L.bounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5 };
  const wallC = '#efe6da';
  L.floor(0, 0, 12, 10, '#b08a64');
  L.floor(-3.75, -2, 4.5, 6, '#c9a27e', 0.008); // bedroom
  L.floor(4.25, -3, 3.5, 4, '#dfe6e9', 0.008); // bathroom tiles
  L.floor(1, 2.5, 3.5, 2.5, '#8e6f8e', 0.016); // rug
  // Outer walls
  L.wall(-6, -5, 6, -5, 2.6, wallC);
  L.wall(-6, -5, -6, 5, 2.6, wallC);
  L.wall(6, -5, 6, 5, 2.6, wallC);
  L.wall(-6, 5, -0.7, 5, 2.6, wallC);
  L.wall(0.7, 5, 6, 5, 2.6, wallC);
  // Front door
  L.box(0, 5.05, 1.4, 0.12, 2.2, '#6d4c41');
  L.box(0.5, 4.95, 0.08, 0.08, 0.08, '#f1c40f', { y: 1.05, collide: false });
  // Bedroom partition
  L.wall(-1.5, -5, -1.5, -1.2, 2.6, wallC);
  L.wall(-1.5, 0.3, -1.5, 5, 2.6, wallC);
  // Bathroom partition
  L.wall(2.5, -5, 2.5, -1, 2.6, wallC);
  L.wall(2.5, -1, 3.5, -1, 2.6, wallC);
  L.wall(4.6, -1, 6, -1, 2.6, wallC);

  // Bed
  L.box(-4.3, -3.6, 2.2, 2.6, 0.5, '#7f8fa6');
  L.box(-4.3, -3.95, 2.1, 1.9, 0.12, '#dcdde1', { y: 0.5, collide: false });
  L.box(-4.3, -4.7, 1.6, 0.4, 0.15, '#ffffff', { y: 0.55, collide: false });
  L.box(-4.3, -4.92, 2.2, 0.15, 1.0, '#5d4037');
  // Nightstand + lamp
  L.box(-2.6, -4.5, 0.6, 0.6, 0.55, '#8d6e63');
  const lamp = new THREE.PointLight(0xffe0b2, 2.5, 7);
  lamp.position.set(-2.6, 1.2, -4.5);
  L.add(lamp);
  // Wardrobe
  L.box(-5.6, 0.5, 0.8, 2.0, 2.1, '#8d6e63');
  L.box(-5.18, 0.5, 0.04, 0.04, 0.3, '#f1c40f', { y: 1.0, collide: false });
  // Bathroom
  L.box(5.5, -3.2, 0.7, 0.9, 0.85, '#ffffff'); // sink
  L.box(5.85, -3.2, 0.06, 0.7, 0.8, '#b2bec3', { y: 1.1, collide: false }); // mirror
  L.box(3.3, -4.3, 1.4, 1.2, 0.5, '#ffffff'); // tub
  L.box(5.4, -1.8, 0.6, 0.7, 0.45, '#ffffff'); // toilet
  // Kitchen
  L.box(5.55, 2.6, 0.8, 3.8, 0.95, '#636e72');
  L.box(5.55, 2.6, 0.84, 3.84, 0.05, '#dfe6e9', { y: 0.95, collide: false });
  L.box(5.5, 0.4, 0.9, 0.9, 1.9, '#dfe6e9'); // fridge
  L.box(3.6, 2.4, 1.0, 1.0, 0.75, '#a1887f'); // table
  L.chair(3.6, 3.2, Math.PI);
  // Living room
  L.sofa(0.8, 0.05, 2.6, 0, '#3d5a80');
  L.seat(0.8, 0.5, 0, 'sofa');
  // TV against the front wall, clear of the door
  L.box(2.2, 4.68, 1.8, 0.4, 0.5, '#2d3436'); // tv stand
  L.box(2.2, 4.73, 1.5, 0.08, 0.85, '#111111', { y: 0.5, collide: false });
  L.plant(-1.0, 4.4);

  // things you can grab and carry (out the door too)
  L.pickup('umbrella', -1.15, 3.0, 0.2);
  L.pickup('towel', 3.3, -4.3, 0.5);
  L.pickup('pillow', 0.2, 0.05, 0.75);
  L.pickup('newspaper', 1.5, 0.05, 0.75);
  L.pickup('bag', -4.6, 2.3, 0.02);

  L.interactable('bed', -3.0, -3.0, 'Sleep', { r: 1.6 });
  L.interactable('wardrobe', -4.8, 0.5, 'Wardrobe', { r: 1.3 });
  L.interactable('sink', 4.7, -3.2, 'Wash up at the sink', { r: 1.2 });
  L.interactable('kitchen', 4.6, 2.4, 'Eat breakfast', { r: 1.4 });
  L.interactable('door', 0, 4.3, 'Leave the apartment', { r: 1.2 });

  L.spawn = { x: -3.0, z: -2.6, yaw: Math.PI / 2 };
  L.doorSpawn = { x: 0, z: 3.8, yaw: Math.PI };
  L.pois.celesti = { x: 1.6, z: 2.0, yaw: -Math.PI * 0.75 };
  L.indoor = true;
  L.finalize();
  L.buildNav(0.6);
  return L;
}
