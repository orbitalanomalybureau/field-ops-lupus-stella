import { useEffect, useState } from "react";
import { getAudio } from "@/game/audio";
import { useGameStore } from "@/game/store";

export function ClickToPlay() {
  const [show, setShow] = useState(true);

  useEffect(() => {
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
    const t = window.setTimeout(() => {
      if (matchMedia("(pointer: coarse)").matches) setShow(false);
    }, 5000);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      window.clearTimeout(t);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[32%] z-20 flex justify-center px-4">
      <p className="panel-glass rounded-md px-4 py-2.5 font-mono text-xs text-muted">
        Click canvas to look · WASD move · Q scan · E interact
      </p>
    </div>
  );
}
