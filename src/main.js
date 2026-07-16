/**
 * Application entry point.
 *
 * Sets up the Three.js renderer, studio lighting, loads all kit assets,
 * assembles board + rig, and runs the orbit/zoom interaction loop.
 *
 * @module main
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadSailShape } from './sailImage.js';
import { loadBoardShape } from './boardImage.js';
import { loadBoomShape } from './boomImage.js';
import { loadFinShape } from './finImage.js';
import { createSail } from './sail.js';
import { createHardware } from './hardware.js';
import { createBoard, DECK_AT_TRACK, LEN } from './board.js';
import { pointCloudify } from './pointCloud.js';

/** Vertical offset so the kit floats above the contact shadow. */
const FLOAT = 0.5;

/** Rig rake in radians (~19° aft). */
const RIG_RAKE = -0.34;

/**
 * Initialize renderer, scene, kit assembly, controls, and animation loop.
 */
async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.6);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // Load shape data in parallel, then assemble the kit.
  const [shape, boardShape, boomShape, finShape] = await Promise.all([
    loadSailShape(), loadBoardShape(LEN), loadBoomShape(), loadFinShape(),
  ]);
  const kit = new THREE.Group();
  kit.add(createBoard(boardShape, finShape));
  const sail = createSail(shape);
  const rig = new THREE.Group();
  rig.add(sail.mesh, createHardware(shape, boomShape));
  rig.position.y = 0.015; // tack rides just off the deck
  const rigPivot = new THREE.Group();
  rigPivot.rotation.z = RIG_RAKE;
  rigPivot.position.set(0.02, DECK_AT_TRACK, 0); // mast track 2 cm aft of center
  rigPivot.add(rig);
  kit.add(rigPivot);
  kit.position.y = FLOAT;
  scene.add(kit);

  // Point-cloud rendering: sample every surface into colored points that
  // follow the wind-deformed cloth. Press P to flip back to solid.
  const cloud = pointCloudify(kit);
  let pointsMode = true;

  // Binary STL of the kit meshes, world-space, in whatever pose the wind
  // has the cloth in right now. Sheets and tubes are open surfaces — fine
  // for CAD/viewing; solidify before 3D printing.
  const exportSTL = () => {
    kit.updateMatrixWorld(true);
    const data = new STLExporter().parse(kit, { binary: true });
    const blob = new Blob([data], { type: 'model/stl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'severne-mach.stl';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Binary glTF of the kit's solid meshes only. Point clouds hang off each
  // mesh as visible THREE.Points children (only their source materials are
  // hidden in points mode), so GLTFExporter's onlyVisible default would
  // otherwise embed ~220k point primitives alongside the solid geometry —
  // hide the clouds for the parse, then restore whatever mode was active.
  const glbArrayBuffer = async () => {
    const clouds = [];
    kit.traverse((o) => { if (o.isPoints) clouds.push(o); });
    for (const c of clouds) c.visible = false;
    try {
      kit.updateMatrixWorld(true);
      return await new GLTFExporter().parseAsync(kit, { binary: true });
    } finally {
      for (const c of clouds) c.visible = pointsMode;
    }
  };
  const exportGLB = async () => {
    const buffer = await glbArrayBuffer();
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'severne-mach.glb';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'p') { pointsMode = !pointsMode; cloud.setPointsMode(pointsMode); }
    if (k === 'e') exportSTL();
    if (k === 'g') exportGLB();
  });

  // Radial-gradient contact shadow (no shadow maps).
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const sctx = sc.getContext('2d');
  const grad = sctx.createRadialGradient(128, 128, 16, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 2.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.3, 0.001, 0);
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(5.4, 3, 6.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.6, 2.3, 0);

  /** Pull camera back until the whole kit fits the viewport. */
  const frameKit = () => {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const d = Math.max(5.2 / (2 * half), 5.4 / (2 * half * camera.aspect));
    camera.position.sub(controls.target).setLength(d).add(controls.target);
  };
  frameKit();
  controls.enableDamping = true;
  controls.minDistance = 2.5;
  controls.maxDistance = 14;
  controls.maxPolarAngle = 2.7; // allow orbiting under the board
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { idleTimer = setTimeout(() => (controls.autoRotate = true), 3000); });

  // Dev-only sanity check: reject NaN/Infinity in geometry.
  if (import.meta.env.DEV) {
    window.__kit = kit;
    // Manual frame step for environments where rAF is throttled (tests).
    window.__tick = (t) => { sail.update(t, !pointsMode); cloud.update(); controls.update(); renderer.render(scene, camera); };
    // STL bytes as base64, for pulling exports out of headless sessions.
    window.__stlBase64 = () => {
      kit.updateMatrixWorld(true);
      const data = new STLExporter().parse(kit, { binary: true });
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    // GLB bytes, for re-parsing/inspecting exports from headless sessions.
    window.__glbBytes = async () => new Uint8Array(await glbArrayBuffer());
    scene.traverse((o) => {
      const a = o.geometry?.attributes.position;
      if (!a) return;
      for (let i = 0; i < a.array.length; i++)
        if (!Number.isFinite(a.array[i])) throw new Error(`non-finite position in ${o.name || o.type}`);
    });
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    frameKit();
  });

  renderer.render(scene, camera); // paint immediately; rAF can be throttled in background tabs
  renderer.setAnimationLoop((t) => {
    sail.update(t / 1000, !pointsMode);
    cloud.update();
    controls.update();
    renderer.render(scene, camera);
  });
}

init().catch(console.error);
