// =============================================================================
// 📁 ARCHIVO: src/App.jsx
//
// RESPONSABILIDAD:
//   Este es el componente "inteligente" raíz de la aplicación. Su única tarea
//   es COMPONER la interfaz de usuario: llama al hook useHandDetection para
//   obtener el estado actual (gesto detectado, si está cargando), y usa esa
//   información para decidir QUÉ mostrar en pantalla.
//
//   App.jsx no contiene NINGUNA lógica de MediaPipe, cámara o detección de
//   gestos. Toda esa complejidad vive en el hook. Esto hace que App.jsx sea
//   fácil de leer, modificar y extender con nuevos elementos de UI.
// =============================================================================

import Webcam from "react-webcam";
import { useHandDetection, GIFS } from "./hooks/useHandDetection";
import "./App.css";

// Configuración del stream de video.
// Definida FUERA del componente para que no se re-cree en cada render.
// `facingMode: 'user'` activa la cámara frontal (selfie).
const VIDEO_CONSTRAINTS = { facingMode: "user", width: 1280, height: 720 };

// =============================================================================
// 🎬 COMPONENTE PRINCIPAL: App
//
// Nota sobre la estructura del JSX:
//   Tenemos 3 capas superpuestas dentro de <main id="camera-stage">:
//   1. <Webcam>         → La imagen en vivo de la cámara (fondo).
//   2. <canvas>         → Superpuesto sobre el video, dibuja el esqueleto de la mano.
//   3. <div gif-overlay>→ Superpuesto sobre todo, muestra el GIF si hay gesto.
//
//   El posicionamiento absoluto del CSS hace que las capas 2 y 3 floten
//   encima de la capa 1 sin desplazar el layout.
// =============================================================================
export default function App() {
  // Extraemos todo lo que necesitamos del hook.
  // El hook devuelve un objeto; usamos "desestructuración" para tomar solo
  // las piezas que nos interesan en este componente.
  const { webcamRef, canvasRef, gestureState, isLoading } = useHandDetection();

  // Derivamos un booleano simple para hacer el JSX más legible.
  // En vez de escribir `gestureState === 'PEACE'` en múltiples lugares,
  // lo calculamos UNA vez aquí y lo reutilizamos abajo.
  const isPeace = gestureState === "PEACE";

  // ---------------------------------------------------------------------------
  // 🛠️ ZONA DE CUSTOMIZACIÓN #3: AÑADIR REACCIONES A NUEVOS GESTOS
  //
  // Si añadiste un nuevo gesto (ej. "MANO_ABIERTA") en el hook, aquí es
  // donde decides qué pasa en la UI cuando se detecta.
  // Sigue el mismo patrón que `isPeace`:
  //
  //   const isManoAbierta = gestureState === 'MANO_ABIERTA';
  //
  // Luego, más abajo en el JSX, añade un overlay similar al de PEACE:
  //   <div id="gif-overlay-mano" className={isManoAbierta ? 'visible' : ''}>
  //     <img src={GIFS.MANO_ABIERTA} alt="Mano abierta!" />
  //   </div>
  // ---------------------------------------------------------------------------

  return (
    <div id="app-root">
      {/* ── Pantalla de carga ──────────────────────────────────────────────────
          Renderizado condicional: solo aparece en el DOM mientras `isLoading`
          sea `true`. En cuanto el hook cambia isLoading a `false`, este bloque
          completo desaparece del DOM automáticamente.
          El `&&` es el operador lógico de "renderizado condicional" en JSX.
      ──────────────────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div id="loading-overlay">
          <div id="loading-card">
            <div id="spinner" />
            <p id="loading-label">Iniciando IA…</p>
            <p id="loading-sub">Cargando Deteccion de Movimientos</p>
          </div>
        </div>
      )}

      {/* ── Barra de cabecera ─────────────────────────────────────────────────
          Muestra el nombre de la app y un indicador de estado.
          El `className` del punto de estado cambia DINÁMICAMENTE entre
          'loading' y 'ready' según el valor de `isLoading`.
          El CSS de App.css se encarga de darle color rojo/verde a cada clase.
      ──────────────────────────────────────────────────────────────────────── */}
      <header id="top-bar">
        <span id="app-logo">CamCon</span>
        <div id="status-pill">
          {/* La clase CSS cambia según el estado, controlando el color del punto */}
          <span id="status-dot" className={isLoading ? "loading" : "ready"} />
          <span id="status-text">
            {isLoading ? "Cargando modelo…" : "Modelo cargado"}
          </span>
        </div>
      </header>

      {/* ── Escenario de la cámara ────────────────────────────────────────────
          Contenedor `relative` que agrupa las 3 capas superpuestas.
      ──────────────────────────────────────────────────────────────────────── */}
      <main id="camera-stage">
        {/* CAPA 1: El video de la webcam.
            Le pasamos `webcamRef` para que el hook pueda acceder al elemento
            <video> y pasárselo a MediaPipe para la inferencia.
            `audio={false}` y `muted` son buenas prácticas para evitar eco. */}
        <Webcam
          id="webcam-main"
          ref={webcamRef}
          audio={false}
          muted
          playsInline
          screenshotFormat="image/jpeg"
          videoConstraints={VIDEO_CONSTRAINTS}
        />

        {/* CAPA 2: El canvas de landmarks.
            Es invisible hasta que el hook dibuja sobre él.
            Le pasamos `canvasRef` para que el hook pueda acceder al elemento
            <canvas> y usarlo con DrawingUtils.
            `pointer-events: none` (en el CSS) hace que el canvas "no bloquee"
            los clics que el usuario haga sobre la pantalla. */}
        <canvas id="landmark-canvas" ref={canvasRef} />

        {/* ── CAPA 3: Overlay del GIF ───────────────────────────────────────
            Siempre está en el DOM, pero el CSS lo tiene con `opacity: 0`
            por defecto. Cuando `isPeace` es true, le añadimos la clase
            `visible` que el CSS transiciona a `opacity: 1`.
            Esto crea la animación de fade-in/fade-out suavemente (0.25s).

            Si añadiste un nuevo gesto, añade aquí un <div> similar para él.
        ──────────────────────────────────────────────────────────────────── */}
        <div id="gif-overlay" className={isPeace ? "visible" : ""}>
          {/* La URL del GIF viene del diccionario GIFS en el hook (Zona de Customización #1) */}
          <img id="peace-gif" src={GIFS.PEACE} alt="Peace!" />
        </div>

        {/* 🛠️ EJEMPLO: Si añades "MANO_ABIERTA", crea un overlay aquí:
        <div id="gif-overlay-mano" className={isManoAbierta ? 'visible' : ''}>
          <img id="mano-abierta-gif" src={GIFS.MANO_ABIERTA} alt="Mano abierta!" />
        </div>
        */}
      </main>
    </div>
  );
}
