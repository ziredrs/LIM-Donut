import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { ShapeGeometry } from './party.config';

export type { ShapeGeometry };

export interface DonutState {
  shape: ShapeGeometry;
  flavorColor: string;
  flavorInnerColor: string;
  sauceColor: string | null;
  sauceGlossy: boolean;
  sauceCoverage: 'full' | 'half' | 'drizzle';
  toppings: ToppingData[];
}

export interface ToppingData {
  colors: string[];
  shape: 'circle' | 'rect' | 'line';
}

export class DonutRenderer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private animationId = 0;
  private resizeObserver: ResizeObserver | null = null;

  private donutBody!: THREE.Mesh;
  private glazeTop!: THREE.Mesh;
  private glazeHalf!: THREE.Mesh;
  private drizzleGroup = new THREE.Group();
  private toppingGroup = new THREE.Group();

  private currentShape: ShapeGeometry = 'torus';
  private targetBodyColor = new THREE.Color('#E8C98E');
  private targetGlazeColor = new THREE.Color('#E91E63');
  private targetGlazeOpacity = 0;
  private currentGlazeOpacity = 0;
  private currentCoverage: 'full' | 'half' | 'drizzle' = 'full';

  init(canvas: HTMLCanvasElement) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.camera.position.set(0, 2.8, 4.2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = true;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.2, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.5;

    this.setupLights();
    this.createDonut();
    this.createGlaze();
    this.scene.add(this.drizzleGroup);
    this.scene.add(this.toppingGroup);

    this.animate();

    this.resizeObserver = new ResizeObserver(() => this.onResize(canvas));
    this.resizeObserver.observe(canvas.parentElement!);
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffeedd, 0.4);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xaaccff, 0.3);
    rim.position.set(0, -2, -3);
    this.scene.add(rim);
  }

  private createDonut() {
    const geo = this.buildBodyGeometry('torus');
    const mat = new THREE.MeshStandardMaterial({
      color: 0xE8C98E,
      roughness: 0.7,
      metalness: 0.05,
    });
    this.donutBody = new THREE.Mesh(geo, mat);
    this.donutBody.rotation.x = Math.PI / 2;
    this.scene.add(this.donutBody);
  }

  private createGlaze() {
    const glazeMat = new THREE.MeshPhysicalMaterial({
      color: 0xE91E63,
      roughness: 0.12,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const fullGeo = this.buildGlazeGeometry('torus', false);
    this.glazeTop = new THREE.Mesh(fullGeo, glazeMat.clone());
    this.glazeTop.rotation.x = Math.PI / 2;
    this.glazeTop.position.y = 0.08;
    this.glazeTop.visible = false;
    this.scene.add(this.glazeTop);

    const halfGeo = this.buildGlazeGeometry('torus', true);
    this.glazeHalf = new THREE.Mesh(halfGeo, glazeMat.clone());
    this.glazeHalf.rotation.x = Math.PI / 2;
    this.glazeHalf.position.y = 0.08;
    this.glazeHalf.visible = false;
    this.scene.add(this.glazeHalf);
  }

  private buildBodyGeometry(shape: ShapeGeometry): THREE.BufferGeometry {
    switch (shape) {
      case 'torus':
        return new THREE.TorusGeometry(1.2, 0.55, 48, 96);
      case 'square':
        return this.buildSquareDonut(1.2, 0.55);
      case 'heart':
        return this.buildHeartDonut();
      case 'star':
        return this.buildStarDonut();
      case 'hexagon':
        return this.buildPolygonDonut(6, 1.2, 0.55);
    }
  }

  private buildGlazeGeometry(shape: ShapeGeometry, half: boolean): THREE.BufferGeometry {
    switch (shape) {
      case 'torus':
        return half
          ? new THREE.TorusGeometry(1.21, 0.50, 48, 96, Math.PI)
          : new THREE.TorusGeometry(1.21, 0.50, 48, 96);
      case 'square':
        return this.buildSquareDonut(1.2, 0.565, half, true);
      case 'heart':
        return this.buildHeartDonut(1.01, half);
      case 'star':
        return this.buildStarDonut(1.01, half);
      case 'hexagon':
        return this.buildPolygonDonut(6, 1.21, 0.50, half);
    }
  }

  private buildSquareDonut(R: number, r: number, half = false, topOnly = false): THREE.BufferGeometry {
    // Tangent-continuous rounded corners avoid folded tube faces at 90-degree joins.
    // The corner radius exceeds the tube radius so the inside never pinches.
    const corner = 0.75;
    const c = R - corner;
    const outline = new THREE.Path();
    outline.moveTo(R, -c);
    outline.lineTo(R, c);
    outline.absarc(c, c, corner, 0, Math.PI / 2, false);
    outline.lineTo(-c, R);
    outline.absarc(-c, c, corner, Math.PI / 2, Math.PI, false);
    outline.lineTo(-R, -c);
    outline.absarc(-c, -c, corner, Math.PI, Math.PI * 1.5, false);
    outline.lineTo(c, -R);
    outline.absarc(c, -c, corner, Math.PI * 1.5, Math.PI * 2, false);
    const path = new class extends THREE.Curve<THREE.Vector3> {
      constructor() { super(); }
      override getPoint(t: number, target = new THREE.Vector3()) {
        const point = outline.getPoint(half ? t * 0.5 : t);
        return target.set(point.x, 0, point.y);
      }
    }();
    const geo = new THREE.TubeGeometry(path, half ? 96 : 192, r, 48, !half);
    if (topOnly) {
      const position = geo.getAttribute('position');
      const index = geo.getIndex()!;
      const top: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if ([a, b, c].every(vertex => position.getY(vertex) >= -0.00001)) top.push(a, b, c);
      }
      geo.setIndex(top);
    }
    return geo;
  }

  private buildHeartDonut(scale = 1, half = false): THREE.BufferGeometry {
    const pts: THREE.Vector3[] = [];
    const total = half ? 50 : 100;
    for (let i = 0; i <= total; i++) {
      const t = (i / 100) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(new THREE.Vector3(x * 0.075 * scale, 0, -z * 0.075 * scale));
    }
    const curve = new THREE.CatmullRomCurve3(pts, !half);
    return new THREE.TubeGeometry(curve, 96, 0.5 * scale, 24, !half);
  }

  private buildStarDonut(scale = 1, half = false): THREE.BufferGeometry {
    const pts: THREE.Vector3[] = [];
    const spikes = 5;
    const outer = 1.3 * scale;
    const inner = 0.65 * scale;
    const total = half ? spikes : spikes * 2;
    for (let i = 0; i <= total; i++) {
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? outer : inner;
      pts.push(new THREE.Vector3(Math.cos(angle) * rad, 0, Math.sin(angle) * rad));
    }
    const curve = new THREE.CatmullRomCurve3(pts, !half);
    return new THREE.TubeGeometry(curve, 96, 0.4 * scale, 24, !half);
  }

  private buildPolygonDonut(sides: number, R: number, r: number, half = false): THREE.BufferGeometry {
    const pts: THREE.Vector3[] = [];
    const count = half ? Math.ceil(sides / 2) + 1 : sides + 1;
    for (let i = 0; i < count; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * R, 0, Math.sin(angle) * R));
    }
    const curve = new THREE.CatmullRomCurve3(pts, !half);
    return new THREE.TubeGeometry(curve, 64, r, 24, !half);
  }

  private switchShape(shape: ShapeGeometry) {
    if (shape === this.currentShape) return;
    this.currentShape = shape;
    // TorusGeometry starts in XY; the custom tube paths already lie in XZ.
    const rotation = shape === 'torus' ? Math.PI / 2 : 0;
    this.donutBody.rotation.x = rotation;
    this.glazeTop.rotation.x = rotation;
    this.glazeHalf.rotation.x = rotation;

    const oldBodyGeo = this.donutBody.geometry;
    this.donutBody.geometry = this.buildBodyGeometry(shape);
    oldBodyGeo.dispose();

    const oldFullGeo = this.glazeTop.geometry;
    this.glazeTop.geometry = this.buildGlazeGeometry(shape, false);
    oldFullGeo.dispose();

    const oldHalfGeo = this.glazeHalf.geometry;
    this.glazeHalf.geometry = this.buildGlazeGeometry(shape, true);
    oldHalfGeo.dispose();

    this.rebuildToppings(this._lastToppings);
  }

  private _lastToppings: ToppingData[] = [];

  private rebuildDrizzle(color: THREE.Color) {
    this.clearGroup(this.drizzleGroup);
    const R = 1.21;
    const tubeR = 0.50;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const geo = new THREE.CylinderGeometry(0.04, 0.025, 0.6 + Math.random() * 0.4, 8);
      const mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.15,
        clearcoat: 0.8,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Mesh(geo, mat);
      const x = Math.cos(angle) * R;
      const z = Math.sin(angle) * R;
      line.position.set(x, tubeR * 0.6, z);
      line.lookAt(0, 0, 0);
      line.rotateX(Math.PI / 2);
      this.drizzleGroup.add(line);
    }
  }

  updateState(state: DonutState) {
    this.switchShape(state.shape);
    this.targetBodyColor.set(state.flavorColor);

    if (state.sauceColor) {
      this.targetGlazeColor.set(state.sauceColor);
      this.targetGlazeOpacity = 0.88;
    } else {
      this.targetGlazeOpacity = 0;
    }

    this.currentCoverage = state.sauceCoverage;
    this.applyGlazeCoverage(state.sauceCoverage, state.sauceColor);
    this._lastToppings = state.toppings;
    this.rebuildToppings(state.toppings);
  }

  private applyGlazeCoverage(coverage: 'full' | 'half' | 'drizzle', sauceColor: string | null) {
    const hasSauce = sauceColor !== null;
    this.glazeTop.visible = hasSauce && coverage === 'full';
    this.glazeHalf.visible = hasSauce && coverage === 'half';
    this.drizzleGroup.visible = hasSauce && coverage === 'drizzle';

    if (hasSauce && coverage === 'drizzle') {
      this.rebuildDrizzle(new THREE.Color(sauceColor!));
    }
    if (!hasSauce) {
      this.clearGroup(this.drizzleGroup);
    }
  }

  private rebuildToppings(toppings: ToppingData[]) {
    this.clearGroup(this.toppingGroup);
    if (toppings.length === 0) return;

    const perTopping = Math.min(Math.floor(60 / toppings.length), 30);
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // Sample the actual rendered surface in world space, including each shape and sauce coverage.
    this.toppingGroup.rotation.set(0, 0, 0);
    this.donutBody.updateMatrixWorld(true);
    this.glazeTop.updateMatrixWorld(true);
    this.glazeHalf.updateMatrixWorld(true);
    this.drizzleGroup.updateMatrixWorld(true);
    const surface = this.glazeTop.visible ? this.glazeTop
      : this.glazeHalf.visible ? this.glazeHalf : this.donutBody;
    const bounds = new THREE.Box3().setFromObject(surface);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const up = new THREE.Vector3(0, 1, 0);

    toppings.forEach(topping => {
      for (let i = 0; i < perTopping; i++) {
        let hit: THREE.Intersection | undefined;
        const normal = new THREE.Vector3();
        for (let attempt = 0; attempt < 300; attempt++) {
          ray.set(new THREE.Vector3(
            bounds.min.x + rand() * (bounds.max.x - bounds.min.x),
            bounds.max.y + 1,
            bounds.min.z + rand() * (bounds.max.z - bounds.min.z)
          ), down);
          const surfaces: THREE.Object3D[] = [surface];
          if (this.drizzleGroup.visible) surfaces.push(this.drizzleGroup);
          const candidate = ray.intersectObjects(surfaces, true)[0];
          if (!candidate?.face) continue;
          normal.copy(candidate.face.normal).applyNormalMatrix(
            new THREE.Matrix3().getNormalMatrix(candidate.object.matrixWorld)
          ).normalize();
          if (normal.y < 0.45) continue;
          // Ignore sauce faces hidden inside the dough.
          const bodyHit = ray.intersectObject(this.donutBody)[0];
          if (!bodyHit) continue;
          if (bodyHit && bodyHit.point.y > candidate.point.y + 0.005) continue;
          hit = candidate;
          break;
        }
        if (!hit) continue;

        let geo: THREE.BufferGeometry;
        if (topping.shape === 'circle') {
          geo = new THREE.SphereGeometry(0.04 + rand() * 0.03, 6, 6);
        } else if (topping.shape === 'rect') {
          const w = 0.03 + rand() * 0.03;
          geo = new THREE.BoxGeometry(w, 0.02, w * (2 + rand()));
        } else {
          geo = new THREE.CylinderGeometry(0.015, 0.015, 0.1 + rand() * 0.06, 5);
          geo.rotateZ(Math.PI / 2);
        }

        const color = topping.colors[Math.floor(rand() * topping.colors.length)];
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: 0.5,
          metalness: 0.1,
        });

        const mesh = new THREE.Mesh(geo, mat);
        geo.computeBoundingBox();
        const thickness = geo.boundingBox!.max.y;
        mesh.position.copy(hit.point);
        mesh.position.y += thickness * 0.8 / normal.y;
        mesh.quaternion.setFromUnitVectors(up, normal);
        mesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);

        this.toppingGroup.add(mesh);
      }
    });

    this.toppingGroup.rotation.set(0, 0, 0);
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const bodyMat = this.donutBody.material as THREE.MeshStandardMaterial;
    bodyMat.color.lerp(this.targetBodyColor, 0.1);

    // Glaze opacity + color lerp
    this.currentGlazeOpacity += (this.targetGlazeOpacity - this.currentGlazeOpacity) * 0.12;

    const applyGlaze = (mesh: THREE.Mesh) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      mat.opacity = this.currentGlazeOpacity;
      mat.color.lerp(this.targetGlazeColor, 0.12);
    };

    if (this.glazeTop.visible) applyGlaze(this.glazeTop);
    if (this.glazeHalf.visible) applyGlaze(this.glazeHalf);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(canvas: HTMLCanvasElement) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    cancelAnimationFrame(this.animationId);
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m: THREE.Material) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
