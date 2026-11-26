import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = [
  { name: 'Casa Moderna', desc: 'Diseño contemporáneo con grandes ventanales y espacios abiertos.', src: './assets/modelos/casa_moderna.glb' },
  { name: 'Casa Rústica', desc: 'Estilo colonial con acabados en madera y piedra natural.', src: './assets/modelos/casa_rustica.glb' },
  { name: 'Casa Minimalista', desc: 'Líneas puras, paleta neutra y máxima luz natural.', src: './assets/modelos/casa_minimalista.glb' },
];

const $ = (id) => document.getElementById(id);
const el = {
  start: $('start-screen'), model: $('model-screen'), arScreen: $('ar-screen'),
  arContainer: $('ar-container'), startBtn: $('start-button'), backBtn: $('back-btn'),
  arBtn: $('ar-button'), arNote: $('ar-fallback-note'), track: $('carousel-track'),
  prev: $('prev-btn'), next: $('next-btn'), dots: $('dots-container'),
  name: $('model-name'), desc: $('model-desc'), index: $('current-index'),
  total: $('total-models'), arModel: $('ar-model'), arExit: $('ar-exit-btn'),
  arText: $('ar-tutorial-text'), arDot: $('ar-status-dot'), arName: $('ar-model-name'),
  gesture: $('ar-gesture-layer'),
};

let current = 0;
let webXR = false;

// ── WebXR state ────────────────────────────────────────────────────────────
const xr = { renderer: null, scene: null, camera: null, reticle: null, anchor: null, transform: null, hitSource: null, requested: false, locked: false };
const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');
const BASE_SCALE = 0.5;
const MIN_SCALE = 0.25, MAX_SCALE = 4;
let userScale = 1, targetScale = 1, targetRotation = 0, rotation = 0;
let gesture = null;

// ── Utilidades ─────────────────────────────────────────────────────────────
const show = (e) => (e.hidden = false);
const hide = (e) => (e.hidden = true);

async function detectCapabilities() {
  try {
    webXR = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'));
  } catch { webXR = false; }

  if (!webXR && !/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    el.arBtn.querySelector('span').textContent = 'Ver en 3D';
    el.arNote.hidden = false;
  }
}

// ── Carrusel ───────────────────────────────────────────────────────────────
function updateCarousel() {
  el.track.style.transform = `translateX(-${current * 100}%)`;
  const m = MODELS[current];
  el.name.textContent = m.name;
  el.desc.textContent = m.desc;
  el.index.textContent = current + 1;
  el.prev.disabled = current === 0;
  el.next.disabled = current === MODELS.length - 1;
  [...el.dots.children].forEach((d, i) => d.classList.toggle('active', i === current));
  document.querySelectorAll('.carousel-slide model-viewer').forEach((v, i) => {
    if (!v.getAttribute('src') && Math.abs(i - current) <= 1) v.setAttribute('src', MODELS[i].src);
  });
}

function goTo(i) {
  current = Math.max(0, Math.min(i, MODELS.length - 1));
  updateCarousel();
}

function initCarousel() {
  el.total.textContent = MODELS.length;
  MODELS.forEach((_, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'dot';
    d.setAttribute('aria-label', `Ir al modelo ${i + 1}`);
    d.addEventListener('click', () => goTo(i));
    el.dots.appendChild(d);
  });
  updateCarousel();
}

// ── WebXR: setup ───────────────────────────────────────────────────────────
function initXR() {
  if (xr.renderer) return;
  xr.scene = new THREE.Scene();
  xr.camera = new THREE.PerspectiveCamera();
  xr.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  xr.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  xr.renderer.setSize(innerWidth, innerHeight);
  xr.renderer.xr.enabled = true;
  el.arScreen.prepend(xr.renderer.domElement);

  xr.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(0.5, 1, 0.25);
  xr.scene.add(dir);

  xr.reticle = buildReticle();
  xr.reticle.visible = false;
  xr.scene.add(xr.reticle);

  addEventListener('resize', () => xr.renderer?.setSize(innerWidth, innerHeight));
}

function buildReticle() {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xc8a96e, side: THREE.DoubleSide, transparent: true, opacity: o });
  const outer = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.14, 32).rotateX(-Math.PI / 2), mat(0.7));
  outer.name = 'outer';
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.045, 24).rotateX(-Math.PI / 2), mat(0.5));
  inner.name = 'inner';
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2), mat(1));
  dot.position.y = 0.001;
  g.add(outer, inner, dot);
  return g;
}

function setReticleLocked(locked) {
  xr.locked = locked;
  const c = locked ? 0x5ee6c8 : 0xc8a96e;
  xr.reticle.getObjectByName('outer').material.color.setHex(c);
  xr.reticle.getObjectByName('inner').material.color.setHex(c);
  el.arDot.classList.toggle('locked', locked);
  el.arText.textContent = locked ? 'Superficie detectada — toca para colocar' : 'Mueve tu cámara para escanear la superficie';
}

// ── WebXR: modelo ──────────────────────────────────────────────────────────
async function loadXRModel() {
  if (xr.anchor) xr.scene.remove(xr.anchor);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(MODELS[current].src);

  xr.anchor = new THREE.Group();
  xr.anchor.matrixAutoUpdate = false;
  xr.anchor.visible = false;
  xr.transform = new THREE.Group();
  xr.transform.add(gltf.scene);
  xr.anchor.add(xr.transform);
  xr.scene.add(xr.anchor);

  userScale = targetScale = 1;
  rotation = targetRotation = 0;
  xr.transform.scale.setScalar(BASE_SCALE);
}

// ── WebXR: loop ────────────────────────────────────────────────────────────
function onXRFrame(_t, frame) {
  const session = xr.renderer.xr.getSession();
  const refSpace = xr.renderer.xr.getReferenceSpace();

  if (!xr.requested) {
    xr.requested = true;
    session.requestReferenceSpace('viewer')
      .then((space) => session.requestHitTestSource({ space }))
      .then((src) => (xr.hitSource = src))
      .catch(() => (el.arText.textContent = 'No fue posible detectar superficies.'));
  }

  if (xr.hitSource) {
    const pose = frame.getHitTestResults(xr.hitSource)[0]?.getPose(refSpace);
    if (pose) {
      xr.reticle.visible = true;
      xr.reticle.matrix.fromArray(pose.transform.matrix);
      if (!xr.locked) setReticleLocked(true);
    } else {
      xr.reticle.visible = false;
      if (xr.locked) setReticleLocked(false);
    }
  }

  // Suavizado: interpolamos escala y rotación hacia el objetivo
  if (xr.transform) {
    userScale += (targetScale - userScale) * 0.15;
    rotation += (targetRotation - rotation) * 0.15;
    xr.transform.scale.setScalar(BASE_SCALE * userScale);
    xr.transform.rotation.y = rotation;
  }

  xr.renderer.render(xr.scene, xr.camera);
}

// ── WebXR: gestos suaves ───────────────────────────────────────────────────
// Sin capa separada: usamos el propio canvas del renderer.
function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

function onTouchStart(e) {
  if (e.touches.length === 2 && xr.anchor?.visible) {
    e.preventDefault();
    gesture = { type: 'pinch', dist: dist(e.touches[0], e.touches[1]), scale: targetScale };
  } else if (e.touches.length === 1) {
    gesture = { type: 'one', x: e.touches[0].clientX, rotation: targetRotation };
  }
}

function onTouchMove(e) {
  if (!gesture) return;
  if (e.touches.length === 2 && gesture.type === 'pinch') {
    e.preventDefault();
    const ratio = dist(e.touches[0], e.touches[1]) / gesture.dist;
    targetScale = THREE.MathUtils.clamp(gesture.scale * ratio, MIN_SCALE, MAX_SCALE);
    el.arText.textContent = `Escala: ${Math.round(BASE_SCALE * targetScale * 100)}%`;
    return;
  }
  if (e.touches.length === 1 && gesture.type === 'one' && xr.anchor?.visible) {
    const dx = e.touches[0].clientX - gesture.x;
    if (Math.abs(dx) < 6) return;
    e.preventDefault();
    gesture.type = 'rotate';
    targetRotation = gesture.rotation + dx * 0.012;
    el.arText.textContent = 'Rotando modelo…';
  }
}

function onTouchEnd(e) {
  if (!gesture || e.touches.length > 0) return;
  const g = gesture;
  gesture = null;
  if (g.type === 'one') {
    const t = e.changedTouches[0];
    const move = Math.hypot(t.clientX - g.x, t.clientY - (g.y || 0));
    const elapsed = performance.now() - (g.time || 0);
    if (elapsed < 350 && move < 18) placeModel();
  }
}

function placeModel() {
  if (!xr.anchor || !xr.reticle.visible || !xr.locked) return;
  xr.anchor.visible = true;
  xr.anchor.matrix.copy(xr.reticle.matrix);
  xr.anchor.matrixWorldNeedsUpdate = true;
  el.arText.textContent = 'Modelo colocado — toca para moverlo, dos dedos para escalar.';
}

// ── WebXR: ciclo de vida ───────────────────────────────────────────────────
function endXR() {
  xr.hitSource?.cancel();
  xr.hitSource = null;
  xr.requested = false;
  xr.locked = false;
  gesture = null;
  xr.renderer?.setAnimationLoop(null);
  hide(el.arScreen);
  show(el.model);
}

async function startXR() {
  const label = el.arBtn.querySelector('span');
  try {
    hide(el.model);
    show(el.arScreen);
    el.arName.textContent = MODELS[current].name;
    el.arText.textContent = 'Solicitando permiso de cámara…';
    label.textContent = 'Abriendo AR…';
    initXR();

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: $('ar-overlay') },
    });
    session.addEventListener('end', endXR, { once: true });
    xr.renderer.xr.setReferenceSpaceType('local');
    await xr.renderer.xr.setSession(session);
    setReticleLocked(false);
    xr.renderer.setAnimationLoop(onXRFrame);
    el.arText.textContent = 'Cargando modelo…';
    await loadXRModel();
  } catch (err) {
    console.error('WebXR error:', err);
    el.arNote.textContent = 'No se pudo iniciar AR. Permite la cámara en Chrome y usa HTTPS.';
    el.arNote.hidden = false;
    hide(el.arScreen);
    show(el.model);
  } finally {
    label.textContent = 'Ver en AR';
  }
}

// ── Model Viewer (fallback iOS / no-WebXR) ─────────────────────────────────
function openModelViewer() {
  el.arModel.setAttribute('src', MODELS[current].src);
  hide(el.model);
  show(el.arContainer);
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && el.arModel.activateAR) {
    el.arModel.activateAR().catch(() => {});
  }
}

// ── Eventos ────────────────────────────────────────────────────────────────
el.startBtn?.addEventListener('click', () => { hide(el.start); show(el.model); updateCarousel(); });
el.backBtn?.addEventListener('click', () => { hide(el.model); show(el.start); });
el.prev?.addEventListener('click', () => goTo(current - 1));
el.next?.addEventListener('click', () => goTo(current + 1));
el.arBtn?.addEventListener('click', () => (webXR ? startXR() : openModelViewer()));
el.arExit?.addEventListener('click', () => xr.renderer?.xr.getSession()?.end());

// Gestos en el canvas del renderer (no en capa aparte)
document.addEventListener('DOMContentLoaded', () => {
  if (!el.arScreen) return;
  el.arScreen.addEventListener('touchstart', onTouchStart, { passive: false });
  el.arScreen.addEventListener('touchmove', onTouchMove, { passive: false });
  el.arScreen.addEventListener('touchend', onTouchEnd, { passive: false });
  el.arScreen.addEventListener('touchcancel', () => (gesture = null), { passive: true });
});

el.arModel?.addEventListener('ar-status', ({ detail }) => {
  if (detail.status === 'not-presenting' || detail.status === 'session-ended') {
    hide(el.arContainer);
    show(el.model);
  }
});

// Carrusel táctil (usa pointer events, más limpio)
let dragX = null;
el.track?.addEventListener('pointerdown', (e) => (dragX = e.clientX));
el.track?.addEventListener('pointerup', (e) => {
  if (dragX !== null && Math.abs(dragX - e.clientX) > 40) goTo(current + (dragX > e.clientX ? 1 : -1));
  dragX = null;
});

initCarousel();
detectCapabilities();