# Guia de Desarrollo — Innova Archviz

## Primer Setup

```bash
# 1. Clonar el repo
git clone https://github.com/dsdelao/innova-archviz.git
cd innova-archviz

# 2. Preguntar al administrador por el remote de deploy
git remote -v
```

## Flujo de Trabajo

### Hacer cambios

1. Editar archivos localmente
2. Probar con `python3 -m http.server 8000`
3. Abrir `http://localhost:8000/` en el navegador

### Desplegar

```bash
# Push a GitHub (el servidor detecta y despliega automaticamente)
git add -A
git commit -m "feat: descripcion del cambio"
git push origin main
```

El servidor revisa GitHub cada minuto y despliega los cambios automaticamente.

## Estructura del Proyecto

```
innova-archviz/
├── index.html              ← App principal (reticula AR)
├── css/style.css           ← Estilos
├── js/main.js              ← Logica carrusel + AR detection
├── assets/
│   ├── img/1401977.png     ← Imagen OG
│   └── modelos/
│       ├── casa_moderna.glb      (2.6 MB)
│       ├── casa_rustica.glb      (1.1 MB)
│       └── casa_minimalista.glb  (2.9 MB)
└── README.md
```

## Archivos GLB

Los modelos 3D estan comprimidos con Draco.

**Para agregar un modelo nuevo:**
1. Poner el `.glb` en `assets/modelos/`
2. Optimizar:
   ```bash
   npx @gltf-transform/cli optimize assets/modelos/nuevo.glb assets/modelos/nuevo.glb --compress draco
   ```
3. Hacer push:
   ```bash
   git add assets/modelos/nuevo.glb
   git commit -m "feat: agregar modelo nuevo"
   git push origin main
   ```

## Solucion de Problemas

### El modelo no carga
- Verificar que el GLB existe en `assets/modelos/`
- Verificar en el navegador: F12 → Console → buscar errores

### AR no funciona
- **Android**: necesita Chrome en HTTPS (o localhost)
- **iOS**: necesita Safari + Quick Look habilitado
- **Desktop**: solo visor 3D (sin AR)

### Los cambios no se despliegan
- Verificar que el push a GitHub fue exitoso
- Esperar hasta 1 minuto (el servidor revisa periodicamente)
- Preguntar al administrador si hay problemas
