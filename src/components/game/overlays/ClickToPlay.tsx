import { useEffect, useState } from "react";
import { getAudio } from "@/game/audio";
import { useGameStore } from "@/game/store";

/**
 * Pointer lock, and nothing else.
 *
 * Every other control belongs to Tutorial, which starts issuing hints the
 * moment lock is acquired — the same moment this disappears. Putting anything
 * more than the lock affordance here would put two cards teaching movement on
 * screen at once.
 */
export function ClickToPlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Touch has no pointer lock to acquire; MobileControls owns that surface.
    if (matchMedia("(pointer: coarse)").matches) return;
    if (navigator.maxTouchPoints > 0) return;

    setShow(!document.pointerLockElement);
    const onLockChange = () => {
      if (document.pointerLockElement) {
        setShow(false);
        getAudio().resume();
        return;
      }
      // Esc drops pointer lock without changing phase — without this the hint
      // never returns and the player has no way to learn how to re-acquire it.
      if (useGameStore.getState().phase === "playing") setShow(true);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () =>
      document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[32%] z-20 flex justify-center px-4">
      <p className="panel-glass rounded-md px-4 py-2.5 font-mono text-xs text-muted">
        Click canvas to look
      </p>
    </div>
  );
}
