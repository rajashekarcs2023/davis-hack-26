import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from 'three';

/**
 * Decorates the robot sim's scene with a TerraScout farm tableau:
 *   - Parallel green crop rows
 *   - A yellow/brown stressed patch in the row containing the demo target
 *   - A thin blue drip-line cylinder running along that same row
 *   - A small "Zone B3" sign post planted next to the stress patch
 *
 * Everything is grouped under a single `Group` so it can be hidden/shown or
 * disposed atomically when the user switches environments.
 *
 * Scale notes: the scene is tabletop-sized (~2m ground plane, ~0.5m robot).
 * All geometry below is sized to fit comfortably in that envelope and to
 * match what the wrist camera (FOV 55°, near 0.01m, far 4m) can actually
 * see when the robot drives toward the stress patch.
 */
export class FarmSceneBuilder {
  private readonly scene: Scene;
  private readonly group = new Group();
  private signTexture: CanvasTexture | null = null;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  // Layout constants — keep in one place so nudging the demo is one-line.
  private readonly rowCount = 5;
  private readonly rowSpacing = 0.18;
  private readonly rowLength = 1.6;
  private readonly rowWidth = 0.05;
  private readonly rowHeight = 0.035;
  private readonly stressRowIndex = 2; // 0-indexed, middle row
  private readonly stressPatchZ = -0.4; // in front of the robot (looking at -Z)
  private readonly stressPatchRadius = 0.13;

  constructor(scene: Scene) {
    this.scene = scene;
    this.group.name = 'farm-scene';
  }

  /** Build all farm props and attach them to the scene. Idempotent. */
  build(): void {
    if (this.group.parent) {
      return;
    }
    this.addCropRows();
    this.addStressPatch();
    this.addDripLine();
    this.addZoneSign('B3');
    this.scene.add(this.group);
  }

  /** Show or hide the entire farm tableau without removing it. */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Permanently remove props and free GPU resources. */
  dispose(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    if (this.signTexture) {
      this.signTexture.dispose();
      this.signTexture = null;
    }
  }

  private addCropRows(): void {
    const healthyMaterial = this.track(
      new MeshStandardMaterial({
        color: '#3aa55a',
        roughness: 0.85,
        metalness: 0.05,
      }),
    );

    const startX = -((this.rowCount - 1) / 2) * this.rowSpacing;
    for (let i = 0; i < this.rowCount; i += 1) {
      const x = startX + i * this.rowSpacing;
      const geometry = this.track(
        new BoxGeometry(this.rowWidth, this.rowHeight, this.rowLength),
      );
      const mesh = new Mesh(geometry, healthyMaterial);
      mesh.position.set(x, this.rowHeight / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private addStressPatch(): void {
    // Flat plane on the ground — appears as a yellow/brown circle from above
    // and from the wrist cam.
    const stressTexture = this.track(this.makeStressTexture());
    const material = this.track(
      new MeshStandardMaterial({
        map: stressTexture,
        color: '#d8b14a',
        roughness: 0.95,
        metalness: 0.0,
        side: DoubleSide,
      }),
    );
    const geometry = this.track(new CircleGeometry(this.stressPatchRadius, 48));
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // lay flat on ground
    mesh.position.set(this.stressColumnX(), 0.0011, this.stressPatchZ);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Also recolor the crop-row segment ABOVE the patch to brown/yellow so it
    // visually reads as "this row is stressed here."
    const stressRowMaterial = this.track(
      new MeshStandardMaterial({
        color: '#a0813a',
        roughness: 0.9,
        metalness: 0.05,
      }),
    );
    const stressGeo = this.track(
      new BoxGeometry(
        this.rowWidth + 0.005,
        this.rowHeight + 0.002,
        this.stressPatchRadius * 2,
      ),
    );
    const stressMesh = new Mesh(stressGeo, stressRowMaterial);
    stressMesh.position.set(
      this.stressColumnX(),
      this.rowHeight / 2,
      this.stressPatchZ,
    );
    stressMesh.castShadow = true;
    stressMesh.receiveShadow = true;
    this.group.add(stressMesh);
  }

  private addDripLine(): void {
    const material = this.track(
      new MeshStandardMaterial({
        color: '#3a82c8',
        roughness: 0.4,
        metalness: 0.4,
      }),
    );
    const geometry = this.track(
      new CylinderGeometry(0.012, 0.012, this.rowLength, 16),
    );
    const drip = new Mesh(geometry, material);
    drip.rotation.x = Math.PI / 2; // align along z
    drip.position.set(this.stressColumnX() + 0.07, 0.018, 0); // alongside the stress row
    drip.castShadow = true;
    drip.receiveShadow = true;
    this.group.add(drip);

    // A few subtle drip "emitters" — small spheres along the line.
    const emitterMaterial = this.track(
      new MeshStandardMaterial({
        color: '#5cb1e8',
        emissive: '#1a3c5a',
        roughness: 0.3,
        metalness: 0.5,
      }),
    );
    const emitterGeometry = this.track(new CylinderGeometry(0.004, 0.004, 0.014, 12));
    const emitterSpacing = this.rowLength / 6;
    for (let i = 1; i < 6; i += 1) {
      const z = -this.rowLength / 2 + i * emitterSpacing;
      const emitter = new Mesh(emitterGeometry, emitterMaterial);
      emitter.rotation.x = Math.PI / 2;
      emitter.position.set(this.stressColumnX() + 0.07, 0.025, z);
      this.group.add(emitter);
    }
  }

  private addZoneSign(zoneId: string): void {
    const post = new Mesh(
      this.track(new CylinderGeometry(0.006, 0.006, 0.16, 8)),
      this.track(
        new MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.7, metalness: 0.3 }),
      ),
    );
    post.position.set(
      this.stressColumnX() + 0.18,
      0.08,
      this.stressPatchZ,
    );
    post.castShadow = true;
    this.group.add(post);

    const signTexture = this.makeSignTexture(zoneId);
    this.signTexture = signTexture;
    const signMaterial = this.track(
      new MeshStandardMaterial({
        map: signTexture,
        roughness: 0.6,
        metalness: 0.05,
        side: DoubleSide,
      }),
    );
    const sign = new Mesh(
      this.track(new PlaneGeometry(0.14, 0.08)),
      signMaterial,
    );
    sign.position.set(
      this.stressColumnX() + 0.18,
      0.18,
      this.stressPatchZ,
    );
    // Face the orbit camera (which sits at +x, +y, +z by default).
    sign.rotation.y = Math.PI / 4;
    sign.castShadow = true;
    sign.receiveShadow = true;
    this.group.add(sign);
  }

  private stressColumnX(): number {
    const startX = -((this.rowCount - 1) / 2) * this.rowSpacing;
    return startX + this.stressRowIndex * this.rowSpacing;
  }

  private makeStressTexture(): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base soil color — warm tan.
    ctx.fillStyle = '#a07b3a';
    ctx.fillRect(0, 0, size, size);

    // Sprinkle drier yellow/brown blotches.
    for (let i = 0; i < 60; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 12 + Math.random() * 24;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = Math.random() < 0.5 ? '#d8b14a' : '#7d5a23';
      grad.addColorStop(0, tint);
      grad.addColorStop(1, 'rgba(160, 123, 58, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Light radial vignette so the patch reads as a "spot" not a slab.
    const vignette = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.2,
      size / 2,
      size / 2,
      size * 0.55,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    return new CanvasTexture(canvas);
  }

  private makeSignTexture(zoneId: string): CanvasTexture {
    const w = 512;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Background — dark with red border to match the "stress" theme.
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // "ZONE" label
    ctx.fillStyle = '#ffd36f';
    ctx.font = 'bold 56px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZONE', w / 2, 70);

    // Big zone id
    ctx.fillStyle = '#ff8888';
    ctx.font = 'bold 140px "Space Mono", monospace';
    ctx.fillText(zoneId, w / 2, h - 80);

    return new CanvasTexture(canvas);
  }

  private track<T extends { dispose: () => void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }
}

/** Convenience factory for simulator-app: build, attach, return the instance. */
export function attachFarmScene(scene: Scene): FarmSceneBuilder {
  const builder = new FarmSceneBuilder(scene);
  builder.build();
  return builder;
}
