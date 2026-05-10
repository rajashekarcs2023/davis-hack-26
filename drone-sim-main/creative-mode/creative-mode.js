// ### What this file does
// A free-flying camera mode that detaches from the drone. Used for inspecting
// agricultural zones at UC Davis. The camera moves with the same keyboard controls
// but is not bound to the drone. Highlighted 3D boxes mark areas of interest.

// ### State and camera settings
let _active = false;
let _highlightEntities = [];

const CAM_PITCH_RATE = Cesium.Math.toRadians(60.0); // degrees/sec
const CAM_PITCH_MIN = Cesium.Math.toRadians(-85.0);
const CAM_PITCH_MAX = Cesium.Math.toRadians(85.0);

const _freeCam = {
  position: new Cesium.Cartesian3(),
  horizontalVelocity: new Cesium.Cartesian3(0, 0, 0),
  verticalSpeed: 0.0,
  heading: 0.0,
  cameraPitch: 0.0,
  lastGroundHeight: 0.0,
};

const _s = {
  transform: new Cesium.Matrix4(),
  horizontalForward: new Cesium.Cartesian3(),
  horizontalRight: new Cesium.Cartesian3(),
  acceleration: new Cesium.Cartesian3(),
  velocityStep: new Cesium.Cartesian3(),
  movementStep: new Cesium.Cartesian3(),
  verticalStep: new Cesium.Cartesian3(),
  surfaceNormal: new Cesium.Cartesian3(),
  cameraOffset: new Cesium.Cartesian3(),
  cameraPosition: new Cesium.Cartesian3(),
  upOffset: new Cesium.Cartesian3(),
  cartographic: new Cesium.Cartographic(),
};

// ### Areas of interest — GPS coordinates for highlighted zones at UC Davis
const HIGHLIGHT_ZONES = [
  {
    coords: [
      { lat: 38.537786, lon: -121.760632 },
      { lat: 38.537750, lon: -121.759204 },
      { lat: 38.536519, lon: -121.759262 },
      { lat: 38.536493, lon: -121.760646 },
    ],
    color: Cesium.Color.RED,
    extrudedHeight: 4.6,
    label: 'Dairy Cattle Facility',
  },
  {
    coords: [
      { lat: 38.532296, lon: -121.764761 },
      { lat: 38.532287, lon: -121.763794 },
      { lat: 38.531857, lon: -121.763782 },
      { lat: 38.531863, lon: -121.764770 },
    ],
    color: Cesium.Color.YELLOW,
    extrudedHeight: 0.3,
    label: 'UC Davis Veterinary Hospital',
  },
];

// ### Create the 3D highlight boxes and labels on the map (hidden until mode is activated)
export function initCreativeMode(viewer) {
  for (const zone of HIGHLIGHT_ZONES) {
    // Polygon box
    const entity = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          zone.coords[0].lon, zone.coords[0].lat,
          zone.coords[1].lon, zone.coords[1].lat,
          zone.coords[2].lon, zone.coords[2].lat,
          zone.coords[3].lon, zone.coords[3].lat,
        ]),
        height: -20.5,
        extrudedHeight: zone.extrudedHeight,
        material: zone.color.withAlpha(0.25),
        outline: true,
        outlineColor: zone.color.withAlpha(0.6),
      },
      show: false,
    });
    _highlightEntities.push(entity);

    // Floating label at center-top of box
    const centerLat = (zone.coords[0].lat + zone.coords[2].lat) / 2;
    const centerLon = (zone.coords[0].lon + zone.coords[2].lon) / 2;
    const labelEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, zone.extrudedHeight + 8.0),
      label: {
        text: zone.label,
        font: 'bold 16px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(100, 1.2, 5000, 0.4),
      },
      show: false,
    });
    _highlightEntities.push(labelEntity);
  }
}

// ### Mode toggling — enter/exit creative mode, show/hide highlights
export function isCreativeModeActive() {
  return _active;
}

export function setHighlightVisible(visible) {
  for (const e of _highlightEntities) e.show = visible;
}

export function enterCreativeMode(dronePos, droneHeading) {
  _active = true;
  Cesium.Cartesian3.clone(dronePos, _freeCam.position);
  _freeCam.horizontalVelocity = new Cesium.Cartesian3(0, 0, 0);
  _freeCam.verticalSpeed = 0.0;
  _freeCam.heading = droneHeading;
  _freeCam.cameraPitch = 0.0;
  _freeCam.lastGroundHeight = 0.0;
}

export function exitCreativeMode() {
  _active = false;
  _freeCam.horizontalVelocity = new Cesium.Cartesian3(0, 0, 0);
  _freeCam.verticalSpeed = 0.0;
}

// ### Math to figure out which direction is "forward" and "right" based on camera heading
function _updateHorizontalAxes() {
  Cesium.Transforms.eastNorthUpToFixedFrame(
    _freeCam.position, Cesium.Ellipsoid.WGS84, _s.transform,
  );
  const ch = Math.cos(_freeCam.heading), sh = Math.sin(_freeCam.heading);
  _s.acceleration.x = sh;
  _s.acceleration.y = ch;
  _s.acceleration.z = 0.0;
  Cesium.Matrix4.multiplyByPointAsVector(_s.transform, _s.acceleration, _s.horizontalForward);
  Cesium.Cartesian3.normalize(_s.horizontalForward, _s.horizontalForward);
  _s.acceleration.x = ch;
  _s.acceleration.y = -sh;
  _s.acceleration.z = 0.0;
  Cesium.Matrix4.multiplyByPointAsVector(_s.transform, _s.acceleration, _s.horizontalRight);
  Cesium.Cartesian3.normalize(_s.horizontalRight, _s.horizontalRight);
}

// ### Per-frame update — reads keyboard input, moves the free camera, prevents going underground
export function updateCreativeMode(dt, keyState, speedMultiplier, FLIGHT, viewer) {
  const isDown = (code) => keyState.has(code);
  const sm = speedMultiplier;

  // ── Yaw ──
  const turnInput = (isDown('ArrowRight') ? 1 : 0) - (isDown('ArrowLeft') ? 1 : 0);
  _freeCam.heading += turnInput * FLIGHT.yawRate * dt;
  _freeCam.heading = Cesium.Math.zeroToTwoPi(_freeCam.heading);

  // ── Camera pitch (Q up, E down) ──
  const pitchInput = (isDown('KeyQ') ? 1 : 0) - (isDown('KeyE') ? 1 : 0);
  _freeCam.cameraPitch += pitchInput * CAM_PITCH_RATE * dt;
  _freeCam.cameraPitch = Cesium.Math.clamp(_freeCam.cameraPitch, CAM_PITCH_MIN, CAM_PITCH_MAX);

  _updateHorizontalAxes();

  // ── Horizontal movement ──
  const moveInput = (isDown('ArrowUp') ? 1 : 0) - (isDown('ArrowDown') ? 1 : 0);
  const strafeInput = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);

  if (moveInput !== 0) {
    Cesium.Cartesian3.multiplyByScalar(
      _s.horizontalForward, moveInput * FLIGHT.horizontalAcceleration * sm * dt, _s.velocityStep,
    );
    Cesium.Cartesian3.add(_freeCam.horizontalVelocity, _s.velocityStep, _freeCam.horizontalVelocity);
  }
  if (strafeInput !== 0) {
    Cesium.Cartesian3.multiplyByScalar(
      _s.horizontalRight, strafeInput * FLIGHT.horizontalAcceleration * sm * dt, _s.velocityStep,
    );
    Cesium.Cartesian3.add(_freeCam.horizontalVelocity, _s.velocityStep, _freeCam.horizontalVelocity);
  }

  const hDrag = Math.exp(-FLIGHT.horizontalDrag * dt);
  Cesium.Cartesian3.multiplyByScalar(_freeCam.horizontalVelocity, hDrag, _freeCam.horizontalVelocity);

  const effectiveMaxH = FLIGHT.maxHorizontalSpeed * sm;
  const hSpeed = Cesium.Cartesian3.magnitude(_freeCam.horizontalVelocity);
  if (hSpeed > effectiveMaxH) {
    Cesium.Cartesian3.multiplyByScalar(
      _freeCam.horizontalVelocity, effectiveMaxH / hSpeed, _freeCam.horizontalVelocity,
    );
  }

  // ── Vertical ──
  const vertInput = (isDown('KeyW') ? 1 : 0) - (isDown('KeyS') ? 1 : 0);
  if (vertInput !== 0) {
    _freeCam.verticalSpeed += vertInput * FLIGHT.verticalAcceleration * sm * dt;
  }
  _freeCam.verticalSpeed *= Math.exp(-FLIGHT.verticalDrag * dt);
  const effectiveMaxV = FLIGHT.maxVerticalSpeed * sm;
  _freeCam.verticalSpeed = Cesium.Math.clamp(_freeCam.verticalSpeed, -effectiveMaxV, effectiveMaxV);

  // ── Position update ──
  Cesium.Cartesian3.multiplyByScalar(_freeCam.horizontalVelocity, dt, _s.movementStep);
  Cesium.Cartesian3.add(_freeCam.position, _s.movementStep, _freeCam.position);

  Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(_freeCam.position, _s.surfaceNormal);
  Cesium.Cartesian3.multiplyByScalar(_s.surfaceNormal, _freeCam.verticalSpeed * dt, _s.verticalStep);
  Cesium.Cartesian3.add(_freeCam.position, _s.verticalStep, _freeCam.position);

  // ── Terrain clearance ──
  Cesium.Cartographic.fromCartesian(_freeCam.position, Cesium.Ellipsoid.WGS84, _s.cartographic);
  const sampledGround = viewer.scene.globe.getHeight(_s.cartographic);
  if (Number.isFinite(sampledGround)) {
    _freeCam.lastGroundHeight = sampledGround;
  }
  const minHeight = _freeCam.lastGroundHeight + FLIGHT.minimumClearance;
  if (_s.cartographic.height < minHeight) {
    _s.cartographic.height = minHeight;
    Cesium.Cartesian3.fromRadians(
      _s.cartographic.longitude, _s.cartographic.latitude, _s.cartographic.height,
      Cesium.Ellipsoid.WGS84, _freeCam.position,
    );
    if (_freeCam.verticalSpeed < 0.0) _freeCam.verticalSpeed = 0.0;
    Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(_freeCam.position, _s.surfaceNormal);
    const hVert = Cesium.Cartesian3.dot(_freeCam.horizontalVelocity, _s.surfaceNormal);
    if (hVert < 0.0) {
      Cesium.Cartesian3.multiplyByScalar(_s.surfaceNormal, hVert, _s.velocityStep);
      Cesium.Cartesian3.subtract(_freeCam.horizontalVelocity, _s.velocityStep, _freeCam.horizontalVelocity);
    }
  }

  // ── Recompute axes at final position ──
  _updateHorizontalAxes();

  // ── Camera (chase-style, following freeCam, with pitch) ──
  Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(_freeCam.position, _s.surfaceNormal);
  Cesium.Cartesian3.multiplyByScalar(_s.horizontalForward, FLIGHT.cameraForwardOffset, _s.cameraOffset);
  Cesium.Cartesian3.multiplyByScalar(_s.surfaceNormal, FLIGHT.cameraUpOffset, _s.upOffset);
  Cesium.Cartesian3.add(_freeCam.position, _s.cameraOffset, _s.cameraPosition);
  Cesium.Cartesian3.add(_s.cameraPosition, _s.upOffset, _s.cameraPosition);

  // Look direction: blend forward and up by cameraPitch
  const cp = Math.cos(_freeCam.cameraPitch);
  const sp = Math.sin(_freeCam.cameraPitch);
  _s.cameraOffset.x = cp * _s.horizontalForward.x + sp * _s.surfaceNormal.x;
  _s.cameraOffset.y = cp * _s.horizontalForward.y + sp * _s.surfaceNormal.y;
  _s.cameraOffset.z = cp * _s.horizontalForward.z + sp * _s.surfaceNormal.z;
  Cesium.Cartesian3.normalize(_s.cameraOffset, _s.cameraOffset);

  // Up vector perpendicular to direction in the forward-up plane
  _s.upOffset.x = -sp * _s.horizontalForward.x + cp * _s.surfaceNormal.x;
  _s.upOffset.y = -sp * _s.horizontalForward.y + cp * _s.surfaceNormal.y;
  _s.upOffset.z = -sp * _s.horizontalForward.z + cp * _s.surfaceNormal.z;
  Cesium.Cartesian3.normalize(_s.upOffset, _s.upOffset);

  viewer.camera.setView({
    destination: _s.cameraPosition,
    orientation: { direction: _s.cameraOffset, up: _s.upOffset },
  });
}

// ### HUD data — returns speed, altitude, and position for the on-screen display
export function getFreeCamReadout() {
  Cesium.Cartographic.fromCartesian(_freeCam.position, Cesium.Ellipsoid.WGS84, _s.cartographic);
  return {
    speedMs: Cesium.Cartesian3.magnitude(_freeCam.horizontalVelocity),
    agl: Math.max(0.0, _s.cartographic.height - _freeCam.lastGroundHeight),
    altMsl: _s.cartographic.height,
    headingDeg: Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(_freeCam.heading)),
    lat: Cesium.Math.toDegrees(_s.cartographic.latitude),
    lon: Cesium.Math.toDegrees(_s.cartographic.longitude),
  };
}
