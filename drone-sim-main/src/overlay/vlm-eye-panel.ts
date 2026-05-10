/**
 * TerraScout VLM Eye Panel — drone sim.
 *
 * A dedicated HUD panel that shows two things side-by-side with the rest of
 * the demo:
 *   1. The latest *aerial* JPEG frame (fetched from the backend's frame
 *      cache, which already maintains an SSE subscription to the drone sim).
 *   2. A canvas overlay drawing the *aerial* evidence points the VLM
 *      pointed at on its most recent analysis.
 *
 * This is the prize-multiplier moment: a judge looking at the drone sim
 * window literally sees "the AI saw THIS frame and pointed HERE" without
 * having to alt-tab to the React frontend.
 */

interface EvidencePoint {
  source: 'aerial' | 'ground';
  point: [number, number]; // [y, x] in 0..1000
  label: string;
}

interface ActiveRunResponse {
  active: boolean;
  evidence_points: EvidencePoint[];
}

interface DroneFrameResponse {
  available: boolean;
  data_url: string | null;
}

const BACKEND_BASE = 'http://localhost:8000';
const FRAME_POLL_MS = 1000;
const RUN_POLL_MS = 750;
const PANEL_ID = 'terrascout-vlm-eye-panel';
const FRAME_PX = 280;

export class VlmEyePanel {
  private panel: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private statusEl: HTMLElement | null = null;
  private framePollHandle: number | null = null;
  private runPollHandle: number | null = null;
  private points: EvidencePoint[] = [];
  private rafHandle: number | null = null;

  attach(): void {
    if (this.panel) return;

    const panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ts-eye-header">
        <span class="ts-eye-brand">VLM Eye</span>
        <span class="ts-eye-status" data-role="status">awaiting frame…</span>
      </div>
      <div class="ts-eye-frame">
        <img class="ts-eye-img" data-role="img" alt="Latest drone aerial frame" />
        <canvas class="ts-eye-canvas" data-role="canvas" width="${FRAME_PX}" height="${FRAME_PX}"></canvas>
      </div>
      <div class="ts-eye-footnote">aerial frame · live · pointed evidence overlay</div>
    `;
    document.body.appendChild(panel);

    this.panel = panel;
    this.img = panel.querySelector('[data-role="img"]') as HTMLImageElement;
    this.canvas = panel.querySelector('[data-role="canvas"]') as HTMLCanvasElement;
    this.statusEl = panel.querySelector('[data-role="status"]') as HTMLElement;

    this.startFramePoll();
    this.startRunPoll();
    this.scheduleDraw();
  }

  detach(): void {
    if (this.framePollHandle !== null) window.clearTimeout(this.framePollHandle);
    if (this.runPollHandle !== null) window.clearTimeout(this.runPollHandle);
    if (this.rafHandle !== null) window.cancelAnimationFrame(this.rafHandle);
    this.framePollHandle = null;
    this.runPollHandle = null;
    this.rafHandle = null;
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }

  private startFramePoll(): void {
    const tick = async () => {
      try {
        const resp = await fetch(`${BACKEND_BASE}/api/drone/frame`, {
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const payload = (await resp.json()) as DroneFrameResponse;
          if (payload.available && payload.data_url && this.img) {
            this.img.src = payload.data_url;
            if (this.statusEl) this.statusEl.textContent = 'live';
          } else if (this.statusEl) {
            this.statusEl.textContent = 'no frame';
          }
        } else if (this.statusEl) {
          this.statusEl.textContent = `backend ${resp.status}`;
        }
      } catch (_err) {
        if (this.statusEl) this.statusEl.textContent = 'backend unreachable';
      }
      this.framePollHandle = window.setTimeout(tick, FRAME_POLL_MS);
    };
    tick();
  }

  private startRunPoll(): void {
    const tick = async () => {
      try {
        const resp = await fetch(`${BACKEND_BASE}/api/runs/active`, {
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const payload = (await resp.json()) as ActiveRunResponse;
          this.points = (payload.evidence_points || []).filter(
            (p) => p.source === 'aerial',
          );
        } else {
          this.points = [];
        }
      } catch (_err) {
        // keep last known points on transient errors
      }
      this.runPollHandle = window.setTimeout(tick, RUN_POLL_MS);
    };
    tick();
  }

  private scheduleDraw(): void {
    const draw = () => {
      this.draw();
      this.rafHandle = window.requestAnimationFrame(draw);
    };
    draw();
  }

  private draw(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.points.length === 0) return;

    const t = Date.now() / 350;
    for (const ep of this.points) {
      const [y01, x01] = ep.point; // [y, x] in 0..1000
      const x = (x01 / 1000) * w;
      const y = (y01 / 1000) * h;

      const halo = 10 + Math.sin(t) * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, halo + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 90, 90, 0.18)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, halo, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe9e9';
      ctx.fill();

      if (ep.label) {
        const label = ep.label.length > 24 ? ep.label.slice(0, 24) + '…' : ep.label;
        ctx.font = 'bold 11px "Space Mono", monospace';
        const padX = 5;
        const padY = 3;
        const tw = ctx.measureText(label).width + padX * 2;
        const th = 11 + padY * 2;
        let tx = x + halo + 4;
        let ty = y - th / 2;
        if (tx + tw > w) tx = x - halo - 4 - tw;
        if (ty < 0) ty = 0;
        if (ty + th > h) ty = h - th;

        ctx.fillStyle = 'rgba(50, 0, 0, 0.85)';
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
        ctx.fillStyle = '#ffe9e9';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tx + padX, ty + th / 2);
      }
    }
  }
}

let singleton: VlmEyePanel | null = null;
export function attachVlmEyePanel(): VlmEyePanel {
  if (!singleton) {
    singleton = new VlmEyePanel();
    singleton.attach();
  }
  return singleton;
}
