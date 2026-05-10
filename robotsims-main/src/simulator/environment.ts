import {
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type AmbientLight,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';

export type EnvironmentId = 'farm' | 'forest' | 'mars' | 'warehouse' | 'lab';

interface FileEnvConfig {
  kind: 'file';
  texture: string;
  ambient: string;
}

interface ProceduralEnvConfig {
  kind: 'procedural';
  /** Solid color used for the scene background (sky). */
  background: string;
  /** Function that returns a freshly-built ground texture. */
  ground: () => CanvasTexture;
  ambient: string;
  /** UV repeat for the ground texture. */
  groundRepeat?: [number, number];
}

type EnvConfig = FileEnvConfig | ProceduralEnvConfig;

const ENVIRONMENT_CONFIG: Record<EnvironmentId, EnvConfig> = {
  farm: {
    kind: 'procedural',
    background: '#7fb3d5',
    ambient: '#a8c8a0',
    groundRepeat: [3, 3],
    ground: makeFarmGroundTexture,
  },
  forest: { kind: 'file', texture: '/environments/forest.png', ambient: '#8fba8f' },
  mars: { kind: 'file', texture: '/environments/mars.png', ambient: '#c4844a' },
  warehouse: { kind: 'file', texture: '/environments/warehouse.png', ambient: '#8fa0ba' },
  lab: { kind: 'file', texture: '/environments/lab.png', ambient: '#b0b0c8' },
};

export class EnvironmentManager {
  private readonly scene: Scene;
  private readonly ambient: AmbientLight;
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly textureLoader = new TextureLoader();
  private active: EnvironmentId = 'farm';

  constructor(scene: Scene, ambient: AmbientLight, groundPlane: Mesh) {
    this.scene = scene;
    this.ambient = ambient;
    this.groundMaterial = groundPlane.material as MeshStandardMaterial;
  }

  get currentEnvironment(): EnvironmentId {
    return this.active;
  }

  async setEnvironment(id: EnvironmentId): Promise<void> {
    const config = ENVIRONMENT_CONFIG[id];

    // Dispose any previous background/ground texture to avoid GPU leaks. The
    // disposal is identical regardless of whether we're swapping into a file
    // env or a procedural env.
    if (this.scene.background instanceof Texture) {
      this.scene.background.dispose();
    }
    if (this.groundMaterial.map) {
      this.groundMaterial.map.dispose();
    }

    if (config.kind === 'procedural') {
      // Solid sky color + procedural canvas-based ground.
      this.scene.background = new Color(config.background);

      const groundTexture = config.ground();
      groundTexture.colorSpace = SRGBColorSpace;
      groundTexture.wrapS = RepeatWrapping;
      groundTexture.wrapT = RepeatWrapping;
      const [rx, ry] = config.groundRepeat ?? [4, 4];
      groundTexture.repeat.set(rx, ry);
      this.groundMaterial.map = groundTexture;
    } else {
      // Equirectangular file texture for both background and ground.
      const bgTexture = await this.textureLoader.loadAsync(config.texture);
      bgTexture.colorSpace = SRGBColorSpace;
      bgTexture.mapping = EquirectangularReflectionMapping;

      const groundTexture = await this.textureLoader.loadAsync(config.texture);
      groundTexture.colorSpace = SRGBColorSpace;
      groundTexture.wrapS = RepeatWrapping;
      groundTexture.wrapT = RepeatWrapping;
      groundTexture.repeat.set(4, 4);

      this.scene.background = bgTexture;
      this.groundMaterial.map = groundTexture;
    }

    // The ground material's base color is initialized to a near-black grey
    // (so the unlit / un-textured fallback isn't blindingly bright). With a
    // texture map set, three.js multiplies the texture sample by the base
    // color, which would make the texture render almost-black. Force the base
    // color to white once a map exists, so the texture's true colors come
    // through without tint.
    this.groundMaterial.color.set('#ffffff');
    this.groundMaterial.needsUpdate = true;
    this.ambient.color.set(config.ambient);
    this.active = id;
  }
}

/**
 * Procedurally-generated farm soil texture: warm earthy base with darker tilled
 * furrows and small flecks. Used by the 'farm' environment so we don't depend
 * on shipping a binary asset.
 */
function makeFarmGroundTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base soil — warm tan.
  ctx.fillStyle = '#7d5d33';
  ctx.fillRect(0, 0, size, size);

  // Darker tilled furrows running vertically.
  const furrowCount = 18;
  for (let i = 0; i < furrowCount; i += 1) {
    const x = (i + 0.5) * (size / furrowCount);
    const grad = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 6, 0, 12, size);
  }

  // Subtle organic flecks for variety.
  for (let i = 0; i < 700; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const tint = Math.random() < 0.5 ? '#5a4322' : '#9a7a44';
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  return new CanvasTexture(canvas);
}
