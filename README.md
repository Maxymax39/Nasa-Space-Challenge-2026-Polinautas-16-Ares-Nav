# ARES-NAV · Mars Surface EVA Pathfinder & Visor HUD

![NASA Space Apps Challenge](https://img.shields.io/badge/NASA-Space%20Apps%20Challenge%202026-0b3d91?logo=nasa&logoColor=white)
![Build](https://github.com/Maxymax39/ares-nav-mars-eva/actions/workflows/deploy.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-00f3ff.svg)
![Version](https://img.shields.io/badge/version-v4.8.2--NASA-ffaa00)

> Cartografía multicapa y navegación táctica para actividades extravehiculares (EVA) en el Cráter Jezero, Marte.

## Resumen ejecutivo

La señal de radio entre la Tierra y Marte tarda **entre 4 y 24 minutos por sentido**. Control de misión no puede
asistir a un astronauta en tiempo real durante una EVA: el análisis de riesgo y el ajuste de ruta tienen que
ocurrir en el hábitat y en el traje.

**ARES-NAV** convierte datos orbitales en una herramienta de decisión local para el delta occidental de Jezero
(18.44°N, 77.45°E), con dos vistas sobre el mismo motor:

| Vista | Uso | Qué ofrece |
|---|---|---|
| **Hábitat · Planificación** | Pantalla del hábitat o tableta | Mapa interactivo con capas GIS, trazado libre de waypoints, ruta segura automática, perfil de elevación, presupuesto de O₂/radiación/hidratación e Índice Global de Seguridad EVA |
| **Traje · HUD** | Visor del casco | Vista del terreno orientada al rumbo, brújula táctica, vector al siguiente waypoint, telemetría del traje, radar de peligros y alerta roja parpadeante |

## Inicio rápido

```bash
git clone https://github.com/Maxymax39/ares-nav-mars-eva.git
cd ares-nav-mars-eva
npm start            # sirve la carpeta en http://localhost:5173 (usa npx serve)
```

Sin Node.js, en Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

No hay paso de compilación ni dependencias instaladas: es una aplicación estática de módulos ES6.
Tailwind CSS, Tone.js y las tipografías se cargan desde CDN. Hace falta un servidor local porque los módulos
y los JSON no cargan desde `file://`.

### Uso

1. **Ruta científica sugerida** traza hábitat → corredor de roca firme → arcillas de Three Forks → vetas de sulfato → carbonatos → hábitat.
2. O haz **clic en el mapa** para añadir tus propios waypoints; el motor rodea todo lo intransitable.
3. Activa capas con las casillas de **Capas GIS**. Haz clic en cualquier marcador para ver su ficha.
4. **Iniciar EVA** simula la caminata. **Traje · HUD** (o la tecla `H`) cambia a la vista del casco.
5. El desplegable **ES / EN** de la cabecera cambia toda la interfaz entre español e inglés; la elección se recuerda en el navegador.
6. **Regreso de emergencia** recalcula desde la posición actual el trayecto seguro más corto al hábitat.

## Datos: qué es real y qué es modelado

| Capa | Fuente | Estado en este repositorio |
|---|---|---|
| **HiRISE Optical** | MRO HiRISE, mosaico controlado de Jezero a 25 cm/px (`JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`), servido por NASA Mars Trek (WMTS) | **Real, en vivo.** Las teselas se piden a `trek.nasa.gov` al navegar. Sin conexión, el mapa muestra un relieve sombreado local |
| **MOLA Topo & Gradient** | MGS MOLA / DTM HiRISE-CTX de Jezero | **Modelado.** `assets/data/jezero_dem_sample.json` es una malla paramétrica de 180 × 120 celdas (~50 m) generada por `scripts/generate-dem.ps1`. El contorno del delta, el cráter Belva y la colina Kodiak están trazados sobre el mosaico HiRISE; las cotas se anclan a valores publicados (piso ≈ −2565 m, cima del delta ≈ −2495 m). No es un producto PDS |
| **CRISM Spectral** | MRO CRISM (filosilicatos Fe/Mg, carbonatos, sulfatos polihidratados, sílice hidratada) | **Modelado.** `assets/data/crism_minerals.json` simplifica la cartografía mineral publicada del delta; posiciones aproximadas |
| **RAD Danger Overlay** | MSL RAD: dosis media en superficie ≈ 0.67 mSv/día (≈ 0.028 mSv/h) | **Línea base real, focos hipotéticos.** Los dos focos > 0.24 mSv/h son un escenario de evento de partículas solares (SPE) para ejercitar el motor |

De **MEDA** (Perseverance) se usan los rangos de temperatura publicados; ver *Ambiente marciano*. Siguen
**sin integrar** como series de datos: **MAVEN** (flujo de partículas energéticas solares, para alimentar el
escenario SPE con datos reales) y las mediciones de viento, presión y polvo de MEDA.

Para usar topografía real, remuestrea el DTM `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m` a la misma
malla y sustituye el arreglo `elevations` del JSON; el resto del sistema no cambia.

## Matriz de riesgo geológico

| # | Marcador | Riesgo | Tratamiento en el motor de rutas |
|---|---|---|---|
| 1 | **Frente del Delta** | Pendientes abruptas con riesgo de deslizamiento | Celdas con pendiente > 20° tienen costo infinito; el ascenso solo es posible por la rampa aluvial |
| 2 | **Borde Occidental / Neretva Vallis** | Suelo suelto, material no consolidado | Costo de travesía × 3 |
| 3 | **Piso del Cráter (dunas Séítah)** | Dunas y trampas de arena fina | Costo de travesía × 4 |
| 4 | **Unión Canal / Llanura** | Bloques de basalto afilados | Costo de travesía × 2.5; se prefiere el corredor de roca firme |
| 5 | **Cráter Secundario Suroeste (Belva)** | Bordes inestables y fracturas | Costo de travesía × 5 y borde bloqueado por pendiente |

## Ambiente marciano (`src/core/EnvironmentModel.js`)

El panel **Ambiente marciano** controla las condiciones de la EVA y el bloque **Condiciones ambientales**
muestra los valores derivados y un estado GO / PRECAUCIÓN / NO-GO con sus motivos. Cinco escenarios
(sol nominal, temporada de polvo, tormenta regional, tormenta global, evento de partículas solares)
rellenan todos los controles; cualquier ajuste manual pasa a "Personalizado".

| Variable | Control | Efecto en la simulación | Origen del valor |
|---|---|---|---|
| **Polvo y tormentas** | Opacidad τ (0.1–8) | Visibilidad (rango de Koschmieder), iluminación, bruma y estelas en el mapa; con poca visibilidad la travesía es más lenta; τ ≥ 3 es NO-GO | Valores de planificación; modelo simple |
| **Temperatura** | Hora local de salida | Aire −83 a −23 °C y suelo −83 a 5 °C a lo largo del sol, avanzando con el tiempo de EVA; el polvo aplana el ciclo | **Medido por MEDA** (blog de NASA Science); la curva diaria es una sinusoide |
| **Presión** | Hora local, polvo | Media ≈ 730 Pa con mareas térmicas diurna y semidiurna que crecen con el polvo; de ella sale la densidad del aire | Valor aproximado; el comportamiento sigue arXiv:2511.09743 (no revisado por pares), cuyo resumen no da cifras |
| **Clima espacial y radiación** | Sol en calma / actividad elevada / SPE | Multiplica el campo de dosis (×1, ×1.6, ×3): cambia la dosis acumulada, el Safety Score y las celdas bloqueadas (> 0.24 mSv/h), y la ruta se recalcula | Factores hipotéticos de escenario |
| **Viento y navegación** | Velocidad (0–35 m/s) y dirección | Flecha de viento en el mapa, marca ámbar en la brújula del HUD, componentes frontal y cruzada respecto al rumbo, presión dinámica; por encima de 18 m/s levanta polvo y sube τ | Umbrales de planificación |

Qué conviene saber:

- La fuerza del viento sobre el astronauta es mínima (el aire marciano es ~70 veces menos denso que el terrestre:
  17 m/s equivalen a unos 2 m/s en la Tierra). El viento importa por el polvo que levanta, no por el empuje.
- Si las condiciones cambian **durante** la EVA, la ruta se mantiene, se recalculan tiempos y dosis, y el HUD
  muestra la alerta roja (tormenta, evento de partículas o viento extremo) para ordenar el regreso.
- Los umbrales GO / NO-GO son de este proyecto, no un estándar de la NASA. Las fórmulas de depleción de O₂ y
  del Safety Score no cambian: el ambiente entra a través de la duración y de la radiación acumulada.
- Los valores de referencia y los escenarios están en `assets/data/environment_reference.json`.

## Modelo fisiológico (`src/core/BioSafetyCalculators.js`)

Consumo diario por tripulante en el hábitat (envolvente NASA-STD-3001):

| Consumible | Por sol |
|---|---|
| Oxígeno | 0.84 – 1.1 kg |
| Agua potable | 2.5 – 3.5 L |
| Agua de higiene / traje | 8.0 – 9.0 L |
| Alimentos | 1.5 – 1.75 kg (~3000 kcal) |

Durante la EVA:

```text
Depleción O₂ (%) = (Distancia total [km] × 4.2) + (Pendiente máxima [°] × 0.8)

Safety Score     = 100 − (Pendiente × 1.5) − (Radiación acumulada [mSv] × 12) − (Depleción O₂ × 0.2)
```

Parámetros del traje: 4.3 psid (29.6 kPa) en 100 % O₂, ppCO₂ ≤ 20 mmHg, hidratación ≥ 240 mL/h, alerta de
radiación a 0.24 mSv/h, transmisión del visor del 16 % frente a los ~57 000 lux marcianos.

La velocidad de travesía (2.5 km/h a pie, 6 km/h con rover de apoyo, reducida por pendiente y tipo de terreno)
es un supuesto de planificación de este proyecto, no un estándar.

## Motor de rutas (`src/core/PathfindingAlgorithm.js`)

- **A\*** sobre la malla del terreno, 8 direcciones, sin cortar esquinas junto a celdas bloqueadas.
- **Restricción dura:** pendiente > 20° o tasa de radiación > 0.24 mSv/h → costo infinito.
- Costo del resto: distancia × penalización por pendiente × multiplicador de la zona de riesgo.
- **Regreso de emergencia:** línea recta al módulo *Octavia E. Butler* (18.44°N, 77.45°E) si todas sus celdas
  son seguras; si no, el camino seguro más corto que la rodea.

## Estructura

```text
ares-nav-mars-eva/
├── .github/workflows/deploy.yml     # despliegue a GitHub Pages
├── assets/data/
│   ├── jezero_dem_sample.json       # malla de elevación (modelada)
│   ├── crism_minerals.json          # depósitos minerales (modelados)
│   ├── hazard_zones.json            # 5 marcadores de riesgo, hábitat, escenario RAD
│   └── environment_reference.json   # temperatura MEDA, presión, polvo, viento, escenarios
├── scripts/
│   ├── generate-dem.ps1             # regenera la malla de elevación
│   └── serve.ps1                    # servidor local sin dependencias (Windows)
├── src/
│   ├── components/
│   │   ├── MapEngine.js             # mapa Canvas 2D, capas, teselas HiRISE
│   │   ├── SuitHudOverlay.js        # HUD del casco
│   │   ├── TelemetryPanel.js        # métricas, soporte vital, consumibles
│   │   └── ElevationProfile.js      # perfil topográfico de la ruta
│   ├── core/
│   │   ├── BioSafetyCalculators.js  # fórmulas fisiológicas
│   │   ├── PathfindingAlgorithm.js  # A*, regreso de emergencia
│   │   ├── TerrainModel.js          # pendiente, radiación y costos por celda
│   │   ├── EnvironmentModel.js      # polvo, temperatura, presión, viento, clima espacial
│   │   ├── i18n.js                  # textos en español e inglés
│   │   └── AudioFeedback.js         # tonos sintéticos con Tone.js
│   ├── styles/tailwind-custom.css
│   └── main.js                      # estado, simulación y bucle de render
├── index.html
├── package.json
└── README.md
```

El audio de interfaz se sintetiza en tiempo real con Tone.js, por lo que no se incluye ningún archivo de sonido.

## Consideraciones del reto cubiertas

- **Formato:** pantalla de planificación en el hábitat y HUD en el visor del casco, sobre los mismos datos.
- **Producto interactivo** que genera rutas para cualquier combinación de waypoints.
- **Marco temporal:** topografía y geología estables; la radiación se plantea como escenario.
- **Punto de vista en superficie:** cada marcador indica los soles de Perseverance que muestran ese terreno y enlaza a las [imágenes crudas de Mars 2020](https://mars.nasa.gov/mars2020/multimedia/raw-images/).
- **Trabajo en pareja o con rover:** el modo de travesía cambia velocidad, duración y dosis acumulada.

## Recursos

- [NASA Mars Trek](https://trek.nasa.gov/mars/)
- [USGS Astrogeology — mapas interactivos de Marte](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars)
- [Ruta propuesta de Curiosity en el monte Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
- [NASA Worldview](https://worldview.earthdata.nasa.gov/)
- [Imágenes crudas de Mars 2020](https://mars.nasa.gov/mars2020/multimedia/raw-images/)
- [Registros diarios de temperatura atmosférica con Perseverance (MEDA)](https://science.nasa.gov/blog/daily-records-of-atmospheric-temperature-with-perseverance/)
- [Variabilidad estacional y diurna de la presión en Jezero (arXiv:2511.09743)](https://arxiv.org/abs/2511.09743)
- [Perseverance lee el registro de antiguos impactos en Marte (AGU)](https://news.agu.org/press-release/nasas-perseverance-rover-reads-record-of-ancient-mars-impacts/)
