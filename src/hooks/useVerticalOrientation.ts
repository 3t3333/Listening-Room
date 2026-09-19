import { useState, useEffect } from "react";
import type { DjSettings } from "./useDjSettings";

export interface VerticalOrientationState {
  isVertical: boolean;
  direction: "cw" | "ccw" | "none";
  jacketPlacement: "above" | "side";
  snapSide: "left" | "right";
  windowWidth: number;
  windowHeight: number;
}

export function useVerticalOrientation(settings: DjSettings): VerticalOrientationState {
  const [state, setState] = useState<VerticalOrientationState>(() => computeOrientation(settings));

  useEffect(() => {
    function update() {
      setState((prev) => {
        const next = computeOrientation(settings);
        if (
          prev.isVertical === next.isVertical &&
          prev.direction === next.direction &&
          prev.jacketPlacement === next.jacketPlacement &&
          prev.snapSide === next.snapSide &&
          prev.windowWidth === next.windowWidth &&
          prev.windowHeight === next.windowHeight
        ) {
          return prev;
        }
        return next;
      });
    }

    window.addEventListener("resize", update);
    window.addEventListener("focus", update);

    // Periodically check screen position for window dragging / snapping
    const interval = window.setInterval(update, 1200);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("focus", update);
      window.clearInterval(interval);
    };
  }, [settings.verticalRotationMode]);

  return state;
}

function computeOrientation(settings: DjSettings): VerticalOrientationState {
  if (typeof window === "undefined") {
    return {
      isVertical: false,
      direction: "none",
      jacketPlacement: "side",
      snapSide: "left",
      windowWidth: 1024,
      windowHeight: 768,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const availWidth = window.screen?.availWidth || 1920;
  const screenX = window.screenX !== undefined ? window.screenX : (window.screenLeft || 0);

  // If window is narrow or vertical aspect ratio
  const isNarrow = width < 850 || (height > 600 && width / height < 1.08);

  // Check if snapped or placed on the left vs right side of the display
  const windowCenter = screenX + width / 2;
  const snapSide: "left" | "right" = windowCenter < availWidth / 2 ? "left" : "right";

  // Dynamic jacket positioning: above turntable if ultra narrow (<550px), side-by-side if width allows (>=550px)
  const jacketPlacement: "above" | "side" = width >= 550 ? "side" : "above";

  let isVertical = false;
  let direction: "cw" | "ccw" | "none" = "none";

  if (settings.verticalRotationMode === "disabled") {
    isVertical = false;
    direction = "none";
  } else if (settings.verticalRotationMode === "rotate-right") {
    isVertical = true;
    direction = "cw";
  } else if (settings.verticalRotationMode === "rotate-left") {
    isVertical = true;
    direction = "ccw";
  } else {
    // "auto" mode
    if (isNarrow) {
      isVertical = true;
      direction = snapSide === "left" ? "cw" : "ccw";
    } else {
      isVertical = false;
      direction = "none";
    }
  }

  return {
    isVertical,
    direction,
    jacketPlacement,
    snapSide,
    windowWidth: width,
    windowHeight: height,
  };
}
