import { CylinderGeometry, MathUtils, Mesh, MeshStandardMaterial, Scene, SphereGeometry, BoxGeometry } from 'three';

export type SpawnType = 'cube' | 'sphere' | 'cylinder';

export interface ObjectState {
  id: string;
  type: SpawnType;
  x: number;
  y: number;
  z: number;
}

interface SpawnedObject {
  id: string;
  type: SpawnType;
  mesh: Mesh;
}

const COLORS = ['#e05555', '#55e07a', '#e0d055'];

export class ObjectSpawner {
  private readonly scene: Scene;
  private readonly objects: SpawnedObject[] = [];
  private idCounter = 1;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  spawnObject(type: SpawnType): string {
    if (this.objects.length >= 5) {
      const oldest = this.objects.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
      }
    }

    const mesh = this.createMesh(type);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.15;
    mesh.position.x = Math.cos(angle) * radius;
    mesh.position.z = Math.sin(angle) * radius;
    mesh.position.y = this.heightFor(type) / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const id = `obj-${this.idCounter++}`;
    this.objects.push({ id, type, mesh });
    return id;
  }

  clearObjects(): void {
    this.objects.forEach((entry) => this.scene.remove(entry.mesh));
    this.objects.length = 0;
  }

  getObjectStates(): ObjectState[] {
    return this.objects.map((entry) => ({
      id: entry.id,
      type: entry.type,
      x: Number(entry.mesh.position.x.toFixed(4)),
      y: Number(entry.mesh.position.y.toFixed(4)),
      z: Number(entry.mesh.position.z.toFixed(4)),
    }));
  }

  private createMesh(type: SpawnType): Mesh {
    const material = new MeshStandardMaterial({
      color: COLORS[MathUtils.randInt(0, COLORS.length - 1)],
      roughness: 0.7,
      metalness: 0.1,
    });
    switch (type) {
      case 'cube':
        return new Mesh(new BoxGeometry(0.03, 0.03, 0.03), material);
      case 'sphere':
        return new Mesh(new SphereGeometry(0.025, 24, 24), material);
      case 'cylinder':
        return new Mesh(new CylinderGeometry(0.02, 0.02, 0.06, 24), material);
      default:
        return new Mesh(new BoxGeometry(0.03, 0.03, 0.03), material);
    }
  }

  private heightFor(type: SpawnType): number {
    switch (type) {
      case 'sphere':
        return 0.05;
      case 'cylinder':
        return 0.06;
      case 'cube':
      default:
        return 0.03;
    }
  }
}
