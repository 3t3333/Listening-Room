import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function ScrollingTitle({ children }: { children: string }) {
  const viewport = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState({ active: false, distance: 0, duration: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const width = content.current?.getBoundingClientRect().width ?? 0;
      const available = viewport.current?.clientWidth ?? 0;
      const active = width > available + 1;
      setScroll({
        active,
        distance: active ? width + 48 : 0,
        duration: active ? Math.max(9, width / 34) : 0,
      });
    };
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [children]);

  const style = scroll.active ? {
    "--title-scroll-distance": `${scroll.distance}px`,
    "--title-scroll-duration": `${scroll.duration}s`,
  } as CSSProperties : undefined;

  return (
    <h1 ref={viewport} className={`scrolling-title ${scroll.active ? "is-overflowing" : ""}`} title={children}>
      <span className="scrolling-title-track" style={style}>
        <span ref={content}>{children}</span>
        {scroll.active && <span aria-hidden="true">{children}</span>}
      </span>
    </h1>
  );
}
