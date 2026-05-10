export type HudElements = {
  speed: HTMLElement;
  altitudeAgl: HTMLElement;
  altitudeMsl: HTMLElement;
  heading: HTMLElement | null;
  attitude: HTMLElement | null;
  position: HTMLElement | null;
  datasetStatus: HTMLElement;
  flightStatus: HTMLElement;
};

export type FpvOverlayElements = {
  overlay: HTMLDivElement;
  altitude: HTMLSpanElement;
  speed: HTMLSpanElement;
};

function getRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Expected element with id "${id}" to exist.`);
  }
  return element;
}

export function getHudElements(): HudElements {
  return {
    speed: getRequiredElement("hud-speed"),
    altitudeAgl: getRequiredElement("hud-altitude-agl"),
    altitudeMsl: getRequiredElement("hud-altitude-msl"),
    heading: document.getElementById("hud-heading"),
    attitude: document.getElementById("hud-attitude"),
    position: document.getElementById("hud-position"),
    datasetStatus: getRequiredElement("dataset-status"),
    flightStatus: getRequiredElement("flight-status"),
  };
}

export function setFlightStatus(
  hud: HudElements,
  text: string,
  isWarning: boolean,
): void {
  hud.flightStatus.textContent = text;
  hud.flightStatus.style.color = isWarning ? "#ffd36f" : "#d9ecff";
}

export function updateSpeedTierHud(
  speedTierIndex: number,
  speedMultiplier: number,
  speedTiers: number[],
): void {
  const valueElement = document.getElementById("hud-speed-tier");
  if (valueElement) {
    valueElement.textContent = `${speedMultiplier}x`;
  }

  speedTiers.forEach((tier, index) => {
    const button = document.getElementById(`speed-btn-${tier}`);
    if (button) {
      button.classList.toggle("active", index === speedTierIndex);
    }
  });
}

export function createCloudFogOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = "cloud-fog-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.15s ease;
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(220, 225, 235, 0.97) 0%,
      rgba(195, 205, 220, 0.93) 35%,
      rgba(175, 185, 200, 0.88) 65%,
      rgba(160, 170, 185, 0.82) 100%
    );
    mix-blend-mode: normal;
  `;

  const hud = document.getElementById("hud");
  if (hud) {
    document.body.insertBefore(overlay, hud);
  } else {
    document.body.appendChild(overlay);
  }

  return overlay;
}

export function createFpvOverlay(): FpvOverlayElements {
  const overlay = document.createElement("div");
  overlay.id = "fpv-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 5; display: none;
  `;

  const vignette = document.createElement("div");
  vignette.style.cssText = `
    position: absolute; inset: 0;
    background: radial-gradient(
      ellipse 70% 65% at 50% 50%,
      transparent 0%,
      transparent 45%,
      rgba(0,0,0,0.18) 62%,
      rgba(0,0,0,0.45) 78%,
      rgba(0,0,0,0.82) 100%
    );
  `;
  overlay.appendChild(vignette);

  const barStyle = "position: absolute; left: 0; right: 0; height: 3.5%; background: #000;";
  const topBar = document.createElement("div");
  topBar.style.cssText = `${barStyle}top: 0;`;
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText = `${barStyle}bottom: 0;`;
  overlay.appendChild(topBar);
  overlay.appendChild(bottomBar);

  const grain = document.createElement("div");
  grain.style.cssText = `
    position: absolute; inset: 0; opacity: 0.06; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 128px 128px;
    animation: fpv-grain 0.08s steps(2) infinite;
  `;
  overlay.appendChild(grain);

  const tint = document.createElement("div");
  tint.style.cssText = `
    position: absolute; inset: 0; opacity: 0.07;
    background: linear-gradient(180deg, rgba(255,180,100,0.3) 0%, transparent 40%, rgba(80,120,200,0.2) 100%);
    mix-blend-mode: overlay;
  `;
  overlay.appendChild(tint);

  const hudContainer = document.createElement("div");
  hudContainer.style.cssText = `
    position: absolute; bottom: 6%; left: 50%; transform: translateX(-50%);
    display: flex; gap: 2.5rem; align-items: baseline;
    font-family: 'Space Mono', monospace; font-size: 1.05rem;
    color: rgba(255,255,255,0.88); text-shadow: 0 0 8px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.7);
    letter-spacing: 0.04em;
  `;

  const altitude = document.createElement("span");
  altitude.textContent = "ALT 0.0 m";

  const speed = document.createElement("span");
  speed.textContent = "SPD 0.0 m/s";

  hudContainer.appendChild(altitude);
  hudContainer.appendChild(speed);
  overlay.appendChild(hudContainer);

  document.body.appendChild(overlay);

  if (!document.getElementById("fpv-overlay-keyframes")) {
    const style = document.createElement("style");
    style.id = "fpv-overlay-keyframes";
    style.textContent = `
      @keyframes fpv-grain {
        0% { transform: translate(0,0); }
        100% { transform: translate(-8px, -8px); }
      }
    `;
    document.head.appendChild(style);
  }

  return { overlay, altitude, speed };
}

export function createCollisionDialog(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = "collision-dialog";
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 0, 0, 0.9);
    border: 2px solid #ff4444;
    padding: 2rem;
    color: #fff;
    font-family: 'Space Mono', monospace;
    z-index: 100;
    text-align: center;
    display: none;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 0 30px rgba(255, 0, 0, 0.4);
    min-width: 300px;
  `;

  const title = document.createElement("h1");
  title.textContent = "YOU COLLIDED";
  title.style.cssText = "color: #ff4444; margin: 0; font-size: 2.5rem; letter-spacing: 0.1em;";
  overlay.appendChild(title);

  const stats = document.createElement("div");
  stats.id = "collision-stats";
  stats.style.cssText = "text-align: left; margin: 1rem 0; font-size: 1.1rem; line-height: 1.6;";
  overlay.appendChild(stats);

  const reloadBtn = document.createElement("button");
  reloadBtn.id = "collision-reload-btn";
  reloadBtn.textContent = "RELOAD MISSION";
  reloadBtn.style.cssText = `
    margin-top: 1.5rem;
    padding: 0.8rem 1.5rem;
    background: #ff4444;
    color: white;
    border: none;
    font-family: 'Space Mono', monospace;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
    letter-spacing: 0.1em;
  `;
  reloadBtn.onmouseover = () => { reloadBtn.style.background = "#ff6666"; };
  reloadBtn.onmouseout = () => { reloadBtn.style.background = "#ff4444"; };
  reloadBtn.onclick = () => { window.location.reload(); };
  overlay.appendChild(reloadBtn);

  document.body.appendChild(overlay);
  return overlay;
}

export function showCollisionDialog(
  overlay: HTMLDivElement,
  data: { time: string; object: string; distanceToGoal: string },
): void {
  const stats = overlay.querySelector("#collision-stats");
  if (stats) {
    stats.innerHTML = `
      <div>=> Time into mission: ${data.time}</div>
      <div>=> Collision object: ${data.object}</div>
      <div>=> Distance from goal: ${data.distanceToGoal}</div>
    `;
  }

  overlay.style.display = "flex";
}
