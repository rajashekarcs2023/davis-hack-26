/**
 * Geospatial Rendering Overlay
 * 
 * Adds a synchronized Three.js rendering layer on top of the Cesium viewer
 * using @takram/three-atmosphere for physically-based atmospheric scattering,
 * @takram/three-clouds for volumetric clouds, aerial perspective, sky rendering,
 * sun/moon lighting, and post-processing.
 * 
 * The Three.js camera is kept in lock-step with the Cesium camera every frame.
 */

import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Mesh,
    Points,
    PlaneGeometry,
    Vector3,
    Matrix4,
    HalfFloatType,
    NoToneMapping,
    PCFSoftShadowMap,
    Clock,
    TextureLoader,
    Data3DTexture,
    RedFormat,
    LinearFilter,
    LinearMipMapLinearFilter,
    RepeatWrapping,
    NoColorSpace,
} from 'three';

import {
    EffectComposer,
    EffectPass,
    RenderPass,
    ToneMappingEffect,
    ToneMappingMode,
} from 'postprocessing';

import {
    AerialPerspectiveEffect,
    getSunDirectionECEF,
    getMoonDirectionECEF,
    getECIToECEFRotationMatrix,
    PrecomputedTexturesGenerator,
    SkyLightProbe,
    SkyMaterial,
    StarsGeometry,
    StarsMaterial,
    SunDirectionalLight,
    DEFAULT_STARS_DATA_URL,
    SKY_RENDER_ORDER,
} from '@takram/three-atmosphere';

import {
    Ellipsoid,
    DataTextureLoader,
    STBNLoader,
    DEFAULT_STBN_URL,
    parseUint8Array,
    ArrayBufferLoader,
} from '@takram/three-geospatial';

import {
    DitheringEffect,
    LensFlareEffect,
} from '@takram/three-geospatial-effects';

import {
    CloudsEffect,
    CloudLayers,
} from '@takram/three-clouds';


/* ─── Cloud Layer Altitude Constants (meters above sea level) ─── */
// Based on CloudLayers.DEFAULT from @takram/three-clouds:
//   Layer 0 (cumulus):        altitude=750,  height=650   → 750..1400m
//   Layer 1 (stratocumulus):  altitude=1000, height=1200  → 1000..2200m
//   Layer 2 (cirrus):         altitude=7500, height=500   → 7500..8000m
// The main "thick" cloud band is the union of layers 0 & 1: 750..2200m.
export const CLOUD_BAND_BOTTOM = 750;   // meters MSL
export const CLOUD_BAND_TOP = 2200;  // meters MSL
export const CLOUD_BAND_CORE_BOTTOM = 900;  // dense core start
export const CLOUD_BAND_CORE_TOP = 1800; // dense core end

/**
 * Compute the camera's relationship with the cloud layer.
 * @param {number} altitudeMSL  Camera altitude in meters above sea level.
 * @returns {{ state: 'below'|'entering'|'inside'|'exiting'|'above', immersion: number }}
 *   immersion: 0 = clear, 1 = fully inside dense cloud.
 */
export function getCloudImmersionState(altitudeMSL) {
    if (altitudeMSL < CLOUD_BAND_BOTTOM) {
        return { state: 'below', immersion: 0 };
    }
    if (altitudeMSL >= CLOUD_BAND_BOTTOM && altitudeMSL < CLOUD_BAND_CORE_BOTTOM) {
        // Entering: fade from 0 → 1 across the bottom fringe
        const t = (altitudeMSL - CLOUD_BAND_BOTTOM) / (CLOUD_BAND_CORE_BOTTOM - CLOUD_BAND_BOTTOM);
        return { state: 'entering', immersion: t * t }; // ease-in
    }
    if (altitudeMSL >= CLOUD_BAND_CORE_BOTTOM && altitudeMSL <= CLOUD_BAND_CORE_TOP) {
        return { state: 'inside', immersion: 1.0 };
    }
    if (altitudeMSL > CLOUD_BAND_CORE_TOP && altitudeMSL <= CLOUD_BAND_TOP) {
        // Exiting: fade from 1 → 0 across the top fringe
        const t = (CLOUD_BAND_TOP - altitudeMSL) / (CLOUD_BAND_TOP - CLOUD_BAND_CORE_TOP);
        return { state: 'exiting', immersion: t * t }; // ease-out
    }
    return { state: 'above', immersion: 0 };
}


/* ─── Asset URLs for cloud textures ─── */
// Served locally from public/assets/clouds/ (copied from the npm package).
// This avoids unreliable GitHub LFS CDN requests that can silently hang.
const LOCAL_WEATHER_URL = '/assets/clouds/local_weather.png';
const SHAPE_URL = '/assets/clouds/shape.bin';
const SHAPE_DETAIL_URL = '/assets/clouds/shape_detail.bin';
const TURBULENCE_URL = '/assets/clouds/turbulence.png';

const CLOUD_SHAPE_SIZE = 128;
const CLOUD_SHAPE_DETAIL_SIZE = 32;


/* ─── State ─── */
let scene, camera, renderer, composer;
let skyMaterial, skyLight, sunLight, aerialPerspective;
let starsMaterial, starsPoints;
let cloudsEffect;
let cesiumViewer = null;
let overlayCanvas = null;
let isInitialized = false;
let clock;
const eciToECEFMatrix = new Matrix4();

const sunDirection = new Vector3();
const moonDirection = new Vector3();

/* Scratch variables for camera sync */
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3();
const _right = new Vector3();
const _mat4 = new Matrix4();


/* ─── Texture Loading Helpers ─── */

function loadTexture2D(url) {
    return new Promise((resolve, reject) => {
        new TextureLoader().load(url, (texture) => {
            texture.minFilter = LinearMipMapLinearFilter;
            texture.magFilter = LinearFilter;
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.colorSpace = NoColorSpace;
            texture.needsUpdate = true;
            resolve(texture);
        }, undefined, (err) => {
            reject(new Error(`Failed to load texture ${url}: ${err?.message ?? err}`));
        });
    });
}

function load3DTexture(url, size) {
    return new Promise((resolve, reject) => {
        const loader = new DataTextureLoader(Data3DTexture, parseUint8Array, {
            width: size,
            height: size,
            depth: size,
            format: RedFormat,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            wrapS: RepeatWrapping,
            wrapT: RepeatWrapping,
            wrapR: RepeatWrapping,
            colorSpace: NoColorSpace,
        });
        loader.load(url, (texture) => {
            resolve(texture);
        }, undefined, (err) => {
            reject(new Error(`Failed to load 3D texture ${url}: ${err?.message ?? err}`));
        });
    });
}

function loadSTBN(url) {
    return new Promise((resolve, reject) => {
        new STBNLoader().load(url, (texture) => {
            resolve(texture);
        }, undefined, (err) => {
            reject(new Error(`Failed to load STBN ${url}: ${err?.message ?? err}`));
        });
    });
}


/* ─── Public API ───────────────────────────────────────────────── */

/**
 * Initialize the geospatial overlay on top of an existing Cesium viewer.
 * @param {Cesium.Viewer} viewer  The active Cesium Viewer instance.
 */
export async function initGeospatialOverlay(viewer) {
    if (isInitialized) return;
    cesiumViewer = viewer;
    clock = new Clock();

    /* Create canvas */
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'geospatial-overlay';
    overlayCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  `;
    document.body.insertBefore(overlayCanvas, document.getElementById('hud'));

    const width = window.innerWidth;
    const height = window.innerHeight;

    /* Three.js renderer */
    renderer = new WebGLRenderer({
        canvas: overlayCanvas,
        alpha: true,                 // transparent background so Cesium shows through
        depth: false,
        logarithmicDepthBuffer: true,
        antialias: false,            // AA handled by post-processing
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = NoToneMapping;
    renderer.toneMappingExposure = 10;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.autoClear = false;

    /* Camera (we'll sync it to Cesium each frame) */
    camera = new PerspectiveCamera(92, width / height, 1, 1e8);

    /* Scene */
    scene = new Scene();

    /* ─── Sky ─── */
    skyMaterial = new SkyMaterial();
    skyMaterial.depthWrite = false;
    const sky = new Mesh(new PlaneGeometry(2, 2), skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = SKY_RENDER_ORDER;
    scene.add(sky);

    /* ─── Stars (night skybox) ─── */
    starsMaterial = new StarsMaterial({
        pointSize: 1,
        intensity: 1,
        background: true,
        ground: true,
    });
    starsMaterial.depthTest = true;
    starsMaterial.depthWrite = false;

    /* ─── Lighting ─── */
    const cesiumCamPos = cesiumViewer.camera.positionWC;
    const ecef = new Vector3(cesiumCamPos.x, cesiumCamPos.y, cesiumCamPos.z);

    skyLight = new SkyLightProbe();
    skyLight.position.copy(ecef);
    scene.add(skyLight);

    sunLight = new SunDirectionalLight({ distance: 5000 });
    sunLight.target.position.copy(ecef);
    sunLight.castShadow = true;
    sunLight.shadow.camera.top = 5000;
    sunLight.shadow.camera.bottom = -5000;
    sunLight.shadow.camera.left = -5000;
    sunLight.shadow.camera.right = 5000;
    sunLight.shadow.camera.near = 0;
    sunLight.shadow.camera.far = 10000;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.normalBias = 1;
    scene.add(sunLight);
    scene.add(sunLight.target);

    /* ─── Aerial Perspective (create first so clouds can reference it) ─── */
    aerialPerspective = new AerialPerspectiveEffect(camera, {
        sky: false,      // We render sky separately via SkyMaterial
        sunLight: false, // Using light-source approach
        skyLight: false,
    });

    /* ─── Volumetric Clouds ─── */
    cloudsEffect = new CloudsEffect(camera);
    cloudsEffect.coverage = 0.45;           // moderate cloud coverage
    cloudsEffect.skipRendering = false;     // CRITICAL: enable rendering

    // Set default cloud layers (cumulus, stratocumulus, cirrus)
    cloudsEffect.cloudLayers.copy(CloudLayers.DEFAULT);

    // Wire clouds into aerial perspective compositing
    cloudsEffect.events.addEventListener('change', (event) => {
        if (!aerialPerspective) return;
        if (event.property === 'atmosphereOverlay') {
            aerialPerspective.overlay = cloudsEffect.atmosphereOverlay;
        }
        if (event.property === 'atmosphereShadow') {
            aerialPerspective.shadow = cloudsEffect.atmosphereShadow;
        }
        if (event.property === 'atmosphereShadowLength') {
            aerialPerspective.shadowLength = cloudsEffect.atmosphereShadowLength;
        }
    });

    /* ─── Post-processing Pipeline ─── */
    composer = new EffectComposer(renderer, {
        frameBufferType: HalfFloatType,
        multisampling: 4,
    });
    composer.addPass(new RenderPass(scene, camera));

    // Clouds must come BEFORE aerial perspective so they get composited properly
    composer.addPass(new EffectPass(camera, cloudsEffect));
    composer.addPass(new EffectPass(camera, aerialPerspective));
    composer.addPass(
        new EffectPass(
            camera,
            new LensFlareEffect(),
            new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
            new DitheringEffect(),
        ),
    );

    /* ─── Precomputed atmosphere textures (MUST await before assigning) ─── */
    const generator = new PrecomputedTexturesGenerator(renderer);
    const textures = await generator.update();
    console.log('[geospatial-overlay] Precomputed atmosphere textures ready.');

    // Wire textures into all atmosphere consumers
    Object.assign(skyMaterial, textures);
    sunLight.transmittanceTexture = textures.transmittanceTexture;
    skyLight.irradianceTexture = textures.irradianceTexture;
    Object.assign(aerialPerspective, textures);

    // Feed atmosphere textures to clouds
    cloudsEffect.irradianceTexture = textures.irradianceTexture;
    cloudsEffect.scatteringTexture = textures.scatteringTexture;
    cloudsEffect.transmittanceTexture = textures.transmittanceTexture;

    // Feed atmosphere textures to stars
    starsMaterial.transmittanceTexture = textures.transmittanceTexture;

    /* ─── Kick off async asset loads in parallel for speed ─── */
    loadCloudTextures();
    loadStarsData();

    /* Resize handler */
    window.addEventListener('resize', onWindowResize);

    isInitialized = true;
    console.log('[geospatial-overlay] Atmospheric rendering with volumetric clouds and stars initialized.');
}

/**
 * Load all required cloud textures asynchronously.
 */
async function loadCloudTextures() {
    // Use allSettled so a single texture failure doesn't block the rest.
    // The 4 cloud textures are served locally; STBN comes from remote CDN.
    const results = await Promise.allSettled([
        loadTexture2D(LOCAL_WEATHER_URL),
        load3DTexture(SHAPE_URL, CLOUD_SHAPE_SIZE),
        load3DTexture(SHAPE_DETAIL_URL, CLOUD_SHAPE_DETAIL_SIZE),
        loadTexture2D(TURBULENCE_URL),
        loadSTBN(DEFAULT_STBN_URL),
    ]);

    const names = ['localWeather', 'shape', 'shapeDetail', 'turbulence', 'stbn'];
    const setters = [
        (t) => { cloudsEffect.localWeatherTexture = t; },
        (t) => { cloudsEffect.shapeTexture = t; },
        (t) => { cloudsEffect.shapeDetailTexture = t; },
        (t) => { cloudsEffect.turbulenceTexture = t; },
        (t) => { cloudsEffect.stbnTexture = t; },
    ];

    let loaded = 0;
    results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
            setters[i](r.value);
            loaded++;
        } else {
            console.warn(`[geospatial-overlay] ${names[i]} texture failed:`, r.reason);
        }
    });

    console.log(`[geospatial-overlay] Cloud textures: ${loaded}/${results.length} loaded.`);
}


/**
 * Load star catalog data and create the star points mesh.
 */
async function loadStarsData() {
    try {
        const loader = new ArrayBufferLoader();
        const data = await loader.loadAsync(DEFAULT_STARS_DATA_URL);
        const starsGeometry = new StarsGeometry(data);
        starsPoints = new Points(starsGeometry, starsMaterial);
        starsPoints.frustumCulled = false;
        starsPoints.renderOrder = SKY_RENDER_ORDER + 1;
        scene.add(starsPoints);
        console.log('[geospatial-overlay] Star catalog loaded successfully.');
    } catch (err) {
        console.error('[geospatial-overlay] Failed to load star data:', err);
    }
}


/**
 * Call once per Cesium tick to synchronize and render the overlay.
 * @param {Cesium.Viewer} viewer
 */
export function updateGeospatialOverlay(viewer) {
    if (!isInitialized) return;

    /* ─── Sync Three.js camera to Cesium camera ─── */
    syncCameraToCesium(viewer);

    /* ─── Update sun / moon direction ─── */
    const now = viewer.clock.currentTime;
    const jsDate = Cesium.JulianDate.toDate(now);

    getSunDirectionECEF(jsDate, sunDirection);
    getMoonDirectionECEF(jsDate, moonDirection);

    skyMaterial.sunDirection.copy(sunDirection);
    skyMaterial.moonDirection.copy(moonDirection);
    sunLight.sunDirection.copy(sunDirection);
    skyLight.sunDirection.copy(sunDirection);
    aerialPerspective.sunDirection.copy(sunDirection);

    // Update clouds sun direction
    cloudsEffect.sunDirection.copy(sunDirection);

    /* ─── Update stars ─── */
    if (starsPoints && starsMaterial) {
        // Rotate stars from ECI (inertial) to ECEF frame so they track Earth's rotation
        getECIToECEFRotationMatrix(jsDate, eciToECEFMatrix);
        starsPoints.setRotationFromMatrix(eciToECEFMatrix);
        starsMaterial.sunDirection.copy(sunDirection);
    }

    /* Update light probes at the drone's location */
    const camPosWC = viewer.camera.positionWC;
    _pos.set(camPosWC.x, camPosWC.y, camPosWC.z);
    skyLight.position.copy(_pos);
    sunLight.target.position.copy(_pos);

    sunLight.update();
    skyLight.update();

    /* ─── Render ─── */
    renderer.clear();
    composer.render();
}


/**
 * Clean up resources.
 */
export function disposeGeospatialOverlay() {
    if (!isInitialized) return;
    window.removeEventListener('resize', onWindowResize);
    composer.dispose();
    renderer.dispose();
    if (overlayCanvas && overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
    }
    isInitialized = false;
}


/* ─── Internal helpers ─────────────────────────────────────────── */

function syncCameraToCesium(viewer) {
    const cesiumCamera = viewer.camera;

    /* Position (ECEF meters) */
    _pos.set(
        cesiumCamera.positionWC.x,
        cesiumCamera.positionWC.y,
        cesiumCamera.positionWC.z,
    );
    camera.position.copy(_pos);

    /* View direction from Cesium (heading + pitch, no roll info needed) */
    _dir.set(
        cesiumCamera.directionWC.x,
        cesiumCamera.directionWC.y,
        cesiumCamera.directionWC.z,
    );

    /* World-up = geodetic surface normal ≈ normalize(position) in ECEF.
       This is the TRUE up from the ground — completely independent of
       the plane's roll, so the sky/horizon never tilts. */
    _up.copy(_pos).normalize();

    /* Build a roll-free camera basis:
         right = normalize(direction × worldUp)
         up    = right × direction
         zAxis = −direction   (Three.js camera looks along local −Z)       */
    _right.crossVectors(_dir, _up).normalize();
    _up.crossVectors(_right, _dir);          // perpendicular to both, ≈ worldUp
    _dir.negate();                            // zAxis = −direction
    _mat4.makeBasis(_right, _up, _dir);
    camera.quaternion.setFromRotationMatrix(_mat4);

    /* Sync FOV – Cesium uses radians, Three.js degrees */
    const fovRad = cesiumCamera.frustum.fovy || cesiumCamera.frustum.fov;
    if (fovRad) {
        camera.fov = fovRad * (180 / Math.PI);
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.near = 1;
    camera.far = 1e8;
    camera.updateProjectionMatrix();
}


function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    composer.setSize(width, height);
}
