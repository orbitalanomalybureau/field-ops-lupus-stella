import { useEffect, useRef, useState } from "react";
import { getAudio } from "@/game/audio";
import { lastDevice } from "@/game/input";
import { useGameStore } from "@/game/store";

/**
 * How long the hint may sit over the world before it retires itself. Pointer
 * lock is denied outright inside an iframe, so the card can be unsatisfiable —
 * and an unsatisfiable card must not become furniture. Re-armed per showing.
 */
const HINT_LIFE_MS = 15000;

/** Pad sticks are the only thing that flips lastDevice() to "gamepad". */
const PAD_POLL_MS = 400;

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
  /**
   * Retired: the operative is driving without lock, or has had long enough to
   * read the line. Cleared the instant lock is actually acquired, so a player
   * for whom lock works can still re-learn it after Escape drops it.
   */
  const retired = useRef(false);

  useEffect(() => {
    // Touch has no pointer lock to acquire; MobileControls owns that surface.
    if (matchMedia("(pointer: coarse)").matches) return;
    if (navigator.maxTouchPoints > 0) return;

    setShow(!document.pointerLockElement);
    const onLockChange = () => {
      if (document.pointerLockElement) {
        retired.current = false;
        setShow(false);
        getAudio().resume();
        return;
      }
      // Esc drops pointer lock without changing phase — without this the hint
      // never returns and the player has no way to learn how to re-acquire it.
      if (!retired.current && useGameStore.getState().phase === "playing")
        setShow(true);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () =>
      document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  // Only while the line is up, so a dismissed hint costs no listener and no
  // timer, and each fresh showing gets its own full life.
  useEffect(() => {
    if (!show) return;
    const retire = () => {
      retired.current = true;
      setShow(false);
    };
    // Escape is the pause key: it drops lock rather than demonstrating
    // anything, so it is the one key that does not count as driving.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") retire();
    };
    // A pad player never fires a keydown, so the device poll is their only
    // signal — the same sampling InteractPrompt uses on the same module.
    const poll = window.setInterval(() => {
      if (lastDevice() === "gamepad") retire();
    }, PAD_POLL_MS);
    const life = window.setTimeout(retire, HINT_LIFE_MS);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearInterval(poll);
      window.clearTimeout(life);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[32%] z-20 flex justify-center px-4">
      <p className="panel-glass rounded-md px-4 py-2.5 font-mono text-xs text-muted">
        Click canvas to look
      </p>
    </div>
  );
}
