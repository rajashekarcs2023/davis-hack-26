type ActionName =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "ascend"
  | "descend"
  | "rotate_cw"
  | "rotate_ccw"
  | "reset";

type ActionMessage = {
  type: "action";
  action: ActionName;
  magnitude?: number;
};

type FrameStreamMessage = {
  type: "set_frame_stream";
  fps?: number;
};

type OutboundState = {
  lat: number;
  lon: number;
  altAgl: number;
  altMsl: number;
  heading: number;
  speed: number;
  timestamp: number;
};

type DACSimAPIDebug = {
  sendAction: (action: ActionName, magnitude?: number) => void;
  getState: () => OutboundState;
  setFrameStream: (active: boolean, intervalMs?: number) => void;
};

const BRIDGE_URL = "ws://localhost:8768";
const RECONNECT_MS = 5000;
const STATE_PUSH_MS = 100;
const MAX_FRAME_FPS = 10;
const FRAME_JPEG_QUALITY = 0.7;

// Maps movement actions to keyboard codes injected into the sim's keyState.
// `reset` is intentionally NOT here — it's a special non-key action handled
// by calling the resetPosition callback directly (no magnitude / duration).
const ACTION_KEY_MAP: Record<Exclude<ActionName, "reset">, string> = {
  forward: "ArrowUp",
  backward: "ArrowDown",
  left: "KeyA",
  right: "KeyD",
  ascend: "KeyW",
  descend: "KeyS",
  rotate_cw: "ArrowRight",
  rotate_ccw: "ArrowLeft",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function initExternalAPI(
  viewer: any,
  _drone: any,
  keyState: Set<string>,
  getState: () => OutboundState,
  onReset?: () => void,
): void {
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stateInterval: number | null = null;
  let frameInterval: number | null = null;
  let activeActionKey: string | null = null;
  let activeActionTimer: number | null = null;

  function clearActiveAction(): void {
    if (activeActionTimer !== null) {
      window.clearTimeout(activeActionTimer);
      activeActionTimer = null;
    }
    if (activeActionKey) {
      keyState.delete(activeActionKey);
      activeActionKey = null;
    }
  }

  function sendJson(payload: Record<string, unknown>): void {
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(payload));
    } catch (error) {
      console.warn("[DACSim API] Failed to send payload:", error);
    }
  }

  function setFrameStreamActive(active: boolean, intervalMs = 500): void {
    try {
      if (frameInterval !== null) {
        window.clearInterval(frameInterval);
        frameInterval = null;
      }

      if (!active) {
        return;
      }

      const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0
        ? intervalMs
        : 500;
      const minIntervalMs = 1000 / MAX_FRAME_FPS;
      const effectiveIntervalMs = Math.max(minIntervalMs, safeIntervalMs);

      frameInterval = window.setInterval(() => {
        try {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const dataUrl = viewer?.canvas?.toDataURL?.("image/jpeg", FRAME_JPEG_QUALITY);
          if (typeof dataUrl !== "string") return;
          const commaIndex = dataUrl.indexOf(",");
          const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
          sendJson({
            type: "frame",
            data: base64,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.warn("[DACSim API] Failed to capture frame:", error);
        }
      }, effectiveIntervalMs);
    } catch (error) {
      console.warn("[DACSim API] Failed to toggle frame stream:", error);
    }
  }

  function handleAction(action: ActionName, rawMagnitude?: number): void {
    try {
      clearActiveAction();

      // Special: `reset` teleports the drone back to the spawn launch pad
      // (~8 m AGL). No magnitude / duration — the position change is
      // instantaneous. Used by the backend to ensure every dispatch starts
      // with the drone grounded so the takeoff beat is visible regardless
      // of where the previous run left it.
      if (action === "reset") {
        if (onReset) {
          onReset();
        } else {
          console.warn("[DACSim API] reset received but no onReset callback wired");
        }
        return;
      }

      const keyCode = ACTION_KEY_MAP[action];
      if (!keyCode) return;
      const magnitude = clamp01(typeof rawMagnitude === "number" ? rawMagnitude : 0);
      let durationMs = magnitude * 2000;
      if (action === "rotate_cw" || action === "rotate_ccw") {
        durationMs = (magnitude * 180 / 90) * 1000;
      }

      keyState.add(keyCode);
      activeActionKey = keyCode;
      activeActionTimer = window.setTimeout(() => {
        if (activeActionKey === keyCode) {
          keyState.delete(keyCode);
          activeActionKey = null;
          activeActionTimer = null;
        }
      }, Math.max(0, durationMs));
    } catch (error) {
      console.warn("[DACSim API] Failed to apply action:", error);
    }
  }

  function onMessage(event: MessageEvent<string>): void {
    try {
      const parsed = safeJsonParse(event.data);
      if (!parsed || typeof parsed !== "object") return;
      const message = parsed as Record<string, unknown>;

      if (message.type === "action" && typeof message.action === "string") {
        handleAction(message.action as ActionName, message.magnitude as number | undefined);
        return;
      }

      if (message.type === "set_frame_stream") {
        const fps = Number(message.fps);
        if (!Number.isFinite(fps) || fps <= 0) {
          setFrameStreamActive(false);
          return;
        }
        const cappedFps = Math.min(MAX_FRAME_FPS, Math.max(0, fps));
        setFrameStreamActive(true, 1000 / cappedFps);
      }
    } catch (error) {
      console.warn("[DACSim API] Failed to process message:", error);
    }
  }

  function startStateBroadcast(): void {
    if (stateInterval !== null) return;
    stateInterval = window.setInterval(() => {
      try {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        sendJson({
          type: "state",
          ...getState(),
        });
      } catch (error) {
        console.warn("[DACSim API] Failed to broadcast state:", error);
      }
    }, STATE_PUSH_MS);
  }

  function scheduleReconnect(): void {
    if (reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  function connect(): void {
    try {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      ws = new WebSocket(BRIDGE_URL);

      ws.onopen = () => {
        console.log("[DACSim API] Connected to bridge");
      };

      ws.onmessage = onMessage;

      ws.onerror = () => {
        console.warn("[DACSim API] Bridge unavailable");
      };

      ws.onclose = () => {
        setFrameStreamActive(false);
        clearActiveAction();
        scheduleReconnect();
      };
    } catch (error) {
      console.warn("[DACSim API] Connection attempt failed:", error);
      scheduleReconnect();
    }
  }

  const debugApi: DACSimAPIDebug = {
    sendAction: (action, magnitude = 1.0) => handleAction(action, magnitude),
    getState,
    setFrameStream: (active, intervalMs = 500) => setFrameStreamActive(active, intervalMs),
  };

  (window as Window & { DACSimAPI?: DACSimAPIDebug }).DACSimAPI = debugApi;
  startStateBroadcast();
  connect();
}
