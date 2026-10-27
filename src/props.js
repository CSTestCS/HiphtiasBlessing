// Carryable props: shown in characters' hands and as pickups lying around.
import * as THREE from 'three';

export const PICKUP_LABELS = {
  box: 'cardboard box', tray: 'tray', folder: 'folder', books: 'stack of books', bag: 'bag', basket: 'shopping basket',
  bucket: 'bucket', can: 'watering can', mop: 'mop', newspaper: 'newspaper', umbrella: 'umbrella', clipboard: 'clipboard',
  laundry: 'laundry basket', menu: 'menu', sign: 'wet floor sign', cup: 'coffee cup', pillow: 'pillow', towel: 'towel',
};

export function propMesh(kind) {
  let m;
  const M = (c) => new THREE.MeshStandardMaterial({ color: c });
  if (kind === 'tray' || kind === 'cup') {
    m = new THREE.Group();
    m.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18), M('#b2bec3')));
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.04, 14), M('#ffffff'));
    plate.position.set(0.08, 0.03, 0);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.14, 10), M('#e17055'));
    cup.position.set(-0.12, 0.08, 0.05);
    m.add(plate, cup);
    m.userData.up = 0.3;
    m.userData.cover = 1.1;
  } else if (kind === 'box' || kind === 'basket') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.38), M(kind === 'basket' ? '#e84118' : '#c8a27a'));
    m.userData.up = 0.12;
    m.userData.cover = 1.35;
  } else if (kind === 'bag') {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), M('#2d3436'));
    m.scale.y = 1.2;
    m.userData.up = 0.05;
    m.userData.cover = 1.2;
  } else if (kind === 'books') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.26), M('#8e44ad'));
    m.userData.up = 0.12;
    m.userData.cover = 0.95;
  } else if (kind === 'bucket' || kind === 'can') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 12), M(kind === 'can' ? '#27ae60' : '#f1c40f'));
    m.userData.up = 0.0;
    m.userData.cover = 0.7;
  } else if (kind === 'mop') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), M('#a1887f'));
    m.userData.up = 0.2;
    m.userData.cover = 0.2;
  } else if (kind === 'newspaper' || kind === 'menu' || kind === 'clipboard') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.03), M(kind === 'menu' ? '#6d214f' : kind === 'clipboard' ? '#a1887f' : '#dfe6e9'));
    m.userData.up = 0.05;
    m.userData.cover = 0.9;
  } else if (kind === 'umbrella') {
    m = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.3, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#2d3436', side: THREE.DoubleSide }));
    canopy.position.y = 0.9;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), M('#636e72'));
    shaft.position.y = 0.4;
    m.add(canopy, shaft);
    m.userData.up = 0.3;
    m.userData.fwd = 0.15;
    m.userData.cover = 0.6;
  } else if (kind === 'laundry' || kind === 'pillow' || kind === 'towel') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.4), M(kind === 'laundry' ? '#74b9ff' : '#ffffff'));
    m.userData.up = 0.1;
    m.userData.cover = 1.3;
  } else if (kind === 'sign') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.06), M('#f1c40f'));
    m.userData.up = -0.05;
    m.userData.cover = 1.1;
  } else {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.04), M('#0984e3'));
    m.userData.up = 0.05;
    m.userData.cover = 0.8;
  }
  m.traverse((o) => o.isMesh && (o.castShadow = true));
  m.userData.kind = kind;
  return m;
}

