/**
 * Point-cloud rendering of the assembled kit.
 *
 * Traverses the kit, scatters area-weighted random points over every mesh
 * surface (colored by sampling the mesh's texture at the point's UV, or the
 * material color for untextured fittings), and renders them as THREE.Points
 * while the source meshes go invisible.
 *
 * Each point remembers its source triangle and barycentric weights, so
 * clouds re-follow geometries the wind model rewrites every frame — gusts,
 * leech flutter, and mast flex all survive the conversion to points.
 *
 * @module pointCloud
 */

import * as THREE from 'three';

/** Points per square meter of surface. */
const DENSITY = 18000;

/** Fewest points on any mesh, so small fittings stay legible. */
const MIN_POINTS = 250;

/** Point sprite diameter in meters (sizeAttenuation is on). */
const POINT_SIZE = 0.011;

/** Clamp range for the adjustable point size, meters. */
const SIZE_MIN = 0.003;
const SIZE_MAX = 0.05;

/** Height-gradient stops: deep blue (low) → teal (mid) → coral (high). */
const HEIGHT_LOW = 0x1f4b99;
const HEIGHT_MID = 0x37b6a0;
const HEIGHT_HIGH = 0xff5340;

/** World-y span of the kit the height gradient maps onto (fin tip → masthead). */
const HEIGHT_Y_MIN = 0.12;
const HEIGHT_Y_MAX = 4.30;

/** Uniform point tint while depth-fade mode is active. */
const DEPTH_TINT = 0xdfe6ee;

/** Scene fog for depth-fade mode — color matches the studio backdrop. */
const FOG_COLOR = 0x14161a;
const FOG_NEAR = 4;
const FOG_FAR = 12;

/** Reject sampled texels below this alpha (sail silhouette edges). */
const ALPHA_MIN = 64;

/** Retries per point before giving up on finding an opaque texel. */
const MAX_TRIES = 8;

/** Lift applied to untextured colors so dark carbon reads on the dark bg. */
const DARK_LIFT = 0.09;

/** Brightness boost for texture-sampled points — stands in for scene lighting. */
const TEX_BOOST = 1.3;

/** Soft round sprite shared by all clouds. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.75, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * CPU-side texel reader for a texture backed by an <img> or <canvas>.
 *
 * @param {THREE.Texture} texture
 * @returns {(u: number, v: number) => [number, number, number, number]} RGBA bytes at (u, v).
 */
function texReader(texture) {
  const image = texture.image;
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
    const y = Math.min(h - 1, Math.max(0, Math.round((1 - v) * (h - 1))));
    const k = (y * w + x) * 4;
    return [data[k], data[k + 1], data[k + 2], data[k + 3]];
  };
}

/**
 * Convert every mesh under `root` into a surface-sampled point cloud.
 *
 * Clouds are added as children of their source mesh, so they inherit all
 * transforms — including animated ones like the flexing tip cap. Source
 * materials are hidden (not the meshes) so child clouds keep rendering.
 *
 * @param {THREE.Object3D} root - Assembled kit.
 * @returns {{
 *   update: () => void,
 *   setPointsMode: (on: boolean) => void,
 *   setPointSize: (m: number) => void,
 *   getPointSize: () => number,
 *   setColorMode: (mode: 'texture' | 'height' | 'depth') => void,
 *   getColorMode: () => 'texture' | 'height' | 'depth',
 * }}
 */
export function pointCloudify(root) {
  const mat = new THREE.PointsMaterial({
    size: POINT_SIZE,
    vertexColors: true,
    map: dotTexture(),
    alphaTest: 0.5,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const clouds = []; // { srcAttr, last, tri, bary, count, geo, points }
  const sourceMats = [];
  const readerCache = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const cloud = buildCloud(mesh, mat, readerCache);
    if (!cloud) continue;
    clouds.push(cloud);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) { m.visible = false; sourceMats.push(m); }
  }

  let enabled = true;
  let colorMode = 'texture';
  const fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  // Fog exists exactly while (points mode && depth fade). The scene is
  // resolved as root.parent at call time — the kit is in the scene by then.
  const syncFog = () => {
    const scene = root.parent;
    if (!scene) return;
    const want = enabled && colorMode === 'depth';
    if (!!scene.fog === want) return;
    scene.fog = want ? fog : null;
    mat.needsUpdate = true; // fog on/off changes the points shader program
  };

  return {
    /** Re-follow any source geometry whose positions changed this frame. */
    update() {
      if (!enabled) return;
      for (const c of clouds) {
        if (c.srcAttr.version === c.last) continue;
        c.last = c.srcAttr.version;
        follow(c);
      }
    },
    /** Switch between point-cloud and original solid rendering. */
    setPointsMode(on) {
      enabled = on;
      for (const m of sourceMats) m.visible = !on;
      for (const c of clouds) c.points.visible = on;
      syncFog();
    },
    /** Set the shared sprite diameter in meters (clamped to a sane range). */
    setPointSize(m) {
      mat.size = THREE.MathUtils.clamp(m, SIZE_MIN, SIZE_MAX);
    },
    getPointSize() {
      return mat.size;
    },
    /** Swap per-point colors: 'texture' | 'height' | 'depth' (adds scene fog). */
    setColorMode(mode) {
      if (mode !== 'texture' && mode !== 'height' && mode !== 'depth') return;
      colorMode = mode;
      if (mode === 'height') root.updateMatrixWorld(true); // world y needs fresh matrices
      for (const c of clouds) c.geo.setAttribute('color', colorAttrFor(c, mode));
      syncFog();
    },
    getColorMode() {
      return colorMode;
    },
  };
}

/**
 * Lazily build and cache the color attribute for one cloud in one mode.
 * The baked texture attribute is captured before the first swap; height and
 * depth attributes are computed once and reused. Height colors stay valid
 * across wind deformation because it only rewrites point z, never y.
 */
function colorAttrFor(cloud, mode) {
  const cache = cloud.colorCache || (cloud.colorCache = { texture: cloud.geo.getAttribute('color') });
  if (cache[mode]) return cache[mode];
  const arr = new Float32Array(cloud.count * 3);
  const col = new THREE.Color();
  if (mode === 'depth') {
    col.set(DEPTH_TINT);
    for (let i = 0; i < cloud.count; i++) {
      const k = i * 3;
      arr[k] = col.r; arr[k + 1] = col.g; arr[k + 2] = col.b;
    }
  } else {
    const lo = new THREE.Color(HEIGHT_LOW);
    const mid = new THREE.Color(HEIGHT_MID);
    const hi = new THREE.Color(HEIGHT_HIGH);
    const pos = cloud.geo.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < cloud.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(cloud.points.matrixWorld);
      const t = THREE.MathUtils.clamp((v.y - HEIGHT_Y_MIN) / (HEIGHT_Y_MAX - HEIGHT_Y_MIN), 0, 1);
      if (t < 0.5) col.lerpColors(lo, mid, t * 2);
      else col.lerpColors(mid, hi, (t - 0.5) * 2);
      const k = i * 3;
      arr[k] = col.r; arr[k + 1] = col.g; arr[k + 2] = col.b;
    }
  }
  cache[mode] = new THREE.BufferAttribute(arr, 3);
  return cache[mode];
}

/** Sample one mesh into a Points child; returns null for empty geometry. */
function buildCloud(mesh, mat, readerCache) {
  const geo = mesh.geometry;
  const posA = geo.attributes.position;
  const uvA = geo.attributes.uv;
  const index = geo.index;
  const triCount = Math.floor((index ? index.count : posA.count) / 3);
  if (!triCount) return null;
  const vi = index ? (t, k) => index.getX(t * 3 + k) : (t, k) => t * 3 + k;

  // Area-weighted CDF over triangles for uniform surface sampling.
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const cdf = new Float64Array(triCount);
  let area = 0;
  for (let t = 0; t < triCount; t++) {
    A.fromBufferAttribute(posA, vi(t, 0));
    B.fromBufferAttribute(posA, vi(t, 1));
    C.fromBufferAttribute(posA, vi(t, 2));
    area += ab.subVectors(B, A).cross(ac.subVectors(C, A)).length() / 2;
    cdf[t] = area;
  }
  if (!area) return null;

  // Triangle → material slot (board deck/hull render from one geometry).
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const matOf = geo.groups.length && mats.length > 1
    ? (t) => {
        const i = t * 3;
        for (const g of geo.groups) if (i >= g.start && i < g.start + g.count) return g.materialIndex;
        return 0;
      }
    : () => 0;
  const readers = mats.map((m) => {
    if (!m.map || !uvA) return null;
    if (!readerCache.has(m.map)) readerCache.set(m.map, texReader(m.map));
    return readerCache.get(m.map);
  });

  const n = Math.max(MIN_POINTS, Math.round(area * DENSITY));
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const tri = new Uint32Array(n * 3);
  const bary = new Float32Array(n * 3);
  const col = new THREE.Color();
  let emitted = 0;
  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const r = Math.random() * area;
      let lo = 0, hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < r) lo = mid + 1; else hi = mid;
      }
      const t = lo;
      let w0 = Math.random(), w1 = Math.random();
      if (w0 + w1 > 1) { w0 = 1 - w0; w1 = 1 - w1; }
      const w2 = 1 - w0 - w1;
      const i0 = vi(t, 0), i1 = vi(t, 1), i2 = vi(t, 2);
      const m = mats[matOf(t)];
      const reader = readers[matOf(t)];
      if (reader) {
        const u = w0 * uvA.getX(i0) + w1 * uvA.getX(i1) + w2 * uvA.getX(i2);
        const v = w0 * uvA.getY(i0) + w1 * uvA.getY(i1) + w2 * uvA.getY(i2);
        const [cr, cg, cb, ca] = reader(u, v);
        if (ca < ALPHA_MIN) continue; // transparent texel — resample
        col.setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
        col.multiply(m.color).multiplyScalar(TEX_BOOST);
      } else {
        col.copy(m.color);
        col.addScalar(DARK_LIFT);
      }
      if (m.transparent && m.opacity < 1) col.multiplyScalar(m.opacity);
      const k = emitted * 3;
      positions[k] = w0 * posA.getX(i0) + w1 * posA.getX(i1) + w2 * posA.getX(i2);
      positions[k + 1] = w0 * posA.getY(i0) + w1 * posA.getY(i1) + w2 * posA.getY(i2);
      positions[k + 2] = w0 * posA.getZ(i0) + w1 * posA.getZ(i1) + w2 * posA.getZ(i2);
      colors[k] = col.r; colors[k + 1] = col.g; colors[k + 2] = col.b;
      tri[k] = i0; tri[k + 1] = i1; tri[k + 2] = i2;
      bary[k] = w0; bary[k + 1] = w1; bary[k + 2] = w2;
      emitted++;
      break;
    }
  }
  if (!emitted) return null;

  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, emitted * 3), 3));
  pgeo.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, emitted * 3), 3));
  pgeo.computeBoundingSphere();
  const points = new THREE.Points(pgeo, mat);
  points.name = `cloud:${mesh.name || mesh.geometry.type}`;
  points.frustumCulled = false; // cloth deforms; skip stale-sphere culling
  mesh.add(points);
  return { srcAttr: posA, last: posA.version, tri, bary, count: emitted, geo: pgeo, points };
}

/** Recompute point positions from the (deformed) source geometry. */
function follow(cloud) {
  const src = cloud.srcAttr.array;
  const pos = cloud.geo.attributes.position.array;
  const { tri, bary, count } = cloud;
  for (let i = 0; i < count; i++) {
    const k = i * 3;
    const a = tri[k] * 3, b = tri[k + 1] * 3, c = tri[k + 2] * 3;
    const w0 = bary[k], w1 = bary[k + 1], w2 = bary[k + 2];
    pos[k] = w0 * src[a] + w1 * src[b] + w2 * src[c];
    pos[k + 1] = w0 * src[a + 1] + w1 * src[b + 1] + w2 * src[c + 1];
    pos[k + 2] = w0 * src[a + 2] + w1 * src[b + 2] + w2 * src[c + 2];
  }
  cloud.geo.attributes.position.needsUpdate = true;
}
