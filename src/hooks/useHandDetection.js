// =============================================================================
// 📁 ARCHIVO: src/hooks/useHandDetection.js
//
// RESPONSABILIDAD:
//   Este archivo es el "cerebro" de la aplicación. Su única tarea es encapsular
//   TODA la lógica de detección de manos: cargar la IA de MediaPipe, conectar
//   con la cámara, ejecutar el bucle de detección frame-a-frame y traducir
//   los puntos detectados (landmarks) en un "gesto" con nombre (ej. "PEACE").
//
//   El componente App.jsx NO sabe nada sobre MediaPipe. Solo consume el
//   resultado limpio que este hook le entrega: { webcamRef, canvasRef,
//   gestureState, isLoading }. Esto es el patrón de "Separación de
//   Responsabilidades" en React.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";


// =============================================================================
// 🛠️ ZONA DE CUSTOMIZACIÓN #1: DICCIONARIO DE GIFs
//
// Aquí defines QUÉ imagen/GIF se muestra para cada gesto detectado.
// La clave del objeto (ej. "PEACE") debe coincidir EXACTAMENTE con el
// nombre que le das al gesto en la "ZONA DE CUSTOMIZACIÓN #2" (más abajo).
//
// CÓMO CAMBIAR A UN ARCHIVO LOCAL:
//   En vez de una URL de Giphy, usa una ruta relativa a tu carpeta /public.
//   Ejemplo: pon tu archivo en `public/gifs/mi-gesto.gif` y luego escribe:
//     PEACE: "/gifs/mi-gesto.gif",
//
// CÓMO AÑADIR UN GIF PARA UN NUEVO GESTO:
//   1. Crea la función de detección (ver Zona #2).
//   2. Añade aquí una nueva entrada:
//     MANO_ABIERTA: "/gifs/mano-abierta.gif",
// =============================================================================
export const GIFS = {
  PEACE:
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTdjYTd3eTYwc293dG5kaGd5OXhudDM1ODIwbXRycTVxY3V4OW9vcCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NAivbJDbjN9sgkLzzE/giphy.gif",

  // Ejemplo de cómo añadir más gestos:
  // MANO_ABIERTA: "/gifs/mano-abierta.gif",
  // PUNO:         "https://mi-url-de-giphy.com/puno.gif",
};


// =============================================================================
// 🛠️ ZONA DE CUSTOMIZACIÓN #2: MATEMÁTICA DE GESTOS (LÓGICA DE DETECCIÓN)
//
// Cada función aquí recibe el array `landmarks` — un arreglo de 21 puntos 3D
// que representan las articulaciones de la mano.
//
// CÓMO LEER LOS LANDMARKS:
//   - landmarks[N].y   → posición vertical (0 = arriba de la pantalla, 1 = abajo)
//   - landmarks[N].x   → posición horizontal
//   - Si el Y de la PUNTA del dedo es MENOR que el Y de su NUDILLO BASE,
//     significa que el dedo apunta hacia ARRIBA (está levantado).
//
// MAPA DE ÍNDICES CLAVE (los 21 puntos de la mano):
//   PULGAR:  4 (punta)
//   ÍNDICE:  5 (base nudillo), 8 (punta)
//   MEDIO:   9 (base nudillo), 12 (punta)
//   ANULAR: 13 (base nudillo), 16 (punta)
//   MEÑIQUE:17 (base nudillo), 20 (punta)
//
// CÓMO AÑADIR UN NUEVO GESTO (ej. "Mano Abierta" - los 4 dedos levantados):
//   1. Crea una función nueva con este patrón:
//
//      function detectOpenHandGesture(landmarks) {
//        if (!landmarks || landmarks.length < 21) return false;
//        const indexUp  = landmarks[8].y  < landmarks[5].y;
//        const middleUp = landmarks[12].y < landmarks[9].y;
//        const ringUp   = landmarks[16].y < landmarks[13].y;
//        const pinkyUp  = landmarks[20].y < landmarks[17].y;
//        return indexUp && middleUp && ringUp && pinkyUp;
//      }
//
//   2. Añade la detección en el bloque de "Gesture detection" dentro del
//      useEffect del bucle RAF (busca el comentario ">>> AÑADE NUEVOS GESTOS").
//   3. Añade el GIF correspondiente en la Zona de Customización #1.
// =============================================================================

/**
 * Detecta el gesto de "Paz/Victoria" ✌️
 * Condición: índice y medio levantados, anular y meñique doblados.
 */
function detectPeaceGesture(landmarks) {
  // Validación defensiva: si no hay datos suficientes, retorna false.
  if (!landmarks || landmarks.length < 21) return false;

  // Comparamos el Y de la punta vs. la base de cada dedo.
  // Si punta.y < base.y, el dedo está levantado (recuerda: Y crece hacia abajo).
  const indexUp  = landmarks[8].y  < landmarks[5].y;  // Índice arriba
  const middleUp = landmarks[12].y < landmarks[9].y;  // Medio arriba
  const ringDown = landmarks[16].y > landmarks[13].y; // Anular abajo (doblado)
  const pinkyDown= landmarks[20].y > landmarks[17].y; // Meñique abajo (doblado)

  // Solo es "PEACE" si se cumplen LAS CUATRO condiciones a la vez.
  return indexUp && middleUp && ringDown && pinkyDown;
}


// =============================================================================
// ⚓ HOOK PRINCIPAL: useHandDetection
//
// Un "Custom Hook" en React es simplemente una función que empieza con "use"
// y que puede llamar internamente a otros hooks de React (useRef, useState,
// useEffect). Nos permite extraer lógica compleja fuera del componente y
// reutilizarla fácilmente en cualquier parte de la app.
// =============================================================================
export function useHandDetection() {

  // ---------------------------------------------------------------------------
  // 📌 POR QUÉ useRef EN VEZ DE useState PARA LAS REFERENCIAS DE CÁMARA/IA
  //
  // Esta es la pregunta clave de arquitectura de este proyecto. La regla:
  //
  //   👉 useSTATE  → para datos que, cuando CAMBIAN, deben RE-RENDERIZAR el UI.
  //   👉 useREF    → para datos que necesitas GUARDAR entre renders, PERO que
  //                  cambiarlos NO debe causar un re-render.
  //
  // En el bucle de detección (que corre 60 veces por segundo), necesitamos
  // acceder al <video>, al <canvas> y al modelo de IA en CADA FRAME.
  // Si usáramos useState para guardar el objeto `landmarker`, cada vez que
  // el modelo emitiera un resultado React re-renderizaría el componente, lo
  // que destruiría el rendimiento y crearía errores visuales (flickering).
  //
  // Con useRef, el valor `.current` se actualiza silenciosamente, sin provocar
  // renders. El bucle de 60fps puede leer el valor siempre actualizado sin
  // "molestar" a React.
  // ---------------------------------------------------------------------------
  const webcamRef         = useRef(null); // Referencia al elemento <video> de react-webcam
  const canvasRef         = useRef(null); // Referencia al <canvas> donde se dibujan los landmarks
  const landmarkerRef     = useRef(null); // Guarda la instancia del modelo de IA de MediaPipe
  const drawingUtilsRef   = useRef(null); // Guarda la instancia del dibujador de landmarks
  const lastVideoTimeRef  = useRef(-1);   // Evita procesar el mismo frame dos veces
  const rafIdRef          = useRef(null); // Guarda el ID del requestAnimationFrame activo
  const prevGestureRef    = useRef("DEFAULT"); // Recuerda el gesto anterior para detectar CAMBIOS

  // ---------------------------------------------------------------------------
  // 📌 POR QUÉ useState AQUÍ (y no useRef)
  //
  // A diferencia de los valores de arriba, ESTOS SÍ necesitan actualizar el UI:
  //   - gestureState: cuando cambia de "DEFAULT" a "PEACE", el componente App
  //     necesita re-renderizar para mostrar (o esconder) el GIF.
  //   - isLoading: cuando cambia de true a false, la pantalla de carga
  //     desaparece y el header muestra "Model ready".
  //
  // Solo se usa useState cuando el cambio de valor tiene que reflejarse
  // visualmente en la pantalla.
  // ---------------------------------------------------------------------------
  const [gestureState, setGestureState] = useState("DEFAULT");
  const [isLoading,    setIsLoading]    = useState(true);


  // ===========================================================================
  // ⚡ EFECTO 1: Cargar el Modelo de IA (se ejecuta UNA SOLA VEZ)
  //
  // useEffect(() => { ... }, []);   <-- el `[]` es el "array de dependencias".
  //
  // React re-ejecuta un useEffect cada vez que alguno de los valores en ese
  // array cambia. Si el array está VACÍO [], React interpreta que el efecto
  // no depende de nada externo, así que lo ejecuta SOLO al montar el
  // componente (equivale al antiguo componentDidMount de las clases).
  //
  // Aquí usamos [] porque cargar el modelo es una operación costosa que solo
  // queremos hacer UNA VEZ. No tiene sentido recargar MediaPipe cada vez que
  // el usuario hace un gesto.
  //
  // LA FUNCIÓN DE LIMPIEZA (return () => { ... }):
  //   React llama a esta función cuando el componente se "desmonta" (desaparece
  //   del DOM). Aquí cancelamos el bucle de animación y cerramos el modelo
  //   para liberar memoria y evitar "memory leaks".
  // ===========================================================================
  useEffect(() => {
    // `cancelled` es un "flag" de seguridad. Si el componente se desmonta
    // mientras la carga async todavía está en proceso, evitamos que se
    // intente actualizar el estado de un componente ya destruido.
    let cancelled = false;

    async function initLandmarker() {
      try {
        // Paso 1: Cargar el runtime de WebAssembly de MediaPipe desde la CDN.
        // Esto descarga los archivos .wasm que permiten ejecutar la IA en el navegador.
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );

        // Paso 2: Crear el detector de manos con su configuración.
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            // URL del modelo entrenado (archivo .task). Contiene los pesos de la red neuronal.
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU", // Usa la tarjeta gráfica para acelerar la inferencia.
          },
          runningMode: "VIDEO", // Modo optimizado para streams de video (vs. imágenes estáticas).
          numHands: 1,                      // Solo detectamos una mano a la vez.
          minHandDetectionConfidence: 0.6,  // Confianza mínima para "encontrar" una mano nueva.
          minHandPresenceConfidence: 0.6,   // Confianza mínima para "mantener" el tracking.
          minTrackingConfidence: 0.6,       // Confianza mínima para el seguimiento frame-a-frame.
        });

        // Solo guardamos el resultado si el componente sigue montado.
        if (!cancelled) {
          landmarkerRef.current = handLandmarker; // Guarda el modelo (silenciosamente, sin re-render)
          setIsLoading(false); // ESTE SÍ causa un re-render: la pantalla de carga desaparece.
        }
      } catch (err) {
        console.error("[useHandDetection] Init failed:", err);
      }
    }

    initLandmarker();

    // Función de limpieza: se ejecuta al desmontar el componente.
    return () => {
      cancelled = true;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); // Detiene el bucle de frames.
      landmarkerRef.current?.close(); // Libera la memoria que ocupa el modelo de IA.
    };
  }, []); // <-- Array vacío: este efecto corre SOLO UNA VEZ al montar el componente.


  // ===========================================================================
  // ⚡ EFECTO 2: Inicializar DrawingUtils (una vez que el canvas está listo)
  //
  // Este efecto depende de `isLoading`. Se ejecutará cada vez que `isLoading`
  // cambie. Nos importa el momento en que pasa de `true` a `false`, porque
  // es cuando el canvas ya está visible en el DOM y podemos obtener su contexto
  // 2D para dibujar sobre él.
  //
  // No podemos hacer esto en el Efecto 1 porque el canvas aún no está
  // renderizado en ese momento (React no lo añade al DOM hasta que isLoading
  // es false, gracias al condicional en App.jsx... bueno, el canvas siempre
  // está en el DOM, pero es una buena práctica esperar a que el modelo esté
  // listo antes de intentar usarlo).
  // ===========================================================================
  useEffect(() => {
    // Si el modelo todavía está cargando, no hacemos nada.
    if (isLoading) return;

    const canvas = canvasRef.current;
    if (!canvas) return; // Protección: si el canvas no existe en el DOM, salimos.

    // Obtenemos el contexto 2D del canvas y creamos la instancia de DrawingUtils.
    // DrawingUtils es una clase de MediaPipe que sabe dibujar los puntos y
    // conexiones del esqueleto de la mano con un solo método.
    const ctx = canvas.getContext("2d");
    drawingUtilsRef.current = new DrawingUtils(ctx);
  }, [isLoading]); // <-- Se re-ejecuta cuando `isLoading` cambia.


  // ===========================================================================
  // ⚡ EFECTO 3: El Bucle Principal de Detección (requestAnimationFrame)
  //
  // Este es el corazón de la app. requestAnimationFrame (RAF) es una API del
  // navegador que llama a nuestra función `predict` sincronizada con la tasa
  // de refresco de la pantalla (normalmente 60 veces por segundo).
  //
  // Al final de cada llamada a `predict`, volvemos a registrar RAF → creando
  // un bucle infinito que procesa cada frame del video en tiempo real.
  //
  // Este efecto también depende de `isLoading` para no arrancar el bucle
  // antes de que el modelo esté disponible.
  // ===========================================================================
  useEffect(() => {
    // Si el modelo aún no cargó, no arrancamos el bucle.
    if (isLoading) return;

    function predict() {
      // Leemos los valores actuales de nuestras refs. Esto NO causa re-renders.
      const video    = webcamRef.current?.video ?? null; // react-webcam expone el <video> en `.video`
      const canvas   = canvasRef.current;
      const landmarker  = landmarkerRef.current;
      const drawUtils   = drawingUtilsRef.current;

      // Solo procesamos si TODOS los elementos están disponibles y el video
      // tiene datos (readyState >= 2 significa que hay al menos un frame disponible).
      if (video && canvas && landmarker && drawUtils && video.readyState >= 2) {
        const nowMs = performance.now(); // Tiempo actual en milisegundos (muy preciso).

        // Evitamos procesar el mismo frame dos veces comparando el timestamp.
        if (nowMs !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = nowMs;

          // ── Sincronizar el tamaño del canvas con el video ─────────────────
          // El canvas debe tener exactamente las mismas dimensiones que el video
          // para que los puntos dibujados queden alineados con la imagen.
          if (canvas.width  !== video.videoWidth)  canvas.width  = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

          // Limpiamos el canvas antes de dibujar el nuevo frame.
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // ── Ejecutar la inferencia de la IA ───────────────────────────────
          // Le damos el frame de video actual a MediaPipe y nos devuelve los
          // 21 landmarks (puntos 3D) de cada mano detectada.
          const results = landmarker.detectForVideo(video, nowMs);

          // ── Dibujar el esqueleto si se detectó alguna mano ────────────────
          if (results?.landmarks?.length > 0) {
            for (const landmarks of results.landmarks) {

              // Dibuja las LÍNEAS que conectan las articulaciones (el "esqueleto").
              drawUtils.drawConnectors(
                landmarks,
                HandLandmarker.HAND_CONNECTIONS, // Arreglo de pares [inicio, fin] que define el esqueleto.
                {
                  color: "#7c5cfc",  // Color púrpura para las líneas.
                  lineWidth: 3,
                },
              );

              // Dibuja los PUNTOS en cada articulación.
              drawUtils.drawLandmarks(landmarks, {
                color: "#ffffff",      // Color del borde del punto.
                fillColor: "#7c5cfc", // Color de relleno del punto.
                lineWidth: 1,
                // Las puntas de los dedos (índices 4,8,12,16,20) se dibujan más grandes.
                radius: (data) => {
                  const tips = [4, 8, 12, 16, 20]; // Índices de las puntas de los 5 dedos.
                  return tips.includes(data.index) ? 7 : 4;
                },
              });
            }

            // ── ZONA DE CUSTOMIZACIÓN #2: Evaluación de Gestos ───────────────
            // 🛠️ AQUÍ ES DONDE AÑADES NUEVOS GESTOS.
            //
            // El patrón es simple:
            //   1. Por defecto, el gesto detectado es "DEFAULT" (ninguno).
            //   2. Llamamos a cada función de detección con los landmarks de
            //      la primera mano detectada (results.landmarks[0]).
            //   3. Si una función retorna `true`, actualizamos `detected`.
            //
            // EJEMPLO PARA AÑADIR "MANO_ABIERTA":
            //   if (detectOpenHandGesture(results.landmarks[0])) detected = "MANO_ABIERTA";
            //
            // IMPORTANTE: El orden importa. El último `if` que se cumpla "gana".
            // Si quieres prioridad, usa `else if` o reordena los bloques.
            // ─────────────────────────────────────────────────────────────────
            let detected = "DEFAULT";
            if (detectPeaceGesture(results.landmarks[0])) detected = "PEACE";
            // >>> AÑADE NUEVOS GESTOS AQUÍ:
            // if (detectOpenHandGesture(results.landmarks[0])) detected = "MANO_ABIERTA";
            // if (detectFistGesture(results.landmarks[0]))     detected = "PUNO";

            // Solo actualizamos el estado de React si el gesto CAMBIÓ.
            // Esto es crucial: evita llamar a setGestureState 60 veces por
            // segundo con el mismo valor, lo que causaría renders innecesarios.
            if (detected !== prevGestureRef.current) {
              prevGestureRef.current = detected; // Actualización silenciosa (ref).
              setGestureState(detected);         // Actualización que SÍ re-renderiza.
            }

          } else {
            // No se detectó ninguna mano → volvemos al estado por defecto.
            // La misma lógica: solo actualizamos el estado si realmente cambió.
            if (prevGestureRef.current !== "DEFAULT") {
              prevGestureRef.current = "DEFAULT";
              setGestureState("DEFAULT");
            }
          }
        }
      }

      // Registramos la PRÓXIMA llamada a predict, creando el bucle continuo.
      rafIdRef.current = requestAnimationFrame(predict);
    }

    // Arrancamos el bucle por primera vez.
    rafIdRef.current = requestAnimationFrame(predict);

    // Función de limpieza: cuando el componente se desmonte (o isLoading cambie),
    // cancelamos el bucle para no desperdiciar recursos.
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isLoading]); // <-- Se re-ejecuta si isLoading cambia (para arrancar el bucle al cargar).


  // ===========================================================================
  // 📦 RETORNO DEL HOOK
  //
  // Exponemos solo lo que el componente App.jsx necesita saber:
  //   - webcamRef:    Para conectar react-webcam a nuestro código.
  //   - canvasRef:    Para conectar el <canvas> del DOM a nuestro dibujador.
  //   - gestureState: El nombre del gesto actual ("DEFAULT", "PEACE", etc.).
  //   - isLoading:    Si el modelo todavía se está descargando.
  //
  // App.jsx NO necesita saber nada de MediaPipe, RAF, DrawingUtils, etc.
  // Eso es exactamente el poder de los Custom Hooks: separar "qué se muestra"
  // (App.jsx) de "cómo funciona" (useHandDetection.js).
  // ===========================================================================
  return { webcamRef, canvasRef, gestureState, isLoading };
}
