import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneContext {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  orbitControls: OrbitControls;
  ambientLight: AmbientLight;
  directionalLight: DirectionalLight;
  groundPlane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  dispose: () => void;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new Scene();
  scene.background = new Color('#0a0a0a');

  const camera = new PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(0.4, 0.4, 0.6);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.append(renderer.domElement);

  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0, 0.15, 0);

  const ambientLight = new AmbientLight('#ffffff', 0.4);
  scene.add(ambientLight);

  const directionalLight = new DirectionalLight('#ffffff', 1.2);
  directionalLight.position.set(2, 4, 3);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 20;
  directionalLight.shadow.camera.left = -3;
  directionalLight.shadow.camera.right = 3;
  directionalLight.shadow.camera.top = 3;
  directionalLight.shadow.camera.bottom = -3;
  scene.add(directionalLight);

  const groundMaterial = new MeshStandardMaterial({
    color: '#1a1a1a',
    metalness: 0.1,
    roughness: 0.9,
  });
  const groundPlane = new Mesh(new PlaneGeometry(2, 2), groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  const gridHelper = new GridHelper(2, 20, '#222222', '#222222');
  gridHelper.position.y = 0.0005;
  scene.add(gridHelper);

  const onResize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    orbitControls,
    ambientLight,
    directionalLight,
    groundPlane,
    dispose: () => {
      window.removeEventListener('resize', onResize);
      orbitControls.dispose();
      renderer.dispose();
    },
  };
}
