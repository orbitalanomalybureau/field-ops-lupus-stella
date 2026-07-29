import { MISSION_BOARD } from "@/game/data";
import { useGameStore } from "@/game/store";
import type { SpawnPoint, SpoilerCeiling } from "@/game/types";

export function SettingsPanel() {
  const close = useGameStore((s) => s.closeOverlay);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const setSpoiler = useGameStore((s) => s.setSpoilerCeiling);
  const volume = useGameStore((s) => s.masterVolume);
  const setVol = useGameStore((s) => s.setMasterVolume);
  const reduced = useGameStore((s) => s.reducedMotion);
  const setReduced = useGameStore((s) => s.setReducedMotion);
  const setSpawn = useGameStore((s) => s.setPendingSpawn);
  const pushMessage = useGameStore((s) => s.pushMessage);
  const character = useGameStore((s) => s.getCharacter());

  const missions = MISSION_BOARD.filter(
    (m) => !m.book2 || spoiler !== "book1",
  );

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/80 px-3 backdrop-blur-sm">
      <div className="panel-glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-accent">
              SYSTEMS
            </p>
            <h2 className="mt-1 text-xl font-semibold text-fg">Settings</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-10 rounded-md border border-border px-3 font-mono text-xs text-muted hover:text-fg"
          >
            Close
          </button>
        </div>

        {character && (
          <div className="mt-4 rounded-md border border-border bg-surface/40 p-3">
            <p className="font-mono text-[10px] text-dim">ACTIVE LOADOUT</p>
            <p className="mt-1 text-sm font-semibold text-fg">
              {character.callsign}
            </p>
            <p className="mt-1 text-xs text-muted">{character.loadout}</p>
            <p className="mt-2 font-mono text-[10px] text-dim">
              SPD {character.speed} · STM {character.stamina} · STL{" "}
              {character.stealth} · SCAN×{character.scanBonus} · CBT×
              {character.combatBonus}
            </p>
          </div>
        )}

        <label className="mt-5 block">
          <span className="font-mono text-[10px] tracking-widest text-muted">
            SPOILER CEILING
          </span>
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
            value={spoiler}
            onChange={(e) =>
              setSpoiler(e.target.value as SpoilerCeiling)
            }
          >
            <option value="book1">Book I only</option>
            <option value="book2early">Book I + early Book II</option>
          </select>
        </label>

        <label className="mt-4 block">
          <span className="font-mono text-[10px] tracking-widest text-muted">
            MASTER VOLUME · {Math.round(volume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVol(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-accent)]"
          />
        </label>

        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-muted">
            Reduced motion / lighter FX
          </span>
        </label>

        <div className="mt-6">
          <p className="font-mono text-[10px] tracking-widest text-muted">
            MISSION BOARD · FAST TRAVEL MARK
          </p>
          <ul className="mt-2 space-y-2">
            {missions.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-left text-sm text-fg hover:border-accent/40"
                  onClick={() => {
                    if (m.spawn) {
                      setSpawn(m.spawn as SpawnPoint);
                      pushMessage(
                        `BOARD — ${m.title} marked for next deploy`,
                      );
                    }
                  }}
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="mt-0.5 block text-xs text-dim">
                    {m.detail}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[10px] text-dim">
            Marks apply on next deploy (reset → redeploy) or deep-link spawn.
          </p>
        </div>

        <button
          type="button"
          onClick={close}
          className="mt-6 min-h-11 w-full rounded-md bg-primary text-sm font-semibold text-fg hover:bg-primary-glow"
        >
          Resume
        </button>
      </div>
    </div>
  );
}
