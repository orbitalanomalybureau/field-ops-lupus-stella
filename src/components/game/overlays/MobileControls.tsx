import { useEffect, useRef, useState } from "react";
import {
  addTouchLook,
  pressAction,
  setTouchButton,
  setTouchMove,
} from "@/game/input";
import { useGameStore } from "@/game/store";

/** Half-width of the stick ring in px; the nub clamps to this. */
const STICK_RADIUS = 52;
const DEAD_ZONE = 7;

function buzz() {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  navigator.vibrate(10);
}

/**
 * Touch capability, not viewport width. Gating on `sm:hidden` left touch
 * tablets at 640 px+ with no way to move at all, and gave narrow desktop
 * windows thumbsticks they cannot use.
 */
function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const fine = window.matchMedia("(pointer: fine)");
    // maxTouchPoints catches tablets that still report a fine pointer, but a
    // laptop with a touchscreen keeps the mouse path: the drag surface would
    // otherwise swallow the canvas click that acquires pointer lock.
    const read = () =>
      setTouch(
        coarse.matches || (navigator.maxTouchPoints > 0 && !fine.matches),
      );
    read();
    coarse.addEventListener("change", read);
    fine.addEventListener("change", read);
    window.addEventListener("resize", read);
    return () => {
      coarse.removeEventListener("change", read);
      fine.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  return touch;
}

export function MobileControls() {
  const touch = useTouchDevice();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const scanned = useGameStore((s) => s.scannedIds.length);
  const lastScanned = useRef(scanned);

  useEffect(() => {
    if (scanned > lastScanned.current) buzz();
    lastScanned.current = scanned;
  }, [scanned]);

  useEffect(() => {
    if (!touch) return;
    const surface = surfaceRef.current;
    const base = baseRef.current;
    const nub = nubRef.current;
    if (!surface || !base || !nub) return;

    let movePointer: number | null = null;
    let lookPointer: number | null = null;
    let originX = 0;
    let originY = 0;
    let lastX = 0;
    let lastY = 0;

    const drawStick = (left: number, top: number, dx: number, dy: number) => {
      base.style.left = `${left}px`;
      base.style.top = `${top}px`;
      base.style.opacity = "1";
      nub.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    };

    const onDown = (e: PointerEvent) => {
      const r = surface.getBoundingClientRect();
      const rightHalf = e.clientX - r.left > r.width / 2;
      if (rightHalf) {
        if (lookPointer !== null) return;
        lookPointer = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        if (movePointer !== null) return;
        movePointer = e.pointerId;
        originX = e.clientX;
        originY = e.clientY;
        drawStick(e.clientX - r.left, e.clientY - r.top, 0, 0);
      }
      surface.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId === lookPointer) {
        addTouchLook(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (e.pointerId !== movePointer) return;

      let dx = e.clientX - originX;
      let dy = e.clientY - originY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
        // The ring re-anchors under the thumb so a long drag never leaves the
        // stick stranded behind the finger at full deflection.
        originX = e.clientX - dx;
        originY = e.clientY - dy;
      }

      const r = surface.getBoundingClientRect();
      drawStick(originX - r.left, originY - r.top, dx, dy);
      if (len < DEAD_ZONE) {
        setTouchMove(0, 0);
        return;
      }
      setTouchMove(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId === lookPointer) {
        lookPointer = null;
        return;
      }
      if (e.pointerId !== movePointer) return;
      movePointer = null;
      setTouchMove(0, 0);
      base.style.opacity = "0";
    };

    surface.addEventListener("pointerdown", onDown);
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerup", onUp);
    surface.addEventListener("pointercancel", onUp);
    return () => {
      surface.removeEventListener("pointerdown", onDown);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerup", onUp);
      surface.removeEventListener("pointercancel", onUp);
      // Unmounting mid-press (a modal opening under the thumb) must not leave
      // the operative sprinting into the fog.
      setTouchMove(0, 0);
      setTouchButton("sprint", false);
      setTouchButton("scan", false);
    };
  }, [touch]);

  if (!touch) return null;

  return (
    <>
      <div
        ref={surfaceRef}
        aria-hidden="true"
        className="absolute inset-0 z-20 touch-none select-none"
      />
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          ref={baseRef}
          style={{ opacity: 0, left: 0, top: 0 }}
          className="absolute h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-surface/45 transition-opacity duration-150"
        >
          <div
            ref={nubRef}
            style={{ transform: "translate(-50%, -50%)" }}
            className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border border-accent/50 bg-accent/20"
          />
        </div>

        <div className="pointer-events-auto absolute bottom-4 right-3 flex flex-col gap-2">
          <button
            type="button"
            className="min-h-12 min-w-12 rounded-full border border-border bg-surface/75 font-mono text-[11px] text-fg"
            onPointerDown={() => setTouchButton("sprint", true)}
            onPointerUp={() => setTouchButton("sprint", false)}
            onPointerCancel={() => setTouchButton("sprint", false)}
            onPointerLeave={() => setTouchButton("sprint", false)}
          >
            SPR
          </button>
          <button
            type="button"
            className="min-h-12 min-w-12 rounded-full border border-accent/40 bg-accent/15 font-mono text-[11px] text-accent"
            onPointerDown={() => setTouchButton("scan", true)}
            onPointerUp={() => setTouchButton("scan", false)}
            onPointerCancel={() => setTouchButton("scan", false)}
            onPointerLeave={() => setTouchButton("scan", false)}
          >
            SCN
          </button>
          <button
            type="button"
            className="min-h-12 min-w-12 rounded-full border border-primary/50 bg-primary/20 font-mono text-[11px] text-primary-glow"
            onPointerDown={() => {
              pressAction("interact");
              buzz();
            }}
          >
            TAP
          </button>
        </div>
      </div>
    </>
  );
}
