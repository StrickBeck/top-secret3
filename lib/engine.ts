import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OperatorRig } from "./operator";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import { FPS, DURATION, SHOTS, shotAt } from "./shots";

// three-mesh-bvh: fast raycasts for placing grass on the terrain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type Mode = "film" | "operator";
export type Quality = "low" | "medium";

// Bump MODEL_VERSION after every new export so browsers never show an old cached scene.
const MODEL_VERSION = "2026-11-12-houses";

// Graphics presets: low keeps school laptops at frame rate, medium uses the Mid Megascans scene.
export const QUALITY: Record<Quality, { model: string; pixelRatio: number; shadow: number; grass: number; anisotropy: number; antialias: boolean }> = {
  low: { model: `/models/botai.glb?v=${MODEL_VERSION}`, pixelRatio: 1, shadow: 1024, grass: 9000, anisotropy: 2, antialias: false },
  medium: { model: `/models/botai_mid.glb?v=${MODEL_VERSION}`, pixelRatio: 2, shadow: 4096, grass: 30000, anisotropy: 8, antialias: true },
};

// Blender is Z-up, three is Y-up: (x, y, z) -> (x, z, -y).
const b2t = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const SUN_DIR = b2t(-0.686, -0.686, 0.242).normalize(); // direction towards the sun
const HEARTH = b2t(1.0, 10.0, 0.35);
const PLAZA = b2t(1.0, 5.0, 0.0);
const PIT = b2t(1.55, 10.9, 0.0);
const MUSEUM_KNIFE = b2t(0, 0, -298.97);
const FRAME_MUSEUM = 1921;
const FRAME_ANCIENT_END = 1392;

type Visible = { obj: THREE.Object3D; start: number; end: number };

export type LoadProgress = (fraction: number) => void;

export class Exhibit {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private filmCams = new Map<string, THREE.PerspectiveCamera>();
  readonly operator: THREE.PerspectiveCamera;
  private rig: OperatorRig;
  private envSky?: THREE.Texture;
  private envRoom?: THREE.Texture;
  private shadowCenter = new THREE.Vector3();
  private mixer?: THREE.AnimationMixer;
  private visible: Visible[] = [];
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fire: THREE.PointLight;
  private digLight: THREE.SpotLight;
  private digFill: THREE.PointLight;
  private museumLights: THREE.Light[] = [];
  private sky: Sky;
  private fog: THREE.Fog;
  private grass?: THREE.InstancedMesh;
  private flames?: THREE.Points;
  private uniforms = { uTime: { value: 0 } };
  private clock = new THREE.Timer();
  private raf = 0;
  private time = 0; // film time, seconds
  private playing = false;
  mode: Mode = "film";
  onTick?: (time: number) => void;

  readonly preset: (typeof QUALITY)[Quality];

  constructor(private canvas: HTMLCanvasElement, readonly quality: Quality = "low") {
    this.preset = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Sky and haze, matching the evening sun of the Blender scene.
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 5;
    su.rayleigh.value = 1.4;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.8;
    su.sunPosition.value.copy(SUN_DIR);
    this.scene.add(this.sky);
    this.fog = new THREE.Fog(new THREE.Color(0.66, 0.64, 0.6), 500, 7000);
    this.scene.fog = this.fog;

    // Ambient light comes from the sky itself (image-based), so PBR materials read as lit by the steppe sky.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"] as const) {
      envSky.material.uniforms[k].value = su[k].value;
    }
    envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envScene.add(envSky);
    this.envSky = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
    this.envRoom = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envSky;
    this.scene.environmentIntensity = 0.32;

    this.hemi = new THREE.HemisphereLight(0xbfd0e0, 0x6b5a34, 0.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd2a0, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.preset.shadow, this.preset.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    this.sun.target.position.copy(PLAZA);
    this.sun.position.copy(PLAZA).addScaledVector(SUN_DIR, 150);
    this.scene.add(this.sun, this.sun.target);

    this.fire = new THREE.PointLight(0xff7a2a, 9, 12, 1.4);
    this.fire.position.copy(HEARTH);
    this.scene.add(this.fire);

    // The excavation: at a 14 degree sun the pit floor sits in full shadow, so light it the way
    // the open sky and the sunlit walls would: a soft wide light from above and a warm bounce low in the pit.
    this.digLight = new THREE.SpotLight(0xf1ecdf, 28, 9, 1.0, 1.0, 2);
    this.digLight.position.copy(PIT).add(new THREE.Vector3(0.4, 4.2, 0.6));
    this.digLight.target.position.copy(PIT).add(new THREE.Vector3(0, -1.1, 0));
    this.digFill = new THREE.PointLight(0xffd9a8, 3.5, 5, 2);
    this.digFill.position.copy(PIT).add(new THREE.Vector3(-0.6, 0.2, -1.4));
    this.scene.add(this.digLight, this.digLight.target, this.digFill);

    // Museum: a key spot over the case, a cool rim and a soft fill.
    const key = new THREE.SpotLight(0xffeedd, 18, 8, 0.42, 0.7, 1.2);
    key.position.copy(b2t(0.4, -0.6, -297.4)); key.target.position.copy(MUSEUM_KNIFE);
    const rim = new THREE.SpotLight(0xc2d6ff, 10, 8, 0.6, 0.6, 1.2);
    rim.position.copy(b2t(-0.8, 1.0, -298.2)); rim.target.position.copy(MUSEUM_KNIFE);
    const fill = new THREE.PointLight(0xfff1e6, 1.5, 10, 1.2);
    fill.position.copy(b2t(0, -2.5, -297.5));
    for (const l of [key, rim, fill]) { this.scene.add(l); this.museumLights.push(l); }
    this.scene.add(key.target, rim.target);

    // The operator's own camera.
    this.operator = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 12000);
    this.rig = new OperatorRig(this.operator, canvas);
  }

  async load(url: string, onProgress?: LoadProgress) {
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf: GLTF = await loader.loadAsync(url, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    draco.dispose();
    const root = gltf.scene;
    this.scene.add(root);

    let terrain: THREE.Mesh | undefined;
    root.traverse((o) => {
      const ud = o.userData as { vis_start?: number; vis_end?: number };
      if (ud.vis_start !== undefined && ud.vis_end !== undefined && !(o as THREE.Camera).isCamera) {
        this.visible.push({ obj: o, start: ud.vis_start, end: ud.vis_end });
      }
      if ((o as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const name = o.name || o.parent?.name || "";
        const cam = o as THREE.PerspectiveCamera;
        this.filmCams.set(name.startsWith("CAM_") ? name : o.parent?.name ?? name, cam);
      }
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const n = m.name;
        // Helpers and the template house left at the origin are not part of the film.
        if (n.startsWith("Icosphere")) m.visible = false;
        const big = n.startsWith("Botai_Terrain") || n.startsWith("Web_Terrain") || n.startsWith("Museum_Room") || n.startsWith("River");
        m.castShadow = !big && !n.startsWith("Museum_Glass");
        m.receiveShadow = true;
        if (n === "Botai_Terrain_Near" || m.parent?.name === "Botai_Terrain_Near") terrain = m;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        if (n.startsWith("Museum_Glass")) for (const mat of mats) { mat.opacity = 0.035; mat.depthWrite = false; }
        for (const mat of mats) {
          const s = mat as THREE.MeshStandardMaterial;
          if (s.map) s.map.anisotropy = this.preset.anisotropy;
        }
      }
    });
    root.children
      .filter((o) => o.name === "House_Cluster")
      .forEach((o) => (o.visible = false));
    root.getObjectByName("Botai_Terrain_Far_LowPoly")?.traverse((o) => ((o as THREE.Mesh).receiveShadow = false));

    // Skeletons were sampled every second frame as steps; play them smoothly.
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      for (const tr of clip.tracks) tr.setInterpolation(THREE.InterpolateLinear);
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
    }

    if (terrain) this.buildGrass(terrain);
    this.buildFlames();
    this.applyTime(0);
  }

  // Dry steppe grass as instanced tufts, dense near the plaza and thinning out.
  private buildGrass(terrain: THREE.Mesh) {
    terrain.updateMatrixWorld(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (terrain.geometry as any).computeBoundsTree();
    const blades = 9;
    const pos: number[] = [];
    const col: number[] = [];
    const base = new THREE.Color(0.23, 0.22, 0.1);
    const tip = new THREE.Color(0.58, 0.52, 0.32);
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2 + Math.random() * 0.6;
      const lean = 0.05 + Math.random() * 0.14;
      const h = 0.12 + Math.random() * 0.22;
      const w = 0.006 + Math.random() * 0.004;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz * w, pz = dx * w;
      pos.push(px, 0, pz, -px, 0, -pz, dx * lean, h, dz * lean);
      const v = 0.75 + Math.random() * 0.4;
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r * v, tip.g * v, tip.b * (0.8 + Math.random() * 0.3));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
           float sway = sin(uTime*1.7 + ip.x*0.35 + ip.z*0.21) * 0.05 + sin(uTime*3.1 + ip.x) * 0.015;
           transformed.x += sway * position.y * 2.0;
           transformed.z += sway * position.y * 1.2;`
        );
    };
    const count = this.preset.grass;
    const mesh = new THREE.InstancedMesh(g, mat, count);
    mesh.receiveShadow = true;
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const down = new THREE.Vector3(0, -1, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 4; tries++) {
      const r = 160 * Math.pow(Math.random(), 1.9);
      const a = Math.random() * Math.PI * 2;
      const x = PLAZA.x + Math.cos(a) * r;
      const z = PLAZA.z + Math.sin(a) * r;
      if (Math.abs(x - PIT.x) < 3.4 && Math.abs(z - PIT.z) < 3.4) continue;
      if (Math.hypot(x - HEARTH.x, z - HEARTH.z) < 1.4) continue;
      ray.set(new THREE.Vector3(x, 400, z), down);
      const hit = ray.intersectObject(terrain, false)[0];
      if (!hit) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const k = 0.6 + Math.random() * 0.8;
      s.set(k, k * (0.8 + Math.random() * 0.6), k);
      m4.compose(hit.point, q, s);
      mesh.setMatrixAt(placed++, m4);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.grass = mesh;
    this.scene.add(mesh);
  }

  // Small rising embers and flame sprites over the hearth.
  private buildFlames() {
    const n = 90;
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seed[i * 3] = (Math.random() - 0.5) * 0.35;
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uScale: { value: this.renderer.getPixelRatio() * 420 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; uniform float uScale; varying float vLife;
        void main(){
          float life = fract(position.y + uTime * (0.55 + fract(position.x*37.0)*0.5));
          vLife = life;
          vec3 p = vec3(position.x*(1.0-life*0.7), life*0.75, position.z*(1.0-life*0.7));
          p.x += sin(uTime*4.0 + position.z*20.0)*0.03*life;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * (0.14 * (1.0 - life) + 0.02) / -mv.z;
        }`,
      fragmentShader: `
        varying float vLife;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife);
          vec3 c = mix(vec3(1.0,0.78,0.35), vec3(0.9,0.18,0.02), vLife);
          gl_FragColor = vec4(c * a * 1.6, a);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.position.copy(HEARTH).add(new THREE.Vector3(0, -0.28, 0));
    pts.frustumCulled = false;
    this.flames = pts;
    this.scene.add(pts);
  }

  get duration() { return DURATION; }
  get current() { return this.time; }
  get isPlaying() { return this.playing; }

  play() { if (this.time >= DURATION - 0.05) this.time = 0; this.playing = true; }
  pause() { this.playing = false; }
  seek(sec: number) { this.time = THREE.MathUtils.clamp(sec, 0, DURATION); this.applyTime(this.time); }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    if (mode === "operator") {
      this.rig.takeOver(this.filmCamera(), this.time * FPS >= FRAME_MUSEUM ? 1.2 : 4);
    }
    this.rig.enabled = mode === "operator";
    this.mode = mode;
  }

  // Operator lens in millimetres (full-frame 36 mm sensor, 16:9 frame).
  setLens(mm: number) {
    const sensorH = 36 / (16 / 9);
    this.operator.fov = THREE.MathUtils.radToDeg(2 * Math.atan(sensorH / 2 / mm));
    this.operator.updateProjectionMatrix();
  }

  get lens() {
    const sensorH = 36 / (16 / 9);
    return sensorH / 2 / Math.tan(THREE.MathUtils.degToRad(this.operator.fov) / 2);
  }

  private filmCamera(): THREE.PerspectiveCamera {
    const shot = shotAt(Math.floor(this.time * FPS) + 1);
    return this.filmCams.get(shot.camera) ?? this.filmCams.values().next().value ?? this.operator;
  }

  private applyTime(t: number) {
    const frame = t * FPS;
    this.mixer?.setTime(t);
    for (const v of this.visible) v.obj.visible = frame >= v.start - 1 && frame <= v.end;
    const museum = frame >= FRAME_MUSEUM - 1;
    const ancient = frame <= FRAME_ANCIENT_END;
    this.sky.visible = !museum;
    this.scene.fog = museum ? null : this.fog;
    this.sun.visible = !museum;
    this.hemi.visible = !museum;
    for (const l of this.museumLights) l.visible = museum;
    this.fire.visible = ancient;
    const dig = frame >= FRAME_ANCIENT_END && frame < FRAME_MUSEUM - 1;
    this.digLight.visible = dig;
    this.digFill.visible = dig;
    if (this.flames) this.flames.visible = ancient;
    if (this.grass) this.grass.visible = !museum;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.environment = museum ? this.envRoom ?? null : this.envSky ?? null;
    this.scene.environmentIntensity = museum ? 0.08 : dig ? 0.5 : 0.32;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    for (const c of this.filmCams.values()) { c.aspect = aspect; c.updateProjectionMatrix(); }
    this.operator.aspect = aspect;
    this.operator.updateProjectionMatrix();
  }

  // Debug hook for checks in the browser console.
  debug() {
    const f = this.time * FPS;
    return { time: this.time, frame: f, cam: this.filmCamera().name, sun: this.sun.visible, hemi: this.hemi.visible,
      visibleCount: this.visible.filter((v) => v.obj.visible).length };
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.clock.update();
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const wall = this.clock.getElapsed();
      this.uniforms.uTime.value = wall;
      if (this.playing) {
        this.time += dt;
        if (this.time >= DURATION) { this.time = DURATION; this.playing = false; }
        this.applyTime(this.time);
      }
      if (this.fire.visible) this.fire.intensity = 6 * (0.78 + 0.22 * Math.sin(wall * 11) * Math.sin(wall * 7.3 + 1.2));
      this.rig.update(dt);
      const cam = this.mode === "operator" ? this.operator : this.filmCamera();
      this.followShadow(cam);
      this.renderer.render(this.scene, cam);
      this.onTick?.(this.time);
    };
    loop();
  }

  // The sun's shadow box travels with the camera, snapped to a grid so shadows do not shimmer.
  private followShadow(cam: THREE.Camera) {
    if (!this.sun.visible) return;
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    d.y = 0;
    if (d.lengthSq() > 1e-6) p.addScaledVector(d.normalize(), 18);
    p.set(Math.round(p.x / 2) * 2, 0, Math.round(p.z / 2) * 2);
    if (p.distanceToSquared(this.shadowCenter) < 0.01) return;
    this.shadowCenter.copy(p);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 150);
    this.sun.target.updateMatrixWorld();
  }

  shotStart(n: number) {
    const s = SHOTS.find((x) => x.n === n);
    return s ? (s.start - 1) / FPS : 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.rig.dispose();
    this.envSky?.dispose();
    this.envRoom?.dispose();
    this.renderer.dispose();
  }
}
