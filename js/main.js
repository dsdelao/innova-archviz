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

let currentSlide = 0;
let webXRSupported = false;
let renderer;
let scene;
let camera;
let reticle;
let activeModel;
let xrSession;
let hitTestSource = null;
let hitTestSourceRequested = false;
let stableFrames = 0;
const STABLE_THRESHOLD = 12;
const loadedModels = new Set([0]);
const dracoLoader = new DRACOLoader();

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
    if (activeModel) scene.remove(activeModel);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    const gltf = await loader.loadAsync(MODELS[currentSlide].src);
    activeModel = gltf.scene;
    activeModel.visible = false;
    activeModel.matrixAutoUpdate = false;
    scene.add(activeModel);
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
            stableFrames = Math.min(stableFrames + 1, STABLE_THRESHOLD);
            if (stableFrames === STABLE_THRESHOLD) setReticleState(true);
        } else {
            reticle.visible = false;
            stableFrames = 0;
            setReticleState(false);
        }
    }
    renderer.render(scene, camera);
}

function placeModel() {
    if (!activeModel || !reticle.visible || stableFrames < STABLE_THRESHOLD) return;
    activeModel.visible = true;
    activeModel.matrix.copy(reticle.matrix);
    arTutorialText.textContent = 'Modelo colocado — toca una superficie para reposicionarlo';
}

function endWebXR() {
    hitTestSource?.cancel();
    hitTestSource = null;
    hitTestSourceRequested = false;
    stableFrames = 0;
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
        xrSession.addEventListener('select', placeModel);
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
