# Mutus para Lupa

Silencia el vídeo durante los anuncios detectados en YouTube y restaura el estado de mute anterior. Incluye toggle y contador.

Versión de la extensión: **0.2.0**. Manifest V3, JavaScript sin paso de compilación.

## Instalar en Chromium

```sh
git clone https://github.com/bunxdev/lupa_extension_mutus.git
```

Abre `chrome://extensions`, activa el modo desarrollador y carga la carpeta del repositorio como extensión desempaquetada.

## Instalar en Lupa

En Lupa 0.0.3 con Compose slim, clona este repositorio en `deploy/slim/.runtime/extensions/mutus/` de tu instalación. En el Compose tradicional, usa `extensions/mutus/`. El archivo debe quedar en `/extensions/mutus/manifest.json` dentro del contenedor.

Lupa descubre los manifiestos al abrir un contexto de Chromium. Reabre el contexto en un momento apropiado, guardando antes el trabajo de la sesión. La descarga del repositorio no modifica las pestañas que ya están abiertas.

## Permisos y límites

- Permisos: `storage`.
- Acceso a sitios: `https://www.youtube.com/*`, `https://m.youtube.com/*`.

Depende de la clase `ad-showing` del reproductor de YouTube. No bloquea anuncios ni garantiza detectar overlays o futuros cambios del sitio.

## Procedencia

Consulta [PROVENANCE.md](PROVENANCE.md). Esta publicación conserva el código instalado y añade documentación de distribución; no representa una batería nueva de pruebas contra sitios externos.

Licencia del proyecto: [MIT](LICENSE).
