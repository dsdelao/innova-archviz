# Innova Archviz — AR Terreno

Aplicacion web de Realidad Augmentada para visualizar modelos 3D de casas sobre superficies reales usando la camara del dispositivo movil.

## Demo

Visita la URL publica del proyecto (consultar al administrador).

## Funcionalidades

- Landing page responsive con instrucciones
- Carrusel de modelos 3D con navegacion tactil
- Lazy-loading de modelos (solo carga el visible + vecinos)
- AR con reticula visual (Android WebXR + Three.js + hit-test)
- AR fallback con Quick Look (iOS Model Viewer)
- Deteccion automatica de capacidades AR
- Meta tags Open Graph y Twitter Card
- Modelos GLB optimizados con Draco (54% reduccion)

## Tecnologias

- HTML5 / CSS3 / JavaScript vanilla
- Google Model Viewer 3.5.0
- Three.js 0.160.0 (WebXR + GLTFLoader)
- gltf-transform (compresion Draco)
- nginx (servidor)

## Estructura

```
/
├── index.html                  (app principal)
├── css/style.css               (estilos)
├── js/main.js                  (logica)
├── assets/
│   ├── img/1401977.png         (imagen OG)
│   └── modelos/
│       ├── casa_moderna.glb    (2.6 MB)
│       ├── casa_rustica.glb    (1.1 MB)
│       └── casa_minimalista.glb (2.9 MB)
└── DEVELOPERS.md               (guia para el equipo)
```

## Dispositivos

| Dispositivo | Navegador | 3D | AR | Metodo |
|-------------|-----------|----|----|--------|
| Android | Chrome | OK | OK | WebXR + reticula |
| iOS | Safari | OK | OK | Quick Look |
| Desktop | Chrome/Firefox | OK | No | Visor 3D |

## Despliegue

Los cambios en la rama `main` se despliegan automaticamente al servidor.

Consultar `DEVELOPERS.md` para instrucciones detalladas.

## Autor

SteelFenix09 — @steelfenix09
