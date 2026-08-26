// ── Datos de los modelos ──────────────────────────────────────────────────────
const MODELS = [
    {
        name: 'Casa Moderna',
        description: 'Diseno contemporaneo con grandes ventanales, techos planos y espacios abiertos. Ideal para terrenos amplios.',
        src: './assets/modelos/casa_moderna.glb',
    },
    {
        name: 'Casa Rustica',
        description: 'Estilo colonial con acabados en madera y piedra natural. Perfecta para entornos campestres o suburbanos.',
        src: './assets/modelos/casa_rustica.glb',
    },
    {
        name: 'Casa Minimalista',
        description: 'Lineas puras, paleta neutra y maximo aprovechamiento de luz natural. Elegancia en cada detalle.',
        src: './assets/modelos/casa_minimalista.glb',
    },
];

// ── Referencias DOM ───────────────────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');
const modelScreen = document.getElementById('model-screen');
const arContainer = document.getElementById('ar-container');
const startButton = document.getElementById('start-button');
const backBtn = document.getElementById('back-btn');
const arButton = document.getElementById('ar-button');
const arFallbackNote = document.getElementById('ar-fallback-note');

const arModel = document.getElementById('ar-model');
const carouselTrack = document.getElementById('carousel-track');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const dotsContainer = document.getElementById('dots-container');
const modelNameEl = document.getElementById('model-name');
const modelDescEl = document.getElementById('model-desc');
const currentIndexEl = document.getElementById('current-index');
const totalModelsEl = document.getElementById('total-models');

// ── Estado ───────────────────────────────────────────────────────────────────
let currentSlide = 0;
let arSupported = false;

// ── Deteccion de capacidades AR ──────────────────────────────────────────────
async function detectAR() {
    if (navigator.xr) {
        try {
            arSupported = await navigator.xr.isSessionSupported('immersive-ar');
        } catch (e) {
            arSupported = false;
        }
    }

    if (!arSupported) {
        arButton.textContent = 'Ver en 3D';
        arButton.querySelector('svg').style.display = 'none';
        if (arFallbackNote) arFallbackNote.style.display = 'block';
    }

    console.log(`AR soportado: ${arSupported}`);
}

// ── Lazy loading de modelos ──────────────────────────────────────────────────
const loadedModels = new Set();

function loadModel(index) {
    if (loadedModels.has(index)) return;

    const slide = carouselTrack.children[index];
    if (!slide) return;

    const viewer = slide.querySelector('model-viewer');
    if (viewer && MODELS[index] && !viewer.getAttribute('src')) {
        viewer.setAttribute('src', MODELS[index].src);
        loadedModels.add(index);
        console.log(`Modelo ${index} cargado: ${MODELS[index].name}`);
    }
}

// ── Inicializar carrusel ──────────────────────────────────────────────────────
totalModelsEl.textContent = MODELS.length;

// Cargar primer modelo inmediatamente
loadModel(0);

// Crear dots
MODELS.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('dot');
    if (i === 0) dot.classList.add('active');
    dot.setAttribute('aria-label', `Ir al modelo ${i + 1}`);
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
});

function updateCarouselUI() {
    // Mover track
    carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;

    // Texto
    modelNameEl.textContent = MODELS[currentSlide].name;
    modelDescEl.textContent = MODELS[currentSlide].description;

    // Contador
    currentIndexEl.textContent = currentSlide + 1;

    // Dots
    document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
    });

    // Botones prev/next
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === MODELS.length - 1;

    // Lazy load: cargar modelo anterior, actual y siguiente
    if (currentSlide > 0) loadModel(currentSlide - 1);
    loadModel(currentSlide);
    if (currentSlide < MODELS.length - 1) loadModel(currentSlide + 1);
}

function goToSlide(index) {
    currentSlide = Math.max(0, Math.min(index, MODELS.length - 1));
    updateCarouselUI();
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

// ── Swipe tactil ─────────────────────────────────────────────────────────────
let touchStartX = 0;
let touchEndX = 0;

carouselTrack.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

carouselTrack.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 40) {
        diff > 0 ? goToSlide(currentSlide + 1) : goToSlide(currentSlide - 1);
    }
}, { passive: true });

// ── Navegacion entre pantallas ────────────────────────────────────────────────
startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    modelScreen.style.display = 'flex';
    updateCarouselUI();
});

backBtn.addEventListener('click', () => {
    modelScreen.style.display = 'none';
    startScreen.style.display = 'flex';
});

// ── Activar AR ────────────────────────────────────────────────────────────────
arButton.addEventListener('click', async () => {
    const activeModel = MODELS[currentSlide];
    arModel.setAttribute('src', activeModel.src);

    modelScreen.style.display = 'none';
    arContainer.style.display = 'flex';

    // Activar AR en model-viewer
    if (arModel.activateAR) {
        try {
            await arModel.activateAR();
        } catch (err) {
            console.warn('No se pudo activar AR:', err);
            // Fallback: mostrar visor 3D
            arContainer.style.display = 'none';
            modelScreen.style.display = 'flex';
        }
    }
});

// ── Eventos del AR model-viewer ───────────────────────────────────────────────
if (arModel) {
    arModel.addEventListener('ar-status', e => {
        console.log('Estado AR:', e.detail.status);

        if (e.detail.status === 'not-presenting' || e.detail.status === 'session-ended') {
            arContainer.style.display = 'none';
            modelScreen.style.display = 'flex';
        }
    });
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    // model-viewer maneja su propia limpieza
});

// ── Inicializacion ────────────────────────────────────────────────────────────
detectAR();

// Dispositivo
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
console.log(`Dispositivo: ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop'}`);
