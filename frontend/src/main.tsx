import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./i18n"; // Initialize i18next before rendering
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register Service Worker for offline underground MRT support
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching fallback quiet handle
    });
  });
}

