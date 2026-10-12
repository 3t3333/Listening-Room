import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-jp";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Capture unhandled window runtime errors and dispatch to diagnostics
window.addEventListener("error", (event) => {
  if (event.message?.includes("ResizeObserver") || event.message?.includes("AbortError")) {
    return;
  }
  void invoke("submit_diagnostic_report", {
    request: {
      source: "frontend-window-error",
      errorMessage: event.message || "Unhandled window error",
      errorLocation: `${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`,
      stackTrace: event.error?.stack || "",
      userNote: "Captured by window.onerror listener.",
    },
  }).catch(() => {});
});

// Capture unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = typeof reason === "object" && reason !== null ? reason.message || String(reason) : String(reason);
  if (message?.includes("AbortError") || message?.includes("canceled")) {
    return;
  }
  void invoke("submit_diagnostic_report", {
    request: {
      source: "frontend-unhandled-rejection",
      errorMessage: message || "Unhandled Promise Rejection",
      errorLocation: "Promise Execution",
      stackTrace: typeof reason === "object" && reason?.stack ? reason.stack : "",
      userNote: "Captured by window.onunhandledrejection listener.",
    },
  }).catch(() => {});
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
