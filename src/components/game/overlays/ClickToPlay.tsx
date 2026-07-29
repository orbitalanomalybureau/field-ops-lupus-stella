import { useEffect, useState } from "react";
import { getAudio } from "@/game/audio";

export function ClickToPlay() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const hide = () => {
      setShow(false);
      getAudio().resume();
    };
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement) hide();
    });
    const t = window.setTimeout(() => {
      if (matchMedia("(pointer: coarse)").matches) setShow(false);
    }, 5000);
    return () => window.clearTimeout(t);
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
