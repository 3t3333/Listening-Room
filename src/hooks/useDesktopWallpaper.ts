import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

export interface DesktopModeStatus {
  enabled: boolean;
  mode: "interactive" | "wallpaper";
  monitor_id: number | null;
}

const STORAGE_KEYS = {
  MODE: "listening-room-desktop-mode",
  MONITOR: "listening-room-desktop-monitor",
  ECO: "listening-room-desktop-eco",
  AUTOSTART: "listening-room-desktop-autostart",
  ENABLED: "listening-room-desktop-enabled",
};

export function useDesktopWallpaper() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [mode, setModeState] = useState<"interactive" | "wallpaper">(() => {
    return (localStorage.getItem(STORAGE_KEYS.MODE) as "interactive" | "wallpaper") || "interactive";
  });
  const [selectedMonitor, setSelectedMonitorState] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MONITOR);
    return saved !== null && saved !== "null" ? Number(saved) : null;
  });
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [ecoMode, setEcoModeState] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ECO) !== "false";
  });
  const [isThrottled, setIsThrottled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available monitors
  const refreshMonitors = useCallback(async () => {
    try {
      const list = await invoke<MonitorInfo[]>("get_available_monitors");
      setMonitors(list);
    } catch (err) {
      console.warn("Could not retrieve available monitors:", err);
    }
  }, []);

  // Fetch status on mount
  useEffect(() => {
    refreshMonitors();
    invoke<DesktopModeStatus>("get_desktop_mode_status")
      .then((status) => {
        setEnabled(status.enabled);
        if (status.mode === "interactive" || status.mode === "wallpaper") {
          setModeState(status.mode);
        }
        if (status.monitor_id !== undefined) {
          setSelectedMonitorState(status.monitor_id);
        }
      })
      .catch((err) => {
        console.warn("Could not get initial desktop mode status:", err);
      });
  }, [refreshMonitors]);

  // Apply or toggle desktop mode
  const setDesktopMode = useCallback(
    async (nextEnabled: boolean, targetMode?: "interactive" | "wallpaper", targetMonitor?: number | null) => {
      setLoading(true);
      setError(null);
      const applyMode = targetMode || mode;
      const applyMonitor = targetMonitor !== undefined ? targetMonitor : selectedMonitor;

      try {
        const result = await invoke<DesktopModeStatus>("set_desktop_mode", {
          enabled: nextEnabled,
          mode: applyMode,
          monitorIndex: applyMonitor,
        });

        setEnabled(result.enabled);
        setModeState(result.mode as "interactive" | "wallpaper");
        setSelectedMonitorState(result.monitor_id);
        localStorage.setItem(STORAGE_KEYS.ENABLED, String(result.enabled));
        localStorage.setItem(STORAGE_KEYS.MODE, result.mode);
        localStorage.setItem(STORAGE_KEYS.MONITOR, String(result.monitor_id));

        window.dispatchEvent(
          new CustomEvent("desktop-mode:changed", {
            detail: { enabled: result.enabled, mode: result.mode },
          })
        );
      } catch (err: any) {
        console.error("Failed to toggle desktop background mode:", err);
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    },
    [mode, selectedMonitor]
  );

  const toggleDesktopMode = useCallback(() => {
    return setDesktopMode(!enabled);
  }, [enabled, setDesktopMode]);

  const setMode = useCallback(
    (newMode: "interactive" | "wallpaper") => {
      setModeState(newMode);
      localStorage.setItem(STORAGE_KEYS.MODE, newMode);
      if (enabled) {
        void setDesktopMode(true, newMode, selectedMonitor);
      }
    },
    [enabled, selectedMonitor, setDesktopMode]
  );

  const setSelectedMonitor = useCallback(
    (monitorId: number | null) => {
      setSelectedMonitorState(monitorId);
      localStorage.setItem(STORAGE_KEYS.MONITOR, String(monitorId));
      if (enabled) {
        void setDesktopMode(true, mode, monitorId);
      }
    },
    [enabled, mode, setDesktopMode]
  );

  const setEcoMode = useCallback((val: boolean) => {
    setEcoModeState(val);
    localStorage.setItem(STORAGE_KEYS.ECO, String(val));
  }, []);

  // Eco-mode throttle check: detect when window is occluded or not focused in wallpaper mode
  useEffect(() => {
    if (!enabled || !ecoMode) {
      setIsThrottled(false);
      return;
    }

    function checkVisibility() {
      // In wallpaper mode or when document is hidden, throttle animations
      if (document.hidden) {
        setIsThrottled(true);
      } else {
        setIsThrottled(false);
      }
    }

    document.addEventListener("visibilitychange", checkVisibility);
    return () => document.removeEventListener("visibilitychange", checkVisibility);
  }, [enabled, ecoMode]);

  // Auto-adapt bounds on monitor resolution or scale factor change
  useEffect(() => {
    if (!enabled) return;

    const handleResize = () => {
      void refreshMonitors();
      invoke("reposition_desktop_mode").catch(() => {});
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [enabled, refreshMonitors]);

  // Periodic bottom pin for interactive mode (ensures window stays behind new apps)
  useEffect(() => {
    if (!enabled || mode !== "interactive") return;

    const interval = setInterval(() => {
      invoke("pin_desktop_bottom").catch(() => {});
    }, 2500);

    return () => clearInterval(interval);
  }, [enabled, mode]);

  // Listen to tray toggle event
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("tray-toggle-desktop", () => {
      setEnabled((prev) => {
        void setDesktopMode(!prev);
        return !prev;
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [setDesktopMode]);

  return {
    enabled,
    mode,
    selectedMonitor,
    monitors,
    ecoMode,
    isThrottled,
    loading,
    error,
    toggleDesktopMode,
    setDesktopMode,
    setMode,
    setSelectedMonitor,
    setEcoMode,
    refreshMonitors,
  };
}
