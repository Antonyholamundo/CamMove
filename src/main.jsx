// =============================================================================
// 📁 ARCHIVO: src/main.jsx
//
// RESPONSABILIDAD:
//   Este es el PUNTO DE ENTRADA de toda la aplicación React. Su única tarea
//   es conectar el mundo de React con el HTML estático del archivo index.html.
//   Busca el <div id="root"> en el HTML y le "inyecta" (monta) el árbol de
//   componentes de React, con App como raíz. Este archivo casi nunca
//   necesitas modificarlo.
// =============================================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'    // Estilos globales de reset (html, body, #root)
import App from './App.jsx' // El componente raíz de nuestra aplicación

// createRoot: le dice a React cuál elemento del DOM va a "controlar".
//   - document.getElementById('root') → encuentra el <div id="root"> en index.html
//   - .render(...) → inyecta el árbol de componentes de React dentro de ese div.
//
// <StrictMode>:
//   Es un wrapper especial de desarrollo (no afecta la versión de producción).
//   Su función más importante: en desarrollo, monta y DESMONTA cada componente
//   dos veces para detectar efectos secundarios problemáticos en los useEffect.
//   Si ves que tu cámara o MediaPipe se inicializan dos veces en desarrollo,
//   es por esto. Es normal y esperado. En producción solo ocurre una vez.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
