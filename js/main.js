import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = [
    { name: 'Casa Moderna', desc: 'Diseño contemporáneo con grandes ventanales y espacios abiertos.', src: './assets/modelos/casa_moderna.glb' },
    { name: 'Casa Rústica', desc: 'Estilo colonial con acabados en madera y piedra natural.', src: './assets/modelos/casa_rustica.glb' },
    { name: 'Casa Minimalista', desc: 'Líneas puras, paleta neutra y máxima luz natural.', src: './assets/modelos/casa_minimalista.glb' },
];

const $ = (id) => document.getElementById(id);
const startScreen = $('start-screen');
const modelScreen = $('model-screen');
const arScreen = $('ar-screen');
const arContainer = $('ar-container');
const startButton = $('start-button');
const backButton = $('back-btn');
const arButton = $('ar-button');
const arFallbackNote = $('ar-fallback-note');
const carouselTrack = $('carousel-track');
const prevButton = $('prev-btn');
const nextButton = $('next-btn');
const dotsContainer = $('dots-container');
const modelName = $('model-name');
const modelDescription = $('model-desc');
const currentIndex = $('current-index');
const totalModels = $('total-models');
const arModel = $('ar-model');
const arExitButton = $('ar-exit-btn');
const arTutorialText = $('ar-tutorial-text');
const arStatusDot = $('ar-status-dot');
const arModelName = $('ar-model-name');
const arGestureLayer = $('ar-gesture-layer');

let currentSlide = 0;
let webXRSupported = false;
let renderer;
let scene;
let camera;
let reticle;
let modelAnchor;
let modelTransform;
let modelContent;
let xrSession;
let hitTestSource = null;
let hitTestSourceRequested = false;
let stableFrames = 0;
const STABLE_THRESHOLD = 12;
const BASE_MODEL_SCALE = 0.5;
const MIN_USER_SCALE = 0.25;
const MAX_USER_SCALE = 4;
const ROTATION_SENSITIVITY = 0.012;
const loadedModels = new Set([0]);
const dracoLoader = new DRACOLoader();
let userScale = 1;
let gestureStart = null;

// Los archivos .glb del proyecto están comprimidos con Draco. Model Viewer lo
// resuelve internamente, pero Three.js necesita este decodificador para WebXR.
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');

function show(element) {
    element.hidden = false;
}

function hide(element) {
    element.hidden = true;
}

async function detectCapabilities() {
    try {
        webXRSupported = Boolean(navigator.xr) && await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
        webXRSupported = false;
    }

    // En iPhone se conserva Model Viewer / Quick Look. En Android no se intenta abrir
    // Scene Viewer/ARCore: la ruta preferida es WebXR con hit-test.
    if (!webXRSupported && !/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        arButton.querySelector('span').textContent = 'Ver en 3D';
        arFallbackNote.hidden = false;
    }
}

function loadModel(index) {
    if (loadedModels.has(index)) return;
    const viewer = carouselTrack.children[index]?.querySelector('model-viewer');
    if (viewer) {
        viewer.setAttribute('src', MODELS[index].src);
        loadedModels.add(index);
    }
}

function updateCarousel() {
    carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
    modelName.textContent = MODELS[currentSlide].name;
    modelDescription.textContent = MODELS[currentSlide].desc;
    currentIndex.textContent = currentSlide + 1;
    prevButton.disabled = currentSlide === 0;
    nextButton.disabled = currentSlide === MODELS.length - 1;
    [...dotsContainer.children].forEach((dot, index) => dot.classList.toggle('active', index === currentSlide));

    [currentSlide - 1, currentSlide, currentSlide + 1]
        .filter((index) => index >= 0 && index < MODELS.length)
        .forEach(loadModel);
}

function goToSlide(index) {
    currentSlide = Math.max(0, Math.min(index, MODELS.length - 1));
    updateCarousel();
}

function initializeCarousel() {
    totalModels.textContent = MODELS.length;
    MODELS.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'dot';
        dot.setAttribute('aria-label', `Ir al modelo ${index + 1}`);
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });
    updateCarousel();
}

function buildReticle() {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const material = (opacity) => new THREE.MeshBasicMaterial({
        color: 0xc8a96e, side: THREE.DoubleSide, transparent: true, opacity,
    });
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.14, 32).rotateX(-Math.PI / 2), material(0.7));
    outer.name = 'outer';
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.045, 24).rotateX(-Math.PI / 2), material(0.5));
    inner.name = 'inner';
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2), material(1));
    dot.position.y = 0.001;
    group.add(outer, inner, dot);
    return group;
}

function setReticleState(locked) {
    const color = locked ? 0x5ee6c8 : 0xc8a96e;
    reticle.getObjectByName('outer').material.color.setHex(color);
    reticle.getObjectByName('inner').material.color.setHex(color);
    arStatusDot.classList.toggle('locked', locked);
    arTutorialText.textContent = locked
        ? 'Superficie detectada — toca para colocar'
        : 'Mueve tu cámara para escanear la superficie';
}

function initializeWebXR() {
    if (renderer) return;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    arScreen.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);
    reticle = buildReticle();
    reticle.visible = false;
    scene.add(reticle);

    window.addEventListener('resize', () => {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

async function loadARModel() {
    if (modelAnchor) scene.remove(modelAnchor);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    const gltf = await loader.loadAsync(MODELS[currentSlide].src);
    modelContent = gltf.scene;
    modelAnchor = new THREE.Group();
    modelTransform = new THREE.Group();
    modelAnchor.matrixAutoUpdate = false;
    modelAnchor.visible = false;
    modelTransform.add(modelContent);
    modelAnchor.add(modelTransform);
    userScale = 1;
    applyModelScale();
    scene.add(modelAnchor);
}

function applyModelScale() {
    if (!modelTransform) return;
    modelTransform.scale.setScalar(BASE_MODEL_SCALE * userScale);
    modelTransform.updateMatrix();
    modelTransform.matrixWorldNeedsUpdate = true;
}

function applyModelRotation(rotation) {
    if (!modelTransform) return;
    modelTransform.rotation.y = rotation;
    modelTransform.updateMatrix();
    modelTransform.matrixWorldNeedsUpdate = true;
}

function onXRFrame(_time, frame) {
    const session = renderer.xr.getSession();
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (!hitTestSourceRequested) {
        hitTestSourceRequested = true;
        session.requestReferenceSpace('viewer')
            .then((space) => session.requestHitTestSource({ space }))
            .then((source) => { hitTestSource = source; })
            .catch(() => { arTutorialText.textContent = 'No fue posible detectar superficies en este dispositivo.'; });
    }
    if (hitTestSource) {
        const hit = frame.getHitTestResults(hitTestSource)[0];
        const pose = hit?.getPose(referenceSpace);
        if (pose) {
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
            reticle.matrixWorldNeedsUpdate = true;
            const wasLocked = stableFrames >= STABLE_THRESHOLD;
            stableFrames = Math.min(stableFrames + 1, STABLE_THRESHOLD);
            if (!wasLocked && stableFrames === STABLE_THRESHOLD) setReticleState(true);
        } else {
            const wasLocked = stableFrames >= STABLE_THRESHOLD;
            reticle.visible = false;
            stableFrames = 0;
            if (wasLocked) setReticleState(false);
        }
    }
    renderer.render(scene, camera);
}

function placeModel() {
    if (!modelAnchor || !reticle.visible || stableFrames < STABLE_THRESHOLD) return;
    modelAnchor.visible = true;
    modelAnchor.matrix.copy(reticle.matrix);
    modelAnchor.matrixWorldNeedsUpdate = true;
    arTutorialText.textContent = 'Modelo colocado — apunta la retícula y toca para moverlo. Usa dos dedos para escalar.';
}

function touchDistance(firstTouch, secondTouch) {
    return Math.hypot(firstTouch.clientX - secondTouch.clientX, firstTouch.clientY - secondTouch.clientY);
}

function resetARGesture() {
    gestureStart = null;
}

function handleARTouchStart(event) {
    const { touches } = event;
    if (touches.length === 2 && modelContent && modelAnchor?.visible) {
        event.preventDefault();
        gestureStart = {
            type: 'pinch',
            distance: touchDistance(touches[0], touches[1]),
            scale: userScale,
        };
        return;
    }

    if (touches.length === 1) {
        gestureStart = {
            type: 'one-finger',
            x: touches[0].clientX,
            y: touches[0].clientY,
            time: performance.now(),
            rotation: modelTransform?.rotation.y ?? 0,
        };
    }
}

function handleARTouchMove(event) {
    if (!gestureStart) return;

    if (event.touches.length === 2 && gestureStart.type === 'pinch') {
        event.preventDefault();
        const ratio = touchDistance(event.touches[0], event.touches[1]) / gestureStart.distance;
        userScale = THREE.MathUtils.clamp(gestureStart.scale * ratio, MIN_USER_SCALE, MAX_USER_SCALE);
        applyModelScale();
        arTutorialText.textContent = `Escala: ${Math.round(BASE_MODEL_SCALE * userScale * 100)}% — separa o junta dos dedos.`;
        return;
    }

    if (event.touches.length === 1 && gestureStart.type === 'one-finger' && modelAnchor?.visible) {
        const deltaX = event.touches[0].clientX - gestureStart.x;
        if (Math.abs(deltaX) < 8) return;
        event.preventDefault();
        gestureStart.type = 'rotate';
        applyModelRotation(gestureStart.rotation + deltaX * ROTATION_SENSITIVITY);
        arTutorialText.textContent = 'Rotando modelo — arrastra a la izquierda o derecha.';
    }
}

function handleARTouchEnd(event) {
    if (!gestureStart || event.touches.length > 0) return;
    const completedGesture = gestureStart;
    resetARGesture();

    if (completedGesture.type === 'rotate') {
        arTutorialText.textContent = 'Modelo rotado — toca una superficie para moverlo o usa dos dedos para escalar.';
        return;
    }

    if (completedGesture.type !== 'one-finger') return;
    const elapsed = performance.now() - completedGesture.time;
    const touch = event.changedTouches[0];
    const movement = Math.hypot(touch.clientX - completedGesture.x, touch.clientY - completedGesture.y);
    if (elapsed < 350 && movement < 18) placeModel();
}

function endWebXR() {
    hitTestSource?.cancel();
    hitTestSource = null;
    hitTestSourceRequested = false;
    stableFrames = 0;
    resetARGesture();
    renderer?.setAnimationLoop(null);
    hide(arScreen);
    show(modelScreen);
    xrSession = null;
}

async function startWebXR() {
    const buttonLabel = arButton.querySelector('span');
    try {
        hide(modelScreen);
        show(arScreen);
        arModelName.textContent = MODELS[currentSlide].name;
        arTutorialText.textContent = 'Solicitando permiso de cámara…';
        buttonLabel.textContent = 'Abriendo AR…';
        initializeWebXR();

        // Debe ejecutarse directamente desde el clic del usuario. Si esperamos a
        // descargar el GLB antes de esta línea, Chrome puede rechazar WebXR sin
        // mostrar el diálogo de permiso de cámara.
        xrSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: $('ar-overlay') },
        });
        xrSession.addEventListener('end', endWebXR, { once: true });
        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(xrSession);
        reticle.visible = false;
        setReticleState(false);
        renderer.setAnimationLoop(onXRFrame);
        arTutorialText.textContent = 'Cargando modelo…';
        await loadARModel();
    } catch (error) {
        console.error('No se pudo iniciar WebXR:', error);
        arFallbackNote.textContent = 'No se pudo iniciar AR. Permite la cámara en Chrome y verifica que el sitio use HTTPS.';
        arFallbackNote.hidden = false;
        if (xrSession) await xrSession.end();
        else {
            hide(arScreen);
            show(modelScreen);
        }
    } finally {
        buttonLabel.textContent = 'Ver en AR';
    }
}

function openModelViewer() {
    arModel.setAttribute('src', MODELS[currentSlide].src);
    hide(modelScreen);
    show(arContainer);
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && arModel.activateAR) {
        arModel.activateAR().catch(() => { /* El visor 3D permanece disponible. */ });
    }
}

startButton.addEventListener('click', () => { hide(startScreen); show(modelScreen); updateCarousel(); });
backButton.addEventListener('click', () => { hide(modelScreen); show(startScreen); });
prevButton.addEventListener('click', () => goToSlide(currentSlide - 1));
nextButton.addEventListener('click', () => goToSlide(currentSlide + 1));
arButton.addEventListener('click', () => webXRSupported ? startWebXR() : openModelViewer());
arExitButton.addEventListener('click', () => xrSession?.end());
arGestureLayer.addEventListener('touchstart', handleARTouchStart, { passive: false });
arGestureLayer.addEventListener('touchmove', handleARTouchMove, { passive: false });
arGestureLayer.addEventListener('touchend', handleARTouchEnd, { passive: false });
arGestureLayer.addEventListener('touchcancel', resetARGesture, { passive: true });
arModel.addEventListener('ar-status', ({ detail }) => {
    if (detail.status === 'not-presenting' || detail.status === 'session-ended') {
        hide(arContainer);
        show(modelScreen);
    }
});

let touchStartX = 0;
carouselTrack.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
carouselTrack.addEventListener('touchend', (event) => {
    if (Math.abs(touchStartX - event.changedTouches[0].screenX) > 40) {
        goToSlide(currentSlide + (touchStartX > event.changedTouches[0].screenX ? 1 : -1));
    }
}, { passive: true });

initializeCarousel();
detectCapabilities();
