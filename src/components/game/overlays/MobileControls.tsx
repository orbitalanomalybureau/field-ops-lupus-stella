import { useEffect, useRef } from "react";

export function MobileControls() {
  const moveRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = {
      mx: 0,
      my: 0,
      lx: 0,
      ly: 0,
      interact: false,
      sprint: false,
      scan: false,
    };
    (window as unknown as { __touchInput: typeof input }).__touchInput = input;

    const bindStick = (
      el: HTMLDivElement | null,
      onMove: (x: number, y: number) => void,
      onEnd: () => void,
    ) => {
      if (!el) return () => {};
      let active = false;
      let pid: number | null = null;
      const rect = () => el.getBoundingClientRect();

      const start = (e: PointerEvent) => {
        if (pid !== null) return;
        active = true;
        pid = e.pointerId;
        el.setPointerCapture(e.pointerId);
        move(e);
      };
      const move = (e: PointerEvent) => {
        if (!active || e.pointerId !== pid) return;
        const r = rect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = (e.clientX - cx) / (r.width / 2);
        const dy = (e.clientY - cy) / (r.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const clamp = Math.min(1, len);
        onMove((dx / len) * clamp, (dy / len) * clamp);
      };
      const end = (e: PointerEvent) => {
        if (e.pointerId !== pid) return;
        active = false;
        pid = null;
        onEnd();
      };

      el.addEventListener("pointerdown", start);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      return () => {
        el.removeEventListener("pointerdown", start);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
      };
    };

    const un1 = bindStick(
      moveRef.current,
      (x, y) => {
        input.mx = x;
        input.my = y;
      },
      () => {
        input.mx = 0;
        input.my = 0;
      },
    );
    const un2 = bindStick(
      lookRef.current,
      (x, y) => {
        input.lx = x;
        input.ly = y;
      },
      () => {
        input.lx = 0;
        input.ly = 0;
      },
    );
    return () => {
      un1();
      un2();
    };
  }, []);

  const setFlag = (key: "sprint" | "scan" | "interact", v: boolean) => {
    const t = (window as unknown as { __touchInput: Record<string, boolean> })
      .__touchInput;
    if (t) t[key] = v;
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-end justify-between p-3 sm:hidden">
      <div
        ref={moveRef}
        className="pointer-events-auto relative h-28 w-28 touch-none rounded-full border border-border/80 bg-surface/55"
        aria-label="Move"
      >
        <div className="absolute inset-6 rounded-full border border-dim/40" />
      </div>
      <div className="pointer-events-auto mb-1 flex flex-col gap-2">
        <button
          type="button"
          className="min-h-12 min-w-12 rounded-full border border-border bg-surface/75 font-mono text-[10px] text-fg"
          onPointerDown={() => setFlag("sprint", true)}
          onPointerUp={() => setFlag("sprint", false)}
          onPointerLeave={() => setFlag("sprint", false)}
        >
          SPR
        </button>
        <button
          type="button"
          className="min-h-12 min-w-12 rounded-full border border-accent/40 bg-accent/15 font-mono text-[10px] text-accent"
          onPointerDown={() => setFlag("scan", true)}
          onPointerUp={() => setFlag("scan", false)}
          onPointerLeave={() => setFlag("scan", false)}
        >
          SCN
        </button>
        <button
          type="button"
          className="min-h-12 min-w-12 rounded-full border border-primary/50 bg-primary/20 font-mono text-[10px] text-primary-glow"
          onPointerDown={() => setFlag("interact", true)}
          onPointerUp={() => setFlag("interact", false)}
        >
          E
        </button>
      </div>
      <div
        ref={lookRef}
        className="pointer-events-auto relative h-28 w-28 touch-none rounded-full border border-border/80 bg-surface/55"
        aria-label="Look"
      >
        <div className="absolute inset-6 rounded-full border border-dim/40" />
      </div>
    </div>
  );
}
