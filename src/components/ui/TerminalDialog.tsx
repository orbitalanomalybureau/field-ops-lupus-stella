import { useCallback, useEffect, useRef } from "react";

type Props = {
  /** Screen-reader label. Also rendered as the eyebrow line when `eyebrow` is unset. */
  title: string;
  /** The small tracked caps line above the heading, e.g. "SYSTEMS HOLD". */
  eyebrow?: string;
  /** Escape / backdrop dismissal. Omit for dialogs that must be answered. */
  onClose?: () => void;
  /** Backdrop click closes. Off by default — a stray click should not discard a decision. */
  closeOnBackdrop?: boolean;
  className?: string;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Shared shell for the game's modal overlays.
 *
 * Every overlay previously rendered a bare div: no dialog role, no focus trap,
 * no focus restore, no Escape handling. Keyboard and screen-reader users could
 * tab straight out of a modal into the paused world behind it. The overlays all
 * share the same panel-glass structure already, so one wrapper fixes the whole
 * set without changing how any of them look.
 */
export function TerminalDialog({
  title,
  eyebrow,
  onClose,
  closeOnBackdrop = false,
  className = "max-w-sm",
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      // Pointer lock is re-acquired by clicking the canvas, so returning focus
      // to the body is correct when the trigger has unmounted with the overlay.
      const target = restoreTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-void/80 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (closeOnBackdrop && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`panel-glass w-full rounded-lg p-6 outline-none ${className}`}
      >
        {eyebrow ? (
          <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
