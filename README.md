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
| **Traje · HUD** | Visor del casco | Terreno en 3D orientado al rumbo con cámara libre, brújula táctica, vector al siguiente waypoint, telemetría del traje, radar de peligros y alerta roja parpadeante |

## Cómo ejecutarlo

**En Windows: doble clic en `inicio.bat`.** Comprueba que el proyecto esté completo, levanta un servidor
local y abre el navegador. No instala nada: usa Node.js si está presente y, si no, PowerShell (incluido en
Windows). Si el puerto 5173 está ocupado pasa al siguiente libre y lo indica en la ventana.

Otras formas:

```bash
npm start                                                         # Node.js 18 o superior, cualquier sistema
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 -Open  # Windows sin Node.js
```

| | |
|---|---|
| **Dirección** | `http://localhost:5173` (o el puerto que indique la ventana del servidor) |
| **Requisitos** | Windows 10/11 con PowerShell 5.1, o cualquier sistema con Node.js 18+. Sin dependencias npm ni paso de compilación |
| **Navegadores** | Chrome, Edge o Firefox actuales; Safari 16+, con WebGL para la vista 3D. Pensado para escritorio a partir de 1280 px; en pantallas menores los paneles se apilan |
| **Conexión** | Hace falta para el mosaico HiRISE, Tailwind, Tone.js, three.js y las tipografías (CDN). Sin conexión el mapa usa un relieve sombreado local y el resto funciona igual |
| **Acceso** | Sin cuentas ni contraseñas |

Hace falta un servidor local porque los módulos ES6 y los JSON no cargan desde `file://`.

### Puestos

El selector de la cabecera abre la aplicación como la usaría cada persona. No es un control de acceso:
solo cambia la vista y las capas iniciales, y se recuerda en el navegador.

| Puesto | Vista | Capas iniciales | Para qué |
|---|---|---|---|
| **CapCom** | Planificación | HiRISE, CRISM, radiación | Supervisar la EVA desde el hábitat: ruta, ambiente, signos vitales |
| **Comandante EVA** | HUD del traje | las activas | Lo que ve quien camina: rumbo, siguiente waypoint, alertas |
| **Control de rover** | Planificación, modo con rover | HiRISE, pendientes, radiación | Seguir batería, carga y enlace del rover de apoyo |
| **Científico de campo** | Planificación | HiRISE, CRISM | Elegir objetivos minerales y añadirlos como waypoints |

### Uso

1. **Ruta científica sugerida** traza hábitat → corredor de roca firme → arcillas de Three Forks → vetas de sulfato → carbonatos → hábitat.
2. O haz **clic en el mapa** para añadir tus propios waypoints; el motor rodea todo lo intransitable.
3. Activa capas con las casillas de **Capas GIS**. Haz clic en cualquier marcador para ver su ficha.
4. **Iniciar EVA** simula la caminata; las tarjetas de signos vitales cambian de estado según el esfuerzo. **Traje · HUD** (o la tecla `H`) cambia a la vista del casco.
5. El desplegable **ES / EN** de la cabecera cambia toda la interfaz entre español e inglés; la elección se recuerda en el navegador.
6. La capa **Curvas de nivel** ayuda a leer el relieve, también en la vista 3D.
7. **Regreso a casa automático (RTB)** da la vuelta solo al llegar al límite de reserva de O₂; ver más abajo.
8. **Regreso de emergencia** recalcula desde la posición actual el trayecto seguro más corto al hábitat.

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

## Regreso automático a la base (RTB)

Durante la EVA se calcula de forma continua el **punto de retorno seguro** (`pointOfSafeReturn` en
`src/core/BioSafetyCalculators.js`):

```text
O₂ para volver (%) = (km del camino seguro al hábitat × 4.2)
                   + (pendiente máxima que falta por subir [°] × 0.8)
                   + (pérdida por fuga [%/h] × horas de regreso)

Margen (%)         = O₂ restante − O₂ para volver − reserva (10 %)
```

El camino al hábitat se replanifica varias veces por segundo con el mismo motor de rutas, así que el
cálculo tiene en cuenta pendientes, zonas de riesgo y celdas bloqueadas, no la distancia en línea recta.
Usa el mismo modelo de depleción que el resto del traje para que la predicción coincida con lo que la
simulación consume. El panel muestra el margen, el O₂ necesario, la distancia y el tiempo de regreso, y el
consumo de O₂ en L/min (carga metabólica ÷ 335 W, a partir de 20.1 kJ por litro de O₂).

El interruptor **Regreso a Casa Automático / Emergency Auto-Return** está en el plan de EVA y en el HUD:

- **Activado:** cuando el margen llega a cero suena la alarma, la ruta se sustituye por el camino seguro
  más rápido al hábitat y el HUD muestra `[EMERGENCY RTB ACTIVATED: CRITICAL OXYGEN LIMIT REACHED]`
  (en español, `[RTB DE EMERGENCIA ACTIVADO: LÍMITE CRÍTICO DE OXÍGENO ALCANZADO]`).
- **Desactivado:** aparece el aviso `LÍMITE DE RESERVA DE O₂: REGRESAR AHORA`, pero la ruta no cambia.

Con una ruta normal el límite no se alcanza. Para verlo en acción, marca **Simulacro: fuga de O₂ en el
traje** (pérdida de 22 %/h, un valor de ejercicio) e inicia la EVA con la ruta sugerida.

## Astronauta y rover en el mapa

Con el modo **Con rover de apoyo** (o el puesto **Control de rover**) hay dos unidades en el terreno, y se
distinguen a simple vista en el mapa 2D y en la vista 3D:

| Unidad | Símbolo | Qué muestra |
|---|---|---|
| **Astronauta (EV1)** | Punta de flecha blanca que indica el rumbo; en 3D, figura blanca con cono de visión | Etiqueta con O₂ y frecuencia cardíaca, estela blanca del camino recorrido y radio de 50 m que cambia de verde a ámbar o rojo según los signos vitales |
| **Rover (RVR)** | Vehículo ámbar con cuatro ruedas y mástil | Línea de enlace discontinua hasta el astronauta, batería, carga de muestras (kg sobre capacidad) y estado del relé de comunicaciones |

El rover sigue al astronauta 30 m por detrás sobre la misma ruta. La batería baja con la distancia y la
pendiente, la carga sube 6 kg en cada waypoint (capacidad 60 kg) y el relé pasa a degradado con polvo denso
(τ ≥ 3). Son cifras de simulación, no de un vehículo real. A pie no hay rover.

El perfil de elevación incluye la curva de depleción de O₂ prevista a lo largo de la ruta.

## Vista 3D del terreno (`src/components/Terrain3D.js`)

En el puesto de Comandante EVA el terreno se dibuja en 3D con WebGL (three.js):

- La malla sale de `jezero_dem_sample.json`, interpolada al doble de resolución, con el relieve
  **exagerado ×2** (el desnivel real es de unos 100 m en 9 km y a pie apenas se vería).
- Encima va el mismo mapa de la vista de planificación: mosaico HiRISE real, pendientes, CRISM, radiación,
  curvas de nivel, zonas de riesgo, ruta y waypoints. Lo que se activa en **Capas GIS** aparece en 3D.
- El sol se coloca según la hora local y proyecta sombras; el polvo oscurece el cielo y acorta la
  distancia visible (niebla), con los valores del modelo ambiental.
- **Viento en 3D:** estelas de polvo que cruzan el terreno siguiendo el relieve, en la dirección y con la
  intensidad del viento configurado; más viento o más polvo dan más estelas y más opacas. Se dibujan unas
  cuatro veces más rápido que a escala real para que una brisa de 5 m/s se perciba. El botón ≋ las oculta.
- **Rosa de viento en el HUD:** junto al radar, una flecha orientada respecto al rumbo indica hacia dónde
  sopla, con velocidad, rumbo de origen y color según el umbral (ámbar ≥ 15 m/s, rojo ≥ 25 m/s).
- Cono de visión de 60° delante del astronauta y postes verticales en el hábitat y los waypoints.
- Cámara: arrastrar para girar e inclinar, rueda para acercar, doble clic para recentrar. Los botones
  sobre el HUD hacen lo mismo y añaden rotación continua alrededor del astronauta (⟳).

No hay desenfoque por profundidad de campo; la sensación de distancia la da la bruma. Sin WebGL o sin
conexión al CDN de three.js, el HUD usa el mapa 2D inclinado.

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

Las cuatro tarjetas de signos vitales (oxígeno, presión del traje, frecuencia cardíaca, balance térmico)
cambian a VIGILAR o ALERTA con estos umbrales: O₂ < 50 % / < 25 %; presión fuera de ±0.15 / ±0.3 psid;
frecuencia cardíaca ≥ 150 / ≥ 170 lpm; temperatura central ≥ 38.0 / ≥ 38.5 °C. La frecuencia cardíaca, la
carga metabólica (≈ 115 W en reposo, 250–350 W en trabajo sostenido) y la temperatura central son
**simuladas** a partir de la pendiente y el terreno; no hay sensores conectados.

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
│   ├── serve.mjs                    # servidor local con Node.js (sin dependencias)
│   └── serve.ps1                    # servidor local con PowerShell (Windows)
├── src/
│   ├── components/
│   │   ├── MapEngine.js             # mapa Canvas 2D, capas, teselas HiRISE
│   │   ├── Terrain3D.js             # terreno 3D del HUD (three.js)
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
├── inicio.bat                       # arranque con doble clic (Windows)
├── package.json
└── README.md
```

El audio de interfaz se sintetiza en tiempo real con Tone.js, por lo que no se incluye ningún archivo de sonido.

## Criterios de evaluación

| Criterio | Cómo responde el proyecto |
|---|---|
| **Impacto** | Con 4–24 minutos de retardo, la decisión de seguir o volver se toma en Marte. ARES-NAV calcula el punto de retorno seguro en vivo y, si se alcanza el límite de reserva de O₂, da la vuelta a la tripulación antes de que sea tarde |
| **Creatividad** | Un solo motor alimenta dos puestos (hábitat y visor 3D del casco) y une el modelo metabólico con el re-enrutado automático y un rover de apoyo enlazado al astronauta. El ambiente (polvo, viento, clima espacial) cambia la ruta, los tiempos y las alertas en vivo, no es un panel aparte |
| **Validez** | A\* con restricciones duras de pendiente y radiación; temperaturas medidas por MEDA; línea base de dosis de MSL RAD; envolvente de consumibles NASA-STD-3001. Lo que es supuesto o modelado está marcado como tal en este documento |
| **Relevancia y datos** | El mosaico HiRISE real es la base del mapa; la malla de elevación decide por dónde se puede pasar; los depósitos CRISM son los destinos de la ruta científica; la radiación bloquea celdas |
| **Presentación** | Arranque con doble clic, interfaz en español e inglés, puestos preconfigurados, sin cuentas |

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

## Licencia

MIT. Imágenes HiRISE: NASA/JPL-Caltech/University of Arizona, vía NASA Mars Trek.
