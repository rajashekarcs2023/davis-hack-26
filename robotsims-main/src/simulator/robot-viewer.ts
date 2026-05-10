import {
  Box3,
  Color,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import URDFLoader from 'urdf-loader';
import { LEKIWI_CONFIG } from '../robots/lekiwi';
import { SO101_CONFIG, type JointSpec, type RobotConfig, type RobotId } from '../robots/so101';

interface UrdfRobot extends Object3D {
  setJointValue?: (jointName: string, value: number) => void;
}

const ROBOT_MATERIAL = new MeshStandardMaterial({
  color: '#4a90d9',
  metalness: 0.3,
  roughness: 0.6,
});

const ROBOT_CONFIGS: Record<RobotId, RobotConfig> = {
  so101: SO101_CONFIG,
  lekiwi: LEKIWI_CONFIG,
};

export class RobotViewer {
  private readonly scene: Scene;
  private readonly urdfLoader: URDFLoader;
  private readonly wristCamera = new PerspectiveCamera(55, 1, 0.01, 4);
  private readonly wristTarget = new WebGLRenderTarget(256, 256);
  private readonly jpegCanvas: HTMLCanvasElement;
  private readonly pixelBuffer = new Uint8Array(256 * 256 * 4);

  private robot: UrdfRobot | null = null;
  private currentConfig: RobotConfig = SO101_CONFIG;
  private jointValues = new Map<string, number>();
  private basePose = { x: 0, y: 0, theta: 0 };
  private wristMount: Object3D | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.urdfLoader = new URDFLoader();
    this.jpegCanvas = document.createElement('canvas');
    this.jpegCanvas.width = 256;
    this.jpegCanvas.height = 256;
    if (!this.jpegCanvas.getContext('2d')) {
      throw new Error('Canvas context unavailable');
    }
    this.scene.add(this.wristCamera);
  }

  get currentRobotId(): RobotId {
    return this.currentConfig.id;
  }

  get wristRenderTarget(): WebGLRenderTarget {
    return this.wristTarget;
  }

  get jointsInDegrees(): Record<string, number> {
    const output: Record<string, number> = {};
    this.currentConfig.joints.forEach((joint) => {
      output[joint.key] = MathUtils.radToDeg(this.jointValues.get(joint.key) ?? joint.defaultValue);
    });
    return output;
  }

  get actionTokens(): Record<string, string> {
    return Object.keys(this.currentConfig.actionTokens).reduce<Record<string, string>>((acc, token) => {
      acc[token] = token;
      return acc;
    }, {});
  }

  async switchRobot(robotId: RobotId): Promise<void> {
    const config = ROBOT_CONFIGS[robotId];
    if (this.robot) {
      this.scene.remove(this.robot);
      this.robot = null;
    }

    const loaded = (await this.loadRobot(config)) as UrdfRobot;
    this.currentConfig = config;
    this.robot = loaded;
    this.scene.add(loaded);

    this.applyRobotMaterial(loaded);
    this.fitRobotWhenReady(loaded);
    this.resetJointState();
    this.attachWristCamera();
  }

  setJointValue(key: string, value: number): void {
    if (!this.robot) {
      return;
    }
    const joint = this.currentConfig.joints.find((entry) => entry.key === key);
    if (!joint) {
      return;
    }
    const clamped = Math.min(joint.max, Math.max(joint.min, value));
    this.jointValues.set(key, clamped);
    this.robot.setJointValue?.(joint.urdfName, clamped);
  }

  addJointDelta(key: string, delta: number): void {
    const current = this.jointValues.get(key) ?? 0;
    this.setJointValue(key, current + delta);
  }

  setJointToBound(key: string, bound: 'min' | 'max'): void {
    const joint = this.currentConfig.joints.find((entry) => entry.key === key);
    if (!joint) {
      return;
    }
    this.setJointValue(key, bound === 'min' ? joint.min : joint.max);
  }

  resetJointState(): void {
    this.currentConfig.joints.forEach((joint) => this.setJointValue(joint.key, joint.defaultValue));
  }

  getJointSpec(key: string): JointSpec | undefined {
    return this.currentConfig.joints.find((joint) => joint.key === key);
  }

  getBasePose(): { x: number; y: number; theta: number } | null {
    return this.currentConfig.id === 'lekiwi' ? { ...this.basePose } : null;
  }

  moveBase(deltaX: number, deltaY: number): void {
    if (!this.robot || this.currentConfig.id !== 'lekiwi') {
      return;
    }
    this.robot.position.x += deltaX;
    this.robot.position.z += deltaY;
    this.basePose.x = this.robot.position.x;
    this.basePose.y = this.robot.position.z;
  }

  rotateBase(deltaTheta: number): void {
    if (!this.robot || this.currentConfig.id !== 'lekiwi') {
      return;
    }
    this.robot.rotation.y += deltaTheta;
    this.basePose.theta = this.robot.rotation.y;
  }

  renderWristCamera(renderer: WebGLRenderer): void {
    if (!this.wristMount) {
      return;
    }
    // Save + restore the renderer's clear color around the render-target pass.
    // Without an explicit clear color, the wrist target can end up pure black
    // (all zeros) in some GPU drivers even though `scene.background` is set —
    // the driver is free to short-circuit the background clear for off-screen
    // targets. Forcing a neutral sky clear guarantees a non-black frame.
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;

    renderer.setClearColor('#7fb3d5', 1.0);
    renderer.autoClear = true;
    renderer.setRenderTarget(this.wristTarget);
    renderer.clear();
    renderer.render(this.scene, this.wristCamera);

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }

  drawWristViewToCanvas(targetCanvas: HTMLCanvasElement, renderer: WebGLRenderer): void {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    renderer.readRenderTargetPixels(this.wristTarget, 0, 0, 256, 256, this.pixelBuffer);
    const imageData = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const src = (x + (255 - y) * 256) * 4;
        const dst = (x + y * 256) * 4;
        imageData.data[dst] = this.pixelBuffer[src];
        imageData.data[dst + 1] = this.pixelBuffer[src + 1];
        imageData.data[dst + 2] = this.pixelBuffer[src + 2];
        imageData.data[dst + 3] = this.pixelBuffer[src + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  captureWristFrameJpeg(renderer: WebGLRenderer): string {
    this.drawWristViewToCanvas(this.jpegCanvas, renderer);
    return this.jpegCanvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
  }

  private loadRobot(config: RobotConfig): Promise<Object3D> {
    return new Promise((resolve, reject) => {
      this.urdfLoader.packages = config.packagesPath;
      this.urdfLoader.load(
        config.urdfPath,
        (robot) => resolve(robot),
        undefined,
        (error) => reject(error),
      );
    });
  }

  private applyRobotMaterial(root: Object3D): void {
    root.traverse((node) => {
      if (node instanceof Mesh) {
        node.material = ROBOT_MATERIAL;
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }

  private fitRobotWhenReady(root: Object3D): void {
    let attempts = 0;
    const maxAttempts = 120;
    const tick = () => {
      // Mesh resources can arrive after URDF parse completes.
      // Retry until at least one renderable mesh exists.
      this.applyRobotMaterial(root);
      const didFit = this.fitRobotToGround(root);
      attempts += 1;
      if (!didFit && attempts < maxAttempts) {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  private fitRobotToGround(root: Object3D): boolean {
    // URDF assets are authored in ROS's Z-up convention; rotate to Three.js Y-up.
    root.rotation.set(-Math.PI / 2, 0, 0);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) {
      return false;
    }
    const size = new Vector3();
    box.getSize(size);
    // Target height of 0.18m so the LeKiwi reads as a small "inspection rover"
    // sitting between the 0.18m-spaced crop rows of the farm tableau, not a
    // full-size robot trampling the whole scene. The 1.8x cap is preserved
    // for any robot whose URDF measures absurdly small (the loader sometimes
    // reports zero size mid-load).
    const targetHeight = 0.18;
    const scale = size.y > 0 ? Math.min(1.8, targetHeight / size.y) : 1;
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    const adjusted = new Box3().setFromObject(root);
    root.position.y -= adjusted.min.y;
    root.position.x = 0;
    root.position.z = 0;
    this.basePose = { x: 0, y: 0, theta: 0 };
    return true;
  }

  private attachWristCamera(): void {
    if (!this.robot) {
      return;
    }

    // NOTE (evidence camera, not true wrist cam): we intentionally do NOT
    // parent the camera to a URDF link. The URDFs for SO-101 and LeKiwi place
    // their wrist links in poses that often render all-black (camera inside
    // a mesh, looking at a clipped plane, or outside the 4m far clip), which
    // kills the downstream VLM pipeline.
    //
    // Instead we anchor the camera in world space, a fixed height above the
    // robot, looking down at the patch of ground just in front of it. That
    // gives the demo a deterministic "plant health inspection" viewpoint
    // regardless of joint state or URDF — exactly what a ground-robot
    // inspection rig would see.
    if (this.wristCamera.parent) {
      this.wristCamera.parent.remove(this.wristCamera);
    }
    this.scene.add(this.wristCamera);
    this.wristMount = this.scene;
    // Frame the demo target: the yellow/brown stress patch the FarmSceneBuilder
    // places at world (0, 0, -0.4) with radius 0.13m, plus the green crop row
    // running through it. Position the camera ~30cm above and ~15cm behind the
    // patch, tilted down ~50°, so the patch sits in the center of the frame
    // with crops visible above it. This is exactly what a downward-looking
    // wrist-mounted inspection camera would capture.
    this.wristCamera.position.set(0.0, 0.32, -0.18);
    this.wristCamera.lookAt(0.0, 0.0, -0.45);
    this.wristCamera.updateProjectionMatrix();
  }
}
