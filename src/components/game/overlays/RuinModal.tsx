import { useEffect, useState } from "react";
import { useGameStore } from "@/game/store";

export function RuinModal() {
  const finishMission = useGameStore((s) => s.finishMission);
  const broadcastSignal = useGameStore((s) => s.broadcastSignal);
  const setPhase = useGameStore((s) => s.setPhase);
  const character = useGameStore((s) => s.getCharacter());
  const [armed, setArmed] = useState(false);

  // The transmit is irreversible and ends the run, so the countersign stands
  // down on its own rather than sitting hot behind a stray second tap.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-void/70 p-4 sm:items-center">
      <div className="panel-glass max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-sm p-6">
        <p className="font-mono text-[11px] tracking-[0.3em] text-warn">
          ARTIFACT CHAMBER · TRANSLATION ACTIVE
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-fg">REMEMBER</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          The walls carry star maps older than the war that made you leave. The
          algorithm is not decoding so much as being given answers. In the
          center of the chamber a single word resolves — not as sound, but as a
          pressure behind the eyes.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A civilization burned its signature clean and still left a warning:
          zero-point light is a beacon. Something that feeds on it is already
          moving. The Devourers track the same noise your generators make when
          they keep the colony alive.
        </p>
        <p className="mt-4 border-l-2 border-accent pl-3 font-mono text-sm text-accent text-glow-fern">
          REMEMBER.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-dim">
          Far south, Kaguyahime answers analysis pings. On the ridge, Hale's
          people already know the forest maps perimeters. Your arm is warmer
          than the diagnostic baseline. File the log. Keep the generators
          collared. Do not shout into the dark.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={finishMission}
            className="min-h-11 rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-fg hover:bg-primary-glow"
          >
            Seal log & return
          </button>
          <button
            type="button"
            onClick={() => setPhase("playing")}
            className="min-h-11 rounded-sm border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
          >
            Continue exploring
          </button>
        </div>

        <div className="mt-7 border-t border-danger/30 pt-5">
          <p className="font-mono text-[10px] tracking-[0.2em] text-danger">
            OPTION NOT ON THE MISSION SHEET
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The chamber array still answers. Uncollared, it would put the star
            maps in the clear — with the colony vector, the collar frequencies,
            and your callsign appended, because the log routine will not file a
            transmission nobody signed.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            They erased their own signature and still spent their last effort
            on one word. Broadcasting is not answering it. It is handing the
            dark an address, and a name to read it by.
          </p>
          <button
            type="button"
            onClick={() => (armed ? broadcastSignal() : setArmed(true))}
            className={`mt-4 min-h-11 w-full rounded-sm border-l-2 border-danger px-3 py-2.5 text-left font-mono text-[11px] tracking-wide text-danger ${
              armed ? "bg-danger/15" : "bg-danger/5 hover:bg-danger/10"
            }`}
          >
            {armed
              ? `COUNTERSIGN ${character?.callsign ?? "OPERATIVE"} — TRANSMIT STAR MAPS`
              : "AUTHORIZE UNCOLLARED TRANSMIT — COUNTERSIGN REQUIRED"}
          </button>
          {armed && (
            <p className="mt-2 font-mono text-[10px] text-dim">
              ARMED · STANDS DOWN IN 5S · THE LOG WILL CARRY YOUR NAME
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
