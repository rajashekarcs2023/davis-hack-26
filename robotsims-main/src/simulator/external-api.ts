import type { RobotId } from '../robots/so101';
import type { TaskStatus } from './hud';
import type { ObjectState } from './object-spawner';

export interface RobotSimState {
  type: 'state';
  robot: RobotId;
  joints: Record<string, number>;
  base_pose: { x: number; y: number; theta: number } | null;
  task_status: TaskStatus;
  objects: ObjectState[];
  timestamp: number;
}

interface ActionMessage {
  type: 'action';
  action: string;
  magnitude: number;
}

interface FrameStreamMessage {
  type: 'set_frame_stream';
  fps: number;
}

interface ExternalApiConfig {
  getState: () => RobotSimState;
  onAction: (action: string, magnitude: number) => void;
  getFrame: () => string;
  onConnectionChange: (connected: boolean) => void;
}

export class ExternalApiClient {
  private readonly config: ExternalApiConfig;
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private stateTimer: number | null = null;
  private frameTimer: number | null = null;

  constructor(config: ExternalApiConfig) {
    this.config = config;
  }

  init(): void {
    this.connect();
    this.stateTimer = window.setInterval(() => this.broadcastState(), 100);
  }

  dispose(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stateTimer !== null) {
      window.clearInterval(this.stateTimer);
      this.stateTimer = null;
    }
    this.setFrameStream(0);
    this.ws?.close();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket('ws://localhost:8765');
    } catch (error) {
      console.warn('[RobotSim API] Failed to create WebSocket', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[RobotSim API] Connected to bridge');
      this.config.onConnectionChange(true);
    };

    this.ws.onclose = () => {
      this.config.onConnectionChange(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = (event) => {
      console.warn('[RobotSim API] WebSocket error', event);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as ActionMessage | FrameStreamMessage;
        if (payload.type === 'action' && typeof payload.action === 'string' && typeof payload.magnitude === 'number') {
          this.config.onAction(payload.action, payload.magnitude);
          return;
        }
        if (payload.type === 'set_frame_stream' && typeof payload.fps === 'number') {
          this.setFrameStream(payload.fps);
        }
      } catch (error) {
        console.warn('[RobotSim API] Invalid message payload', error);
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private broadcastState(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.ws.send(JSON.stringify(this.config.getState()));
    } catch (error) {
      console.warn('[RobotSim API] Failed to send state', error);
    }
  }

  private setFrameStream(fps: number): void {
    if (this.frameTimer !== null) {
      window.clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    const capped = Math.max(0, Math.min(10, Math.floor(fps)));
    if (capped === 0) {
      return;
    }
    this.frameTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        this.ws.send(
          JSON.stringify({
            type: 'frame',
            data: this.config.getFrame(),
            timestamp: Date.now(),
          }),
        );
      } catch (error) {
        console.warn('[RobotSim API] Failed to send frame', error);
      }
    }, Math.floor(1000 / capped));
  }
}
