/**
 * TerraScout VLM Evidence Overlay — robot sim variant.
 *
 * Positions a transparent canvas on top of the existing 256×256 wrist-cam
 * canvas and renders the *ground* evidence points returned by the live
 * VLM analysis. Polls the same `/api/runs/active` endpoint as the AI
 * status panel.
 *
 * Pointing convention: Gemini Robotics-ER 1.6 returns each point as
 * `[y, x]` normalized to 0..1000 (its native pointing format). We scale
 * those to the canvas's pixel space.
 */

interface EvidencePoint {
  source: 'aerial' | 'ground';
  point: [number, number]; // [y, x] in 0..1000
  label: string;
}

interface ActiveRunResponse {
  active: boolean;
  status?: string;
  zone_id?: string;
  evidence_points: EvidencePoint[];
}

const BACKEND_BASE = 'http://localhost:8000';
const POLL_INTERVAL_MS = 800;
const OVERLAY_ID = 'terrascout-evidence-overlay';
const BADGE_ID = 'terrascout-evidence-badge';

export class EvidenceOverlay {
  private canvas: HTMLCanvasElement | null = null;
  private badge: HTMLElement | null = null;
  private pollHandle: number | null = null;
  private points: EvidencePoint[] = [];

  attach(): void {
    if (this.canvas) return;

    const wristCam = document.getElementById('wrist-cam') as HTMLCanvasElement | null;
    const wristPanel = document.getElementById('wrist-panel');
    if (!wristCam || !wristPanel) {
      console.warn('[evidence-overlay] wrist-cam canvas not found; skipping mount');
      return;
    }

    // Make the wrist panel a positioning context so the overlay can sit on
    // top of the existing canvas precisely.
    wristPanel.style.position = wristPanel.style.position || 'absolute';

    // Sit the overlay canvas at the same coordinates as #wrist-cam by
    // copying its size and inserting it as a sibling.
    const overlay = document.createElement('canvas');
    overlay.id = OVERLAY_ID;
    overlay.width = wristCam.width;
    overlay.height = wristCam.height;
    overlay.style.position = 'absolute';
    overlay.style.pointerEvents = 'none';
    overlay.style.imageRendering = 'pixelated';
    // Match #wrist-cam visual size (set in style.css to 256x256).
    overlay.style.width = '256px';
    overlay.style.height = '256px';

    // Insert directly after #wrist-cam so it stacks on top.
    wristCam.insertAdjacentElement('afterend', overlay);

    // Manually align — wrist cam is centered in its panel; we mirror its
    // bounding rect on next animation frame so we land exactly on top.
    requestAnimationFrame(() => this.alignToWristCam());
    window.addEventListener('resize', () => this.alignToWristCam());

    this.canvas = overlay;

    // Tiny "VLM POINTED" badge that lights up when the overlay has points.
    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.textContent = 'VLM POINTING';
    badge.style.display = 'none';
    wristPanel.insertAdjacentElement('beforeend', badge);
    this.badge = badge;

    this.startPolling();
  }

  detach(): void {
    if (this.pollHandle !== null) {
      window.clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    if (this.badge) {
      this.badge.remove();
      this.badge = null;
    }
  }

  private alignToWristCam(): void {
    if (!this.canvas) return;
    const wristCam = document.getElementById('wrist-cam') as HTMLCanvasElement | null;
    if (!wristCam) return;
    const rect = wristCam.getBoundingClientRect();
    const parentRect = (this.canvas.parentElement as HTMLElement).getBoundingClientRect();
    this.canvas.style.left = `${rect.left - parentRect.left}px`;
    this.canvas.style.top = `${rect.top - parentRect.top}px`;
  }

  private startPolling(): void {
    const tick = async () => {
      try {
        const resp = await fetch(`${BACKEND_BASE}/api/runs/active`, {
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const payload = (await resp.json()) as ActiveRunResponse;
          this.points = (payload.evidence_points || []).filter(
            (p) => p.source === 'ground',
          );
        } else {
          this.points = [];
        }
      } catch (_err) {
        this.points = [];
      }
      this.draw();
      this.pollHandle = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  }

  private draw(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);

    if (this.points.length === 0) {
      if (this.badge) this.badge.style.display = 'none';
      return;
    }

    if (this.badge) this.badge.style.display = '';

    const t = Date.now() / 350;
    for (const ep of this.points) {
      const [y01, x01] = ep.point; // [y, x] in 0..1000
      const x = (x01 / 1000) * w;
      const y = (y01 / 1000) * h;

      // Pulsing outer halo
      const halo = 8 + Math.sin(t) * 2;
      ctx.beginPath();
      ctx.arc(x, y, halo + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 90, 90, 0.18)';
      ctx.fill();

      // Inner ring
      ctx.beginPath();
      ctx.arc(x, y, halo, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe9e9';
      ctx.fill();

      // Label tag (truncate long labels)
      if (ep.label) {
        const label = ep.label.length > 22 ? ep.label.slice(0, 22) + '…' : ep.label;
        ctx.font = 'bold 9px "Space Mono", monospace';
        const padX = 4;
        const padY = 3;
        const tw = ctx.measureText(label).width + padX * 2;
        const th = 9 + padY * 2;
        let tx = x + halo + 4;
        let ty = y - th / 2;
        // Keep label inside the frame.
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

    // Continue animating the pulse even when no new points arrive between polls.
    requestAnimationFrame(() => this.draw());
  }
}

let singleton: EvidenceOverlay | null = null;
export function attachEvidenceOverlay(): EvidenceOverlay {
  if (!singleton) {
    singleton = new EvidenceOverlay();
    singleton.attach();
  }
  return singleton;
}
