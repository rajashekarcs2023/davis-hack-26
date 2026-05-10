import type { EnvironmentId } from './environment';
import type { SpawnType } from './object-spawner';
import type { RobotId } from '../robots/so101';

export type TaskStatus = 'idle' | 'in_progress' | 'complete';

interface HudElements {
  robotButtons: Record<RobotId, HTMLButtonElement>;
  environmentButtons: Record<EnvironmentId, HTMLButtonElement>;
  spawnButtons: Record<SpawnType, HTMLButtonElement>;
  clearButton: HTMLButtonElement;
  bridgeStatus: HTMLElement;
  jointReadout: HTMLElement;
  lastAction: HTMLElement;
  taskStatus: HTMLElement;
  objectCount: HTMLElement;
  fps: HTMLElement;
  wristCanvas: HTMLCanvasElement;
  apiActionSelect: HTMLSelectElement;
  apiMagnitude: HTMLInputElement;
  apiMagnitudeValue: HTMLElement;
  apiSendAction: HTMLButtonElement;
  apiQuickActions: HTMLElement;
  apiTestStatus: HTMLElement;
}

export class Hud {
  private readonly elements: HudElements;

  constructor() {
    this.elements = {
      robotButtons: {
        so101: this.byId<HTMLButtonElement>('robot-so101'),
        lekiwi: this.byId<HTMLButtonElement>('robot-lekiwi'),
      },
      environmentButtons: {
        farm: this.byId<HTMLButtonElement>('env-farm'),
        forest: this.byId<HTMLButtonElement>('env-forest'),
        mars: this.byId<HTMLButtonElement>('env-mars'),
        warehouse: this.byId<HTMLButtonElement>('env-warehouse'),
        lab: this.byId<HTMLButtonElement>('env-lab'),
      },
      spawnButtons: {
        cube: this.byId<HTMLButtonElement>('spawn-cube'),
        sphere: this.byId<HTMLButtonElement>('spawn-sphere'),
        cylinder: this.byId<HTMLButtonElement>('spawn-cylinder'),
      },
      clearButton: this.byId<HTMLButtonElement>('spawn-clear'),
      bridgeStatus: this.byId('bridge-status'),
      jointReadout: this.byId('joint-readout'),
      lastAction: this.byId('last-action'),
      taskStatus: this.byId('task-status'),
      objectCount: this.byId('object-count'),
      fps: this.byId('fps-counter'),
      wristCanvas: this.byId<HTMLCanvasElement>('wrist-cam'),
      apiActionSelect: this.byId<HTMLSelectElement>('api-action-select'),
      apiMagnitude: this.byId<HTMLInputElement>('api-magnitude'),
      apiMagnitudeValue: this.byId('api-magnitude-value'),
      apiSendAction: this.byId<HTMLButtonElement>('api-send-action'),
      apiQuickActions: this.byId('api-quick-actions'),
      apiTestStatus: this.byId('api-test-status'),
    };

    this.elements.apiMagnitude.oninput = () => {
      this.elements.apiMagnitudeValue.textContent = Number(this.elements.apiMagnitude.value).toFixed(2);
    };
  }

  onRobotSwitch(callback: (robotId: RobotId) => void): void {
    this.elements.robotButtons.so101.onclick = () => callback('so101');
    this.elements.robotButtons.lekiwi.onclick = () => callback('lekiwi');
  }

  onEnvironmentSwitch(callback: (environmentId: EnvironmentId) => void): void {
    this.elements.environmentButtons.farm.onclick = () => callback('farm');
    this.elements.environmentButtons.forest.onclick = () => callback('forest');
    this.elements.environmentButtons.mars.onclick = () => callback('mars');
    this.elements.environmentButtons.warehouse.onclick = () => callback('warehouse');
    this.elements.environmentButtons.lab.onclick = () => callback('lab');
  }

  onSpawnObject(callback: (type: SpawnType) => void): void {
    this.elements.spawnButtons.cube.onclick = () => callback('cube');
    this.elements.spawnButtons.sphere.onclick = () => callback('sphere');
    this.elements.spawnButtons.cylinder.onclick = () => callback('cylinder');
  }

  onClearObjects(callback: () => void): void {
    this.elements.clearButton.onclick = callback;
  }

  onApiAction(callback: (actionToken: string, magnitude: number) => void): void {
    this.elements.apiSendAction.onclick = () => {
      const token = this.elements.apiActionSelect.value;
      const magnitude = Number(this.elements.apiMagnitude.value);
      callback(token, magnitude);
    };
  }

  setActiveRobot(robotId: RobotId): void {
    this.toggleButtons(this.elements.robotButtons, robotId);
  }

  setActiveEnvironment(environmentId: EnvironmentId): void {
    this.toggleButtons(this.elements.environmentButtons, environmentId);
  }

  setBridgeConnected(connected: boolean): void {
    this.elements.bridgeStatus.textContent = connected ? '● BRIDGE CONNECTED' : '○ BRIDGE DISCONNECTED';
    this.elements.bridgeStatus.classList.toggle('connected', connected);
  }

  updateJointReadout(joints: Record<string, number>): void {
    this.elements.jointReadout.innerHTML = Object.entries(joints)
      .map(([name, value]) => `<div>${name}: ${value.toFixed(1)}°</div>`)
      .join('');
  }

  updateLastAction(actionToken: string, magnitude: number, timestamp: number): void {
    const time = new Date(timestamp).toLocaleTimeString();
    this.elements.lastAction.textContent = `${actionToken} (${magnitude.toFixed(2)}) @ ${time}`;
  }

  updateTaskStatus(status: TaskStatus): void {
    this.elements.taskStatus.textContent = status.toUpperCase().replace('_', ' ');
  }

  updateObjectCount(count: number): void {
    this.elements.objectCount.textContent = `${count} objects`;
  }

  updateFps(fps: number): void {
    this.elements.fps.textContent = `${fps.toFixed(1)} FPS`;
  }

  setApiActionOptions(tokens: string[], quickActions: string[]): void {
    this.elements.apiActionSelect.innerHTML = '';
    tokens.forEach((token) => {
      const option = document.createElement('option');
      option.value = token;
      option.textContent = token;
      this.elements.apiActionSelect.append(option);
    });

    this.elements.apiQuickActions.innerHTML = '';
    quickActions.forEach((token) => {
      const button = document.createElement('button');
      button.textContent = token;
      button.onclick = () => {
        const magnitude = Number(this.elements.apiMagnitude.value);
        this.elements.apiActionSelect.value = token;
        this.elements.apiSendAction.click();
        this.setApiTestStatus(`Sent ${token} (${magnitude.toFixed(2)})`);
      };
      this.elements.apiQuickActions.append(button);
    });
  }

  setApiTestStatus(message: string): void {
    this.elements.apiTestStatus.textContent = message;
  }

  getWristCanvas(): HTMLCanvasElement {
    return this.elements.wristCanvas;
  }

  private byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing HUD element: ${id}`);
    }
    return element as T;
  }

  private toggleButtons<T extends string>(buttonMap: Record<T, HTMLButtonElement>, active: T): void {
    (Object.keys(buttonMap) as T[]).forEach((key) => {
      buttonMap[key].classList.toggle('active', key === active);
    });
  }
}
