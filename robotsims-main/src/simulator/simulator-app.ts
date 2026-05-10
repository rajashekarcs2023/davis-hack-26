import { Clock } from 'three';
import { LEKIWI_CONFIG } from '../robots/lekiwi';
import { SO101_CONFIG, type ActionSpec, type RobotId } from '../robots/so101';
import { attachAiStatusPanel } from './ai-status-panel';
import { attachEvidenceOverlay } from './evidence-overlay';
import { EnvironmentManager, type EnvironmentId } from './environment';
import { ExternalApiClient, type RobotSimState } from './external-api';
import { FarmSceneBuilder } from './farm-scene';
import { Hud, type TaskStatus } from './hud';
import { ObjectSpawner } from './object-spawner';
import { RobotViewer } from './robot-viewer';
import { createScene } from './scene';

interface ActiveAction {
  spec: ActionSpec;
  token: string;
  magnitude: number;
  startedAt: number;
  durationMs: number;
}

const BASE_TRANSLATE_SPEED_PER_FRAME = 0.005;
const BASE_ROTATE_SPEED_PER_FRAME = 0.02;

export class SimulatorApp {
  private readonly sceneContext = createScene(this.requireElement('sim-root'));
  private readonly robotViewer = new RobotViewer(this.sceneContext.scene);
  private readonly environment = new EnvironmentManager(
    this.sceneContext.scene,
    this.sceneContext.ambientLight,
    this.sceneContext.groundPlane,
  );
  private readonly objectSpawner = new ObjectSpawner(this.sceneContext.scene);
  private readonly farmScene = new FarmSceneBuilder(this.sceneContext.scene);
  private readonly hud = new Hud();
  private readonly clock = new Clock();

  private externalApi: ExternalApiClient | null = null;
  private activeAction: ActiveAction | null = null;
  private taskStatus: TaskStatus = 'idle';
  private lastAction = { token: 'none', magnitude: 0, timestamp: Date.now() };

  async init(): Promise<void> {
    await this.robotViewer.switchRobot('lekiwi');
    await this.environment.setEnvironment('farm');
    this.farmScene.build();
    this.hud.setActiveRobot('lekiwi');
    this.configureApiTestPanel('lekiwi');
    this.hud.setActiveEnvironment('farm');
    this.hud.setBridgeConnected(false);

    this.wireHud();

    // TerraScout: top-center live AI status panel polling /api/runs/active.
    // Mirrors the drone-sim panel so a judge looking at either window sees
    // the agent's current state and the action-token stream in real time.
    try {
      attachAiStatusPanel();
    } catch (panelErr) {
      console.error('[init] AI status panel failed to initialize:', panelErr);
    }

    // TerraScout: VLM evidence overlay — pulsing red dots on the wrist cam
    // showing exactly where the ground VLM pointed in the latest analysis.
    try {
      attachEvidenceOverlay();
    } catch (overlayErr) {
      console.error('[init] VLM evidence overlay failed to initialize:', overlayErr);
    }

    this.externalApi = new ExternalApiClient({
      getState: () => this.getState(),
      onAction: (action, magnitude) => this.startAction(action, magnitude),
      getFrame: () => this.robotViewer.captureWristFrameJpeg(this.sceneContext.renderer),
      onConnectionChange: (connected) => this.hud.setBridgeConnected(connected),
    });
    this.externalApi.init();
    this.animate();
  }

  private wireHud(): void {
    this.hud.onRobotSwitch((robotId) => this.switchRobot(robotId));
    this.hud.onEnvironmentSwitch((environmentId) => this.switchEnvironment(environmentId));
    this.hud.onSpawnObject((type) => this.objectSpawner.spawnObject(type));
    this.hud.onClearObjects(() => this.objectSpawner.clearObjects());
    this.hud.onApiAction((token, magnitude) => {
      const accepted = this.startAction(token, magnitude);
      this.hud.setApiTestStatus(
        accepted
          ? `Sent ${token} (${Math.max(0, Math.min(1, magnitude)).toFixed(2)})`
          : `Rejected: ${token} is not valid for ${this.robotViewer.currentRobotId}`,
      );
    });
  }

  private async switchRobot(robotId: RobotId): Promise<void> {
    await this.robotViewer.switchRobot(robotId);
    this.activeAction = null;
    this.taskStatus = 'idle';
    this.hud.setActiveRobot(robotId);
    this.configureApiTestPanel(robotId);
  }

  private async switchEnvironment(environmentId: EnvironmentId): Promise<void> {
    await this.environment.setEnvironment(environmentId);
    // Farm props belong only to the 'farm' environment. Hide them when the
    // user picks a different environment, restore them on switch-back.
    this.farmScene.setVisible(environmentId === 'farm');
    this.hud.setActiveEnvironment(environmentId);
  }

  private startAction(token: string, magnitude: number): boolean {
    const clampedMagnitude = Math.max(0, Math.min(1, magnitude));
    const config = this.robotViewer.currentRobotId === 'lekiwi' ? LEKIWI_CONFIG : SO101_CONFIG;
    const spec = config.actionTokens[token];
    if (!spec) {
      return false;
    }

    this.lastAction = { token, magnitude: clampedMagnitude, timestamp: Date.now() };
    this.hud.updateLastAction(token, clampedMagnitude, this.lastAction.timestamp);
    this.activeAction = {
      spec,
      token,
      magnitude: clampedMagnitude,
      startedAt: performance.now(),
      durationMs: clampedMagnitude * 2000,
    };

    if (spec.kind === 'joint_set' && spec.jointKey && spec.target) {
      this.robotViewer.setJointToBound(spec.jointKey, spec.target);
      this.taskStatus = 'complete';
      return true;
    }

    if (spec.kind === 'reset') {
      this.robotViewer.resetJointState();
      this.taskStatus = 'complete';
      return true;
    }

    this.taskStatus = 'in_progress';
    return true;
  }

  private updateAction(deltaSeconds: number): void {
    if (!this.activeAction) {
      return;
    }

    const elapsed = performance.now() - this.activeAction.startedAt;
    if (elapsed >= this.activeAction.durationMs) {
      this.activeAction = null;
      this.taskStatus = 'complete';
      return;
    }

    const spec = this.activeAction.spec;
    if (spec.kind === 'joint_delta' && spec.jointKey && spec.direction) {
      const joint = this.robotViewer.getJointSpec(spec.jointKey);
      if (!joint) {
        return;
      }
      const rangePerSecond = (joint.max - joint.min) / 2;
      const delta = rangePerSecond * deltaSeconds * spec.direction;
      this.robotViewer.addJointDelta(spec.jointKey, delta);
      return;
    }

    if (spec.kind === 'base_motion' && spec.baseMotion) {
      const frameScale = deltaSeconds * 60;
      switch (spec.baseMotion) {
        case 'drive_forward':
          this.robotViewer.moveBase(0, -BASE_TRANSLATE_SPEED_PER_FRAME * frameScale);
          break;
        case 'drive_backward':
          this.robotViewer.moveBase(0, BASE_TRANSLATE_SPEED_PER_FRAME * frameScale);
          break;
        case 'strafe_left':
          this.robotViewer.moveBase(-BASE_TRANSLATE_SPEED_PER_FRAME * frameScale, 0);
          break;
        case 'strafe_right':
          this.robotViewer.moveBase(BASE_TRANSLATE_SPEED_PER_FRAME * frameScale, 0);
          break;
        case 'rotate_left':
          this.robotViewer.rotateBase(BASE_ROTATE_SPEED_PER_FRAME * frameScale);
          break;
        case 'rotate_right':
          this.robotViewer.rotateBase(-BASE_ROTATE_SPEED_PER_FRAME * frameScale);
          break;
        default:
          break;
      }
    }
  }

  private animate = (): void => {
    const dt = this.clock.getDelta();
    const fps = dt > 0 ? 1 / dt : 0;
    this.updateAction(dt);

    this.sceneContext.orbitControls.update();
    this.robotViewer.renderWristCamera(this.sceneContext.renderer);
    this.sceneContext.renderer.render(this.sceneContext.scene, this.sceneContext.camera);
    this.robotViewer.drawWristViewToCanvas(this.hud.getWristCanvas(), this.sceneContext.renderer);

    this.hud.updateJointReadout(this.robotViewer.jointsInDegrees);
    this.hud.updateTaskStatus(this.taskStatus);
    this.hud.updateObjectCount(this.objectSpawner.getObjectStates().length);
    this.hud.updateFps(fps);

    requestAnimationFrame(this.animate);
  };

  private getState(): RobotSimState {
    return {
      type: 'state',
      robot: this.robotViewer.currentRobotId,
      joints: this.robotViewer.jointsInDegrees,
      base_pose: this.robotViewer.getBasePose(),
      task_status: this.taskStatus,
      objects: this.objectSpawner.getObjectStates(),
      timestamp: Date.now(),
    };
  }

  private configureApiTestPanel(robotId: RobotId): void {
    const config = robotId === 'lekiwi' ? LEKIWI_CONFIG : SO101_CONFIG;
    const allTokens = Object.keys(config.actionTokens);
    const quickActions =
      robotId === 'lekiwi'
        ? ['drive_forward', 'rotate_left', 'shoulder_up', 'wrist_roll_cw', 'grip', 'reset']
        : ['rotate_cw', 'shoulder_up', 'elbow_down', 'wrist_roll_cw', 'grip', 'reset'];
    this.hud.setApiActionOptions(
      allTokens,
      quickActions.filter((token) => token in config.actionTokens),
    );
    this.hud.setApiTestStatus(`Ready for ${robotId.toUpperCase()} actions`);
  }

  private requireElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing required element: ${id}`);
    }
    return el;
  }
}
