import { useEffect, useId, useState } from "react";

/**
 * How long a control stays hot once armed. Everything behind one of these is
 * irreversible — a transmit that ends the run, a wipe that erases the save —
 * so the arm stands down on its own rather than waiting behind a stray second
 * tap. The caption quotes this number, so window and copy cannot drift apart.
 */
const STAND_DOWN_MS = 5000;

type Props = {
  /** Resting label; also the accessible name until the control is armed. */
  idleLabel: string;
  /** Armed label — the next activation commits. */
  armedLabel: string;
  /** Tail of the stand-down caption, e.g. "PROGRESS IS NOT RECOVERABLE". */
  consequence: string;
  onConfirm: () => void;
  /** Classes that hold in both states; the state class is appended. */
  className?: string;
  idleClassName?: string;
  armedClassName?: string;
  /** The caption renders as the button's next sibling, so callers place it. */
  hintClassName?: string;
};

/**
 * Arm-then-confirm control shared by the endgame's two irreversible choices.
 * Both sites grew their own timer and their own caption and had started to
 * drift; the stand-down window is asserted by the demo Playwright run, so it
 * lives here once.
 */
export function ArmedButton({
  idleLabel,
  armedLabel,
  consequence,
  onConfirm,
  className = "",
  idleClassName = "",
  armedClassName = "",
  hintClassName = "",
}: Props) {
  const [armed, setArmed] = useState(false);
  const hintId = useId();

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), STAND_DOWN_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <>
      <button
        type="button"
        // Toggle semantics carry the armed state to a screen reader on the
        // press that arms it; the caption it points at carries the stakes.
        aria-pressed={armed}
        aria-describedby={armed ? hintId : undefined}
        onClick={() => (armed ? onConfirm() : setArmed(true))}
        className={`${className} ${armed ? armedClassName : idleClassName}`}
      >
        {armed ? armedLabel : idleLabel}
      </button>
      {armed && (
        <p id={hintId} role="status" className={hintClassName}>
          {`ARMED · STANDS DOWN IN ${STAND_DOWN_MS / 1000}S · ${consequence}`}
        </p>
      )}
    </>
  );
}
