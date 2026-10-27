// Rain: falling streaks around the camera while outdoors.
import * as THREE from 'three';

export class Rain {
  constructor(scene) {
    const N = 2600;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push({ x: (Math.random() - 0.5) * 50, y: Math.random() * 22, z: (Math.random() - 0.5) * 50, v: 14 + Math.random() * 6 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab7c4, transparent: true, opacity: 0.55 }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }
  set(on) {
    this.lines.visible = on;
  }
  update(dt, cx, cz) {
    if (!this.lines.visible) return;
    const a = this.lines.geometry.attributes.position.array;
    this.drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) {
        d.y = 18 + Math.random() * 6;
        d.x = (Math.random() - 0.5) * 50;
        d.z = (Math.random() - 0.5) * 50;
      }
      const o = i * 6;
      a[o] = cx + d.x;
      a[o + 1] = d.y;
      a[o + 2] = cz + d.z;
      a[o + 3] = cx + d.x + 0.04;
      a[o + 4] = d.y + 0.45;
      a[o + 5] = cz + d.z + 0.02;
    });
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
  dispose(scene) {
    scene.remove(this.lines);
    this.lines.geometry.dispose();
  }
}
