// Real-3D board renderer (Three.js). Renders the Tetris well + blocks as actual
// 3D metal cubes with environment reflections, on its own WebGL canvas behind the
// 2D effects overlay. The game logic stays in GameScene; this only draws.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD, METAL } from './config/pieces.js';

const KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'X'];

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.COLS = BOARD.cols;
    this.ROWS = BOARD.rows;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1e);

    // environment map → real chrome reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x223052, 0.85)); // fresh sky/ground fill
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-7, 14, 16); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ec3ff, 0.95); fill.position.set(9, -3, 10); this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // shared geometry (slightly rounded cube = premium edges)
    const geo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 3, 0.12);
    const MAX = this.COLS * this.ROWS + 16;
    this.meshes = {};
    for (const k of KEYS) {
      const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(METAL[k].mid), metalness: 1.0, roughness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 1.55 });
      const inst = new THREE.InstancedMesh(geo, mat, MAX);
      inst.count = 0; inst.frustumCulled = false;
      this.group.add(inst);
      this.meshes[k] = inst;
    }
    // ghost (transparent)
    const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, metalness: 0.4, roughness: 0.5 });
    this.ghost = new THREE.InstancedMesh(geo, gmat, this.COLS * 4);
    this.ghost.count = 0; this.ghost.frustumCulled = false;
    this.group.add(this.ghost);

    this._buildWell();
    this._dummy = new THREE.Object3D();
    this._shakeX = 0; this._shakeY = 0;
    this.resize();
  }

  cellToWorld(c, r) { return [c - (this.COLS - 1) / 2, (this.ROWS - 1) / 2 - r, 0]; }

  _buildWell() {
    const w = this.COLS, h = this.ROWS;
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.25, h + 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222a48, metalness: 0.25, roughness: 0.82 })
    );
    back.position.set(0, 0, -0.85);
    this.group.add(back);

    // slim side rails → the well sits almost edge-to-edge (less framing on mobile)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6c7fc8, metalness: 0.95, roughness: 0.18 });
    const railGeo = new THREE.BoxGeometry(0.1, h + 0.7, 1.3);
    const left = new THREE.Mesh(railGeo, railMat); left.position.set(-(w / 2) - 0.05, 0, -0.15); this.group.add(left);
    const right = left.clone(); right.position.x = (w / 2) + 0.05; this.group.add(right);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.14, 1.3), railMat);
    floor.position.set(0, -(h / 2) - 0.07, -0.15); this.group.add(floor);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width) || 360);
    const h = Math.max(1, Math.round(r.height) || 640);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // fit so the ROWS-tall board fills ~78% of the view height (matches the 2D layout)
    const viewH = this.ROWS / 0.965; // fill almost the full portrait height
    const dist = (viewH / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(0, 2.0, dist);
    this.camera.lookAt(0, 0.2, 0); // gentle tilt to show cube tops
    this.camera.updateProjectionMatrix();
  }

  setTheme(theme) {
    if (!theme) return;
    const key = (theme.field || '') + '|' + (theme.accent2 || '') + '|' + (theme.accent || '');
    if (key === this._themeKey) return;
    this._themeKey = key;
    // fresh vertical gradient: bright tinted top → deep bottom
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
    const x = cv.getContext('2d');
    // muted / calmer gradient (softer on the eyes) — lerp further toward neutral dark
    const top = new THREE.Color(theme.accent2 || '#7be0ff').lerp(new THREE.Color(0x2a3052), 0.55).getStyle();
    const mid = new THREE.Color(theme.accent || '#4a6abf').lerp(new THREE.Color(0x141a32), 0.58).getStyle();
    const bot = new THREE.Color(theme.field || '#10142e').lerp(new THREE.Color(0x0a0c18), 0.4).getStyle();
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top); g.addColorStop(0.5, mid); g.addColorStop(1, bot);
    x.fillStyle = g; x.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(cv);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    if (this.scene.background && this.scene.background.isTexture) this.scene.background.dispose();
    this.scene.background = tex;
  }

  sync(board, cur, ghostY) {
    const counts = {}; for (const k of KEYS) counts[k] = 0;
    const put = (inst, idx, c, r) => { const [x, y, z] = this.cellToWorld(c, r); this._dummy.position.set(x, y, z); this._dummy.updateMatrix(); inst.setMatrixAt(idx, this._dummy.matrix); };
    for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) { const k = board[r][c]; if (k && this.meshes[k]) put(this.meshes[k], counts[k]++, c, r); }
    if (cur) {
      const k = cur.key;
      for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m.length; x++) {
        if (cur.m[y][x]) { const r = cur.y + y, c = cur.x + x; if (r >= 0) put(this.meshes[k], counts[k]++, c, r); }
      }
    }
    for (const k of KEYS) { const inst = this.meshes[k]; inst.count = counts[k]; inst.instanceMatrix.needsUpdate = true; }
    // ghost
    let gc = 0;
    if (cur) for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m.length; x++) {
      if (cur.m[y][x]) { const r = ghostY + y, c = cur.x + x; if (r >= 0) put(this.ghost, gc++, c, r); }
    }
    this.ghost.count = gc; this.ghost.instanceMatrix.needsUpdate = true;
  }

  render(shakeX = 0, shakeY = 0) {
    this.group.position.x = shakeX * 0.05;
    this.group.position.y = -shakeY * 0.05;
    this.renderer.render(this.scene, this.camera);
  }
}
