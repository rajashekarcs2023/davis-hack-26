/**
 * TerraScout AI Status Panel — robot sim variant.
 *
 * Mirrors the drone sim's panel: polls `/api/runs/active` and renders a
 * top-center HUD strip showing the agent's current status, target zone,
 * tool-call chip stream, and action-token chip stream. Lets a judge looking
 * at the LeKiwi sim window see the whole pipeline in real time.
 */

interface ToolChip {
  name: string;
  summary?: string | null;
  ok?: boolean;
}

interface ActionChip {
  kind: 'drone' | 'robot';
  action: string;
  magnitude: number;
}

interface ActiveRunResponse {
  active: boolean;
  run_id?: string;
  zone_id?: string;
  status?: string;
  outcome?: string | null;
  tool_chips: ToolChip[];
  actions: ActionChip[];
}

const BACKEND_BASE = 'http://localhost:8000';
const POLL_INTERVAL_MS = 750;
const PANEL_ID = 'terrascout-ai-status-panel';

// Which tools belong on the ROBOT sim's HUD. Tools not in this set are
// filtered out so the judge looking at the robot sim doesn't see drone-only
// noise like `dispatch_drone_to_zone` / `vlm_analyze_aerial`.
//
// Includes:
//   - planning tools that lead up to the robot dispatch (so the judge
//     sees the full reasoning chain that ended with "deploy me")
//   - the robot dispatch + 4 diagnostic tools (the actual robot work)
//   - create_work_order (the conclusion)
//
// Excludes drone-only tools so the robot HUD only ever shows tools whose
// outputs actually informed the robot's behavior.
const ROBOT_RELEVANT_TOOLS = new Set<string>([
  'fetch_risk_signal',
  'fetch_anomaly',
  'draft_inspection_plan',
  'request_human_approval',
  'dispatch_ground_robot',
  'inspect_leaf_with_wrist',
  'compare_healthy_plant',
  'probe_soil_moisture',
  'place_pest_marker',
  'create_work_order',
]);

const STATUS_TONE: Record<string, { label: string; tone: string }> = {
  pending: { label: 'PENDING', tone: 'pending' },
  planning: { label: 'PLANNING', tone: 'planning' },
  awaiting_approval: { label: 'AWAITING APPROVAL', tone: 'await' },
  executing: { label: 'EXECUTING', tone: 'exec' },
  completed: { label: 'COMPLETED', tone: 'ok' },
  rejected: { label: 'REJECTED', tone: 'reject' },
  failed: { label: 'FAILED', tone: 'reject' },
  idle: { label: 'AWAITING DEMO RUN', tone: 'idle' },
};

export class AiStatusPanel {
  private panel: HTMLElement | null = null;
  private statusBadge: HTMLElement | null = null;
  private zoneLabel: HTMLElement | null = null;
  private toolChipsHost: HTMLElement | null = null;
  private actionChipsHost: HTMLElement | null = null;
  private pollHandle: number | null = null;
  private lastPayload: ActiveRunResponse | null = null;

  attach(): void {
    if (this.panel) return;

    const panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ts-row">
        <span class="ts-brand">TerraScout AI</span>
        <span class="ts-status idle" data-role="status">AWAITING DEMO RUN</span>
        <span class="ts-zone" data-role="zone">—</span>
      </div>
      <div class="ts-row ts-tools" data-role="tools">
        <span class="ts-row-label">tools</span>
      </div>
      <div class="ts-row ts-actions" data-role="actions">
        <span class="ts-row-label">action tokens</span>
      </div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    this.statusBadge = panel.querySelector('[data-role="status"]') as HTMLElement;
    this.zoneLabel = panel.querySelector('[data-role="zone"]') as HTMLElement;
    this.toolChipsHost = panel.querySelector('[data-role="tools"]') as HTMLElement;
    this.actionChipsHost = panel.querySelector('[data-role="actions"]') as HTMLElement;

    this.startPolling();
  }

  detach(): void {
    if (this.pollHandle !== null) {
      window.clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }

  private startPolling(): void {
    const tick = async () => {
      try {
        const resp = await fetch(`${BACKEND_BASE}/api/runs/active`, {
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const payload = (await resp.json()) as ActiveRunResponse;
          this.render(payload);
        } else {
          this.renderError(`backend ${resp.status}`);
        }
      } catch (_err) {
        this.renderError('backend unreachable');
      }
      this.pollHandle = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  }

  private renderError(msg: string): void {
    if (!this.statusBadge) return;
    this.statusBadge.textContent = msg.toUpperCase();
    this.statusBadge.className = 'ts-status reject';
    if (this.zoneLabel) this.zoneLabel.textContent = '—';
  }

  private render(payload: ActiveRunResponse): void {
    if (!this.statusBadge || !this.zoneLabel || !this.toolChipsHost || !this.actionChipsHost) {
      return;
    }
    this.lastPayload = payload;

    const statusKey = payload.active ? (payload.status ?? 'planning') : 'idle';
    const tone = STATUS_TONE[statusKey] ?? STATUS_TONE.planning;
    this.statusBadge.textContent = tone.label;
    this.statusBadge.className = `ts-status ${tone.tone}`;

    this.zoneLabel.textContent = payload.zone_id ? `Zone ${payload.zone_id}` : '—';

    // Filter tools to robot-relevant ones (skip drone-only noise like
    // dispatch_drone_to_zone / vlm_analyze_aerial on this sim's HUD).
    const robotTools = payload.tool_chips.filter((tc) =>
      ROBOT_RELEVANT_TOOLS.has(tc.name),
    );

    this.toolChipsHost.innerHTML = '<span class="ts-row-label">tools</span>';
    if (robotTools.length === 0) {
      const ghost = document.createElement('span');
      ghost.className = 'ts-chip ts-chip-ghost';
      ghost.textContent = 'idle';
      this.toolChipsHost.appendChild(ghost);
    } else {
      for (const tc of robotTools) {
        const chip = document.createElement('span');
        chip.className = `ts-chip ts-chip-tool ${tc.ok === false ? 'fail' : ''}`;
        chip.textContent = tc.name;
        if (tc.summary) chip.title = tc.summary;
        this.toolChipsHost.appendChild(chip);
      }
    }

    // Filter actions to robot-only (drone descend/ascend/forward etc.
    // were leaking onto this sim's HUD, which was confusing — the robot
    // doesn't have a `descend` action). Backend already tags each action
    // with kind: 'drone' | 'robot'; we just respect that here.
    const robotActions = payload.actions.filter((a) => a.kind === 'robot');

    this.actionChipsHost.innerHTML = '<span class="ts-row-label">action tokens</span>';
    if (robotActions.length === 0) {
      const ghost = document.createElement('span');
      ghost.className = 'ts-chip ts-chip-ghost';
      ghost.textContent = 'no actions yet';
      this.actionChipsHost.appendChild(ghost);
    } else {
      for (const a of robotActions) {
        const chip = document.createElement('span');
        chip.className = `ts-chip ts-chip-${a.kind}`;
        chip.textContent = `${a.action} ${a.magnitude.toFixed(2)}`;
        this.actionChipsHost.appendChild(chip);
      }
    }
  }

  getLastPayload(): ActiveRunResponse | null {
    return this.lastPayload;
  }
}

let singleton: AiStatusPanel | null = null;
export function attachAiStatusPanel(): AiStatusPanel {
  if (!singleton) {
    singleton = new AiStatusPanel();
    singleton.attach();
  }
  return singleton;
}
