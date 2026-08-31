import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

/**
 * BOOTSTRAP STREAMAN.
 * `#root` dijamin ada oleh index.html; kalau tidak, biarkan error muncul di
 * konsol (ErrorBoundary belum terpasang pada titik ini).
 */
const container = document.getElementById("root");
if (!container) throw new Error("StreamAN: elemen #root tidak ditemukan di index.html.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);





