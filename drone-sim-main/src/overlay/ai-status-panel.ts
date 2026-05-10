/**
 * TerraScout AI Status Panel — drone sim variant.
 *
 * Polls the backend's `/api/runs/active` endpoint and renders a top-center
 * HUD strip showing:
 *   • Current run status badge (PLANNING / AWAITING_APPROVAL / EXECUTING / …)
 *   • Target zone
 *   • A tool-call chip stream (last few agent tools)
 *   • An action-token chip stream (last few drone/robot actions in the plan)
 *   • Run-control buttons (Autonomous / With Approval) so the demo can be
 *     driven from the sim UI while the farmer-approval frontend is still
 *     being built.
 *   • An inline Approve / Reject row that lights up when a With-Approval
 *     run reaches AWAITING_APPROVAL.
 *
 * Designed to be safe to mount before any run exists — when no run is active,
 * it renders a faded "Awaiting demo run" state.
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
  // evidence_points handled separately by Phase 3 overlay
}

type RunMode = 'autonomous' | 'approval';

const DEMO_ZONE_ID = 'B3';

const BACKEND_BASE = 'http://localhost:8000';
const POLL_INTERVAL_MS = 750;
const PANEL_ID = 'terrascout-ai-status-panel';

// Which tools belong on the DRONE sim's HUD. Excludes the 4 ground-robot
// diagnostic tools so the judge looking at the drone sim doesn't see
// inspect_leaf_with_wrist / probe_soil_moisture / etc. — those have nothing
// to do with the drone and would confuse the demo narrative.
const DRONE_RELEVANT_TOOLS = new Set<string>([
  'fetch_risk_signal',
  'fetch_anomaly',
  'draft_inspection_plan',
  'dispatch_drone_to_zone',
  'vlm_analyze_aerial',
  'request_human_approval',
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

  // Run-control state
  private launchRow: HTMLElement | null = null;
  private approvalRow: HTMLElement | null = null;
  private launchNote: HTMLElement | null = null;
  private btnAuto: HTMLButtonElement | null = null;
  private btnApproval: HTMLButtonElement | null = null;
  private btnApprove: HTMLButtonElement | null = null;
  private btnReject: HTMLButtonElement | null = null;
  /** 'autonomous' while an auto-approve run is in flight, 'approval' for human-gated, null when idle. */
  private currentMode: RunMode | null = null;
  /** run_id we auto-approved this cycle — guard to prevent double-sending. */
  private approvedRunIds = new Set<string>();
  private launching = false;

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
      <div class="ts-row ts-launch" data-role="launch">
        <span class="ts-row-label">launch</span>
        <button type="button" class="ts-btn ts-btn-auto" data-role="btn-auto">▶ Autonomous</button>
        <button type="button" class="ts-btn ts-btn-approval" data-role="btn-approval">▶ With Approval</button>
        <span class="ts-launch-note" data-role="launch-note">Zone ${DEMO_ZONE_ID} · full agent run</span>
      </div>
      <div class="ts-row ts-approve" data-role="approval" style="display: none;">
        <span class="ts-row-label">farmer gate</span>
        <button type="button" class="ts-btn ts-btn-approve" data-role="btn-approve">✓ Approve</button>
        <button type="button" class="ts-btn ts-btn-reject" data-role="btn-reject">✗ Reject</button>
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
    this.launchRow = panel.querySelector('[data-role="launch"]') as HTMLElement;
    this.approvalRow = panel.querySelector('[data-role="approval"]') as HTMLElement;
    this.launchNote = panel.querySelector('[data-role="launch-note"]') as HTMLElement;
    this.btnAuto = panel.querySelector('[data-role="btn-auto"]') as HTMLButtonElement;
    this.btnApproval = panel.querySelector('[data-role="btn-approval"]') as HTMLButtonElement;
    this.btnApprove = panel.querySelector('[data-role="btn-approve"]') as HTMLButtonElement;
    this.btnReject = panel.querySelector('[data-role="btn-reject"]') as HTMLButtonElement;

    this.btnAuto!.addEventListener('click', () => this.launchRun('autonomous'));
    this.btnApproval!.addEventListener('click', () => this.launchRun('approval'));
    this.btnApprove!.addEventListener('click', () => this.sendApproval(true));
    this.btnReject!.addEventListener('click', () => this.sendApproval(false));

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

    this.updateRunControls(payload, statusKey);

    // Tool chips — filter to drone-relevant only so robot tools like
    // inspect_leaf_with_wrist / probe_soil_moisture don't pollute the
    // drone sim's HUD.
    const droneTools = payload.tool_chips.filter((tc) =>
      DRONE_RELEVANT_TOOLS.has(tc.name),
    );
    this.toolChipsHost.innerHTML = '<span class="ts-row-label">tools</span>';
    if (droneTools.length === 0) {
      const ghost = document.createElement('span');
      ghost.className = 'ts-chip ts-chip-ghost';
      ghost.textContent = 'idle';
      this.toolChipsHost.appendChild(ghost);
    } else {
      for (const tc of droneTools) {
        const chip = document.createElement('span');
        chip.className = `ts-chip ts-chip-tool ${tc.ok === false ? 'fail' : ''}`;
        chip.textContent = tc.name;
        if (tc.summary) chip.title = tc.summary;
        this.toolChipsHost.appendChild(chip);
      }
    }

    // Action chips — drone-only. Robot diagnostic actions (shoulder_up,
    // wrist_pitch, etc.) don't belong on the drone HUD.
    const droneActions = payload.actions.filter((a) => a.kind === 'drone');
    this.actionChipsHost.innerHTML = '<span class="ts-row-label">action tokens</span>';
    if (droneActions.length === 0) {
      const ghost = document.createElement('span');
      ghost.className = 'ts-chip ts-chip-ghost';
      ghost.textContent = 'no actions yet';
      this.actionChipsHost.appendChild(ghost);
    } else {
      for (const a of droneActions) {
        const chip = document.createElement('span');
        chip.className = `ts-chip ts-chip-${a.kind}`;
        chip.textContent = `${a.action} ${a.magnitude.toFixed(2)}`;
        this.actionChipsHost.appendChild(chip);
      }
    }
  }

  /** Read-only snapshot of the most recent payload (used by Phase 3 evidence overlay). */
  getLastPayload(): ActiveRunResponse | null {
    return this.lastPayload;
  }

  // ─── Run-control ───────────────────────────────────────────────────────

  /**
   * Kick off a new agent run on the demo zone (B3).
   *
   *   autonomous → auto-approves as soon as the run hits AWAITING_APPROVAL
   *   approval   → surfaces Approve/Reject buttons and waits for the user
   *
   * Before firing the backend call we also click the existing "FLY TO B3"
   * button so the drone snaps to a clear top-of-field vantage (north of B3
   * facing south). That positions the viewer.canvas frame the backend VLM
   * reads on the /api/drone/frame endpoint — otherwise the VLM gets the
   * user's chase view looking mostly at sky, and reports "no crop visible".
   */
  private async launchRun(mode: RunMode): Promise<void> {
    if (this.launching) return;
    if (this.lastPayload?.active) {
      this.flashLaunchNote('A run is already in progress.');
      return;
    }
    this.launching = true;
    this.currentMode = mode;
    this.setLaunchButtonsEnabled(false);
    this.flashLaunchNote(
      mode === 'autonomous'
        ? `Launching autonomous run on Zone ${DEMO_ZONE_ID}…`
        : `Launching human-approval run on Zone ${DEMO_ZONE_ID}…`,
    );

    // Step 1: pre-position the drone over B3 so the canvas frame the backend
    // VLM reads actually contains crops. We reuse the Field Status panel's
    // FLY TO B3 button instead of wiring a second teleport path.
    const flyBtn = document.getElementById('incident-teleport-btn') as HTMLButtonElement | null;
    if (flyBtn) {
      flyBtn.click();
      // Give Cesium a couple of render ticks to paint the new view before
      // the backend snapshots the canvas for VLM analysis.
      await new Promise((r) => setTimeout(r, 800));
    }

    // Step 2: fire the backend run.
    try {
      const resp = await fetch(
        `${BACKEND_BASE}/api/runs?zone_id=${DEMO_ZONE_ID}`,
        { method: 'POST', headers: { Accept: 'application/json' } },
      );
      if (!resp.ok) {
        throw new Error(`POST /api/runs failed: ${resp.status}`);
      }
      // Fire-and-forget; the poll loop will pick the run up within ~750ms.
    } catch (err) {
      console.error('[ai-status-panel] launchRun error', err);
      this.flashLaunchNote('Failed to start run — is the backend up?');
      this.currentMode = null;
      this.setLaunchButtonsEnabled(true);
    } finally {
      this.launching = false;
    }
  }

  /** Send an approval decision for the currently-active run. */
  private async sendApproval(approved: boolean): Promise<void> {
    const runId = this.lastPayload?.run_id;
    if (!runId) {
      this.flashLaunchNote('No active run to approve.');
      return;
    }
    if (this.approvedRunIds.has(runId)) return; // already handled this run
    this.approvedRunIds.add(runId);
    this.setApprovalButtonsEnabled(false);

    try {
      const resp = await fetch(`${BACKEND_BASE}/api/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ run_id: runId, approved }),
      });
      if (!resp.ok) {
        throw new Error(`POST /api/approve failed: ${resp.status}`);
      }
      this.flashLaunchNote(
        approved
          ? 'Approved — dispatching drone and robot.'
          : 'Rejected — run will wind down.',
      );
    } catch (err) {
      console.error('[ai-status-panel] sendApproval error', err);
      this.flashLaunchNote('Approval request failed — retrying allowed.');
      this.approvedRunIds.delete(runId); // allow retry
      this.setApprovalButtonsEnabled(true);
    }
  }

  /** Show / hide / enable launch + approval controls based on the run state. */
  private updateRunControls(payload: ActiveRunResponse, statusKey: string): void {
    if (!this.launchRow || !this.approvalRow) return;

    const isActive = !!payload.active;
    const runId = payload.run_id;

    // Launch buttons: visible only when no run is running.
    this.setLaunchButtonsEnabled(!isActive);

    // Approval row: visible when AWAITING_APPROVAL — but ONLY in human-approval
    // mode. In autonomous mode the row would flash for one poll cycle before
    // we auto-approve, which is confusing ("why did the gate just open?").
    const awaiting = statusKey === 'awaiting_approval';
    const showApprovalUI = awaiting && this.currentMode !== 'autonomous';
    this.approvalRow.style.display = showApprovalUI ? '' : 'none';
    if (showApprovalUI) {
      this.setApprovalButtonsEnabled(!!runId && !this.approvedRunIds.has(runId));
    }

    // Autonomous mode: auto-fire approval exactly once per run, silently.
    if (
      awaiting &&
      this.currentMode === 'autonomous' &&
      runId &&
      !this.approvedRunIds.has(runId)
    ) {
      this.sendApproval(true);
    }

    // Clear mode + approved guard ONLY on a true terminal state.
    //
    // We deliberately do NOT clear on `!isActive` because there is a poll-cycle
    // gap (~750ms) between launchRun() firing POST /api/runs and the backend
    // upserting the new run into the store. During that gap /api/runs/active
    // still returns active=false, and clearing currentMode there would cause
    // an autonomous run to flash the approval UI for one cycle the moment
    // the run finally reaches AWAITING_APPROVAL.
    if (['completed', 'rejected', 'failed'].includes(statusKey)) {
      this.currentMode = null;
      // don't clear approvedRunIds — they're cheap and prevent re-approving
      // a run that momentarily flips active=false then back on reload.
    }
  }

  private setLaunchButtonsEnabled(enabled: boolean): void {
    if (this.btnAuto) this.btnAuto.disabled = !enabled;
    if (this.btnApproval) this.btnApproval.disabled = !enabled;
  }

  private setApprovalButtonsEnabled(enabled: boolean): void {
    if (this.btnApprove) this.btnApprove.disabled = !enabled;
    if (this.btnReject) this.btnReject.disabled = !enabled;
  }

  private flashLaunchNote(msg: string): void {
    if (!this.launchNote) return;
    this.launchNote.textContent = msg;
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
