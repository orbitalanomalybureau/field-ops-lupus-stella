import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "@/game/store";
import { MARKERS } from "@/game/data";
import { passesCeiling, visibleObjectivesOf } from "@/game/selectors";
import type { WeatherKind } from "@/game/types";
import {
  Crosshair,
  Map as MapIcon,
  BookOpen,
  NotebookPen,
  Activity,
  Radio,
  Pause,
  Scan,
  CloudRain,
} from "lucide-react";

function timeLabel(tod: number) {
  const hours = Math.floor(tod * 28) % 28;
  const mins = Math.floor((tod * 28 * 60) % 60);
  const phase =
    tod < 0.22
      ? "NIGHT"
      : tod < 0.35
        ? "DAWN"
        : tod < 0.65
          ? "DAY"
          : tod < 0.8
            ? "DUSK"
            : "NIGHT";
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")} · ${phase}`;
}

function weatherClass(weather: WeatherKind) {
  return weather === "storm"
    ? "text-warn"
    : weather === "rain"
      ? "text-accent"
      : "text-dim";
}

export function HUD() {
  const character = useGameStore((s) => s.getCharacter());
  const objectivesRaw = useGameStore((s) => s.objectives);
  const revealed = useGameStore((s) => s.revealedObjectives);
  const dynamicMarkers = useGameStore((s) => s.dynamicMarkers);
  const codexRaw = useGameStore((s) => s.codex);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const health = useGameStore((s) => s.health);
  const stamina = useGameStore((s) => s.stamina);
  const signalMeter = useGameStore((s) => s.signalMeter);
  const messages = useGameStore((s) => s.messages);
  const combatEnabled = useGameStore((s) => s.combatEnabled);
  const trackedByFang = useGameStore((s) => s.trackedByFang);
  const playerPos = useGameStore((s) => s.playerPos);
  const scannerActive = useGameStore((s) => s.scannerActive);
  const scanProgress = useGameStore((s) => s.scanProgress);
  const interact = useGameStore((s) => s.interact);
  const compass = useGameStore((s) => s.compassBearing);
  const scannedIds = useGameStore((s) => s.scannedIds);
  const weather = useGameStore((s) => s.weather);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const animState = useGameStore((s) => s.animState);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePause = useGameStore((s) => s.togglePause);
  const [panel, setPanel] = useState<"none" | "obj" | "codex" | "map">("obj");
  const [toast, setToast] = useState<string | null>(null);

  const objectives = useMemo(
    () => visibleObjectivesOf(objectivesRaw, revealed, spoiler),
    [objectivesRaw, revealed, spoiler],
  );
  const codex = useMemo(
    () => codexRaw.filter((c) => passesCeiling(c, spoiler)),
    [codexRaw, spoiler],
  );
  // Dialogue hints and field discoveries add pips at runtime; dedupe by id so a
  // hint that points at a static marker collapses onto it.
  const markers = useMemo(() => {
    const merged = [...MARKERS, ...dynamicMarkers].filter((m) =>
      passesCeiling(m, spoiler),
    );
    return Array.from(new Map(merged.map((m) => [m.id, m])).values());
  }, [dynamicMarkers, spoiler]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setPanel((p) => (p === "map" ? "none" : "map"));
      if (e.code === "KeyC" && !e.ctrlKey && !e.metaKey)
        setPanel((p) => (p === "codex" ? "none" : "codex"));
      if (e.code === "KeyO" || e.code === "Tab") {
        if (e.code === "Tab") e.preventDefault();
        setPanel((p) => (p === "obj" ? "none" : "obj"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Phones get one auto-expiring line instead of the stacked feed; without it
  // pushMessage output is invisible on the primary form factor.
  useEffect(() => {
    const latest = messages[0];
    if (!latest) return;
    setToast(latest);
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [messages]);

  const doneCount = objectives.filter((o) => o.done).length;
  const bearingLabel =
    compass < 45 || compass >= 315
      ? "N"
      : compass < 135
        ? "E"
        : compass < 225
          ? "S"
          : "W";

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="panel-glass min-w-0 max-w-[8.5rem] rounded-md px-3 py-2 sm:max-w-[18rem]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <p className="truncate font-mono text-[10px] tracking-[0.25em] text-accent">
              {character?.callsign ?? "—"}
              <span className="hidden sm:inline"> · FIELD OPS</span>
            </p>
          </div>
          {/* Rank and full name are identity flavour; on a phone the vertical
              space belongs to the world, not to a second copy of the callsign. */}
          <p className="mt-0.5 hidden truncate text-xs text-muted sm:block">
            {character?.rank} {character?.name}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-dim">
            {timeLabel(timeOfDay)}
            <span className="hidden sm:inline">
              {" "}
              · {animState.toUpperCase()}
            </span>
          </p>
        </div>

        <div className="panel-glass hidden rounded-md px-4 py-2 sm:block">
          <p className="text-center font-mono text-lg font-semibold tabular-nums text-fg">
            {bearingLabel}
            <span className="ml-2 text-xs text-dim">{Math.round(compass)}°</span>
          </p>
          <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[10px] text-muted">
            <CloudRain className="h-3 w-3" />
            <span className={weatherClass(weather)}>
              WX {weather.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Never wraps: five 44px targets wrapping under the identity panel on a
            375px viewport is what made the mobile HUD overlap itself. */}
        <div className="flex shrink-0 flex-nowrap justify-end gap-1 sm:gap-1.5">
          <HudBtn
            active={panel === "obj"}
            onClick={() => setPanel(panel === "obj" ? "none" : "obj")}
            label="Obj"
            icon={<Crosshair className="h-4 w-4" />}
          />
          <HudBtn
            active={panel === "codex"}
            onClick={() => setPanel(panel === "codex" ? "none" : "codex")}
            label="Codex"
            icon={<BookOpen className="h-4 w-4" />}
          />
          <HudBtn
            active={panel === "map"}
            onClick={() => setPanel(panel === "map" ? "none" : "map")}
            label="Map"
            icon={<MapIcon className="h-4 w-4" />}
          />
          <HudBtn
            active={false}
            onClick={openJournal}
            label="Log"
            icon={<NotebookPen className="h-4 w-4" />}
          />
          <HudBtn
            active={false}
            onClick={togglePause}
            label="Menu"
            icon={<Pause className="h-4 w-4" />}
          />
        </div>
      </div>

      {scannerActive && (
        <div className="pointer-events-none absolute inset-0 border-2 border-accent/30">
          <div className="absolute inset-8 border border-accent/20" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/40" />
          <div className="absolute bottom-36 left-1/2 w-48 -translate-x-1/2">
            <p className="mb-1 flex items-center justify-center gap-1 font-mono text-[10px] text-accent">
              <Scan className="h-3 w-3" /> SCAN · {scannedIds.length}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-accent transition-all duration-150"
                style={{ width: `${scanProgress * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {interact && interact.dist < 8 && (
        <div className="pointer-events-none absolute bottom-[38%] left-1/2 -translate-x-1/2">
          <div className="panel-glass flex items-center gap-3 rounded-md px-4 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-accent/50 font-mono text-xs text-accent">
              E
            </span>
            <div>
              <p className="text-sm font-medium text-fg">{interact.label}</p>
              {interact.sub && (
                <p className="font-mono text-[10px] text-dim">{interact.sub}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-24 left-3 right-3 sm:bottom-5 sm:left-4 sm:right-auto sm:w-72">
        {toast && (
          <p className="panel-glass mb-1.5 truncate rounded-md px-2.5 py-1.5 font-mono text-[10px] leading-snug text-muted sm:hidden">
            {toast}
          </p>
        )}
        <div className="panel-glass space-y-2 rounded-md p-3">
          <Bar icon={<Activity className="h-3 w-3" />} label="VITALS" value={health} color="bg-accent" />
          <Bar icon={<span className="font-mono text-[9px]">STM</span>} label="STAMINA" value={stamina} color="bg-primary" />
          <Bar icon={<Radio className="h-3 w-3" />} label="ZPE SIG" value={signalMeter * 100} color="bg-warn" />
          <div className="flex flex-wrap justify-between gap-x-2 font-mono text-[10px]">
            <span className={combatEnabled ? "text-danger" : "text-dim"}>
              {combatEnabled ? "ARMED" : "SAFE"}
            </span>
            {trackedByFang && (
              <span className="animate-pulse text-warn">TRACKED</span>
            )}
            <span className="tabular-nums text-fg sm:hidden">
              {bearingLabel} {Math.round(compass)}°
            </span>
            <span className={`sm:hidden ${weatherClass(weather)}`}>
              WX {weather.toUpperCase()}
            </span>
            <span className="text-dim">
              {playerPos.x.toFixed(0)},{playerPos.z.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-5 right-4 hidden w-80 space-y-1 sm:block">
        {messages.slice(0, 5).map((m, i) => (
          <p
            key={`${m}-${i}`}
            className="panel-glass rounded-md px-2.5 py-1.5 font-mono text-[10px] leading-snug text-muted"
            style={{ opacity: 1 - i * 0.15 }}
          >
            {m}
          </p>
        ))}
      </div>

      {panel === "obj" && (
        <div className="pointer-events-auto absolute left-3 top-24 max-h-[48vh] sm:top-20 w-[min(100%-1.5rem,19rem)] overflow-y-auto panel-glass rounded-md p-3 sm:left-4">
          <p className="mb-2 font-mono text-[10px] tracking-widest text-accent">
            OBJECTIVES {doneCount}/{objectives.length}
          </p>
          <ul className="space-y-2.5">
            {objectives.map((o) => (
              <li key={o.id} className="text-xs leading-snug">
                <span
                  className={
                    o.done
                      ? "text-accent line-through decoration-accent/40"
                      : "text-fg"
                  }
                >
                  {o.done ? "✓ " : "○ "}
                  {o.title}
                  {o.optional ? " · opt" : ""}
                  {o.book2 ? " · B2" : ""}
                </span>
                {!o.done && (
                  <p className="mt-0.5 pl-4 text-dim">{o.detail}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "codex" && (
        <div className="pointer-events-auto absolute left-3 top-24 max-h-[55vh] sm:top-20 w-[min(100%-1.5rem,21rem)] overflow-y-auto panel-glass rounded-md p-3 sm:left-4">
          <p className="mb-2 font-mono text-[10px] tracking-widest text-accent">
            FIELD CODEX
          </p>
          <ul className="space-y-3">
            {codex.map((c) => (
              <li key={c.id}>
                <p
                  className={`text-xs font-semibold ${c.unlocked ? "text-fg" : "text-dim"}`}
                >
                  {c.unlocked ? c.title : "········"}
                </p>
                {c.unlocked && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    {c.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "map" && (
        <div className="pointer-events-auto absolute left-1/2 top-24 w-[min(100%-1.5rem,19rem)] sm:top-20 -translate-x-1/2 panel-glass rounded-md p-3 sm:left-auto sm:right-4 sm:translate-x-0">
          <p className="mb-2 font-mono text-[10px] tracking-widest text-accent">
            TACTICAL MAP
          </p>
          <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-border bg-void">
            <div className="absolute inset-0 bg-gradient-to-b from-surface/40 to-void" />
            {markers.map((m) => {
              const px = 50 + (m.x / 260) * 42;
              const pz = 8 + (m.z / 230) * 82;
              return (
                <div
                  key={m.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${px}%`, top: `${pz}%` }}
                  title={m.label}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      m.kind === "ruin"
                        ? "bg-warn"
                        : m.kind === "colony"
                          ? "bg-accent"
                          : m.kind === "ridge"
                            ? "bg-primary"
                            : m.kind === "coast"
                              ? "bg-danger"
                              : "bg-muted"
                    }`}
                  />
                </div>
              );
            })}
            <div
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg bg-primary-glow"
              style={{
                left: `${50 + (playerPos.x / 260) * 42}%`,
                top: `${8 + (playerPos.z / 230) * 82}%`,
              }}
            />
          </div>
          <p className="mt-2 font-mono text-[10px] text-dim">
            W Ridge · S forest/coast · J journal
          </p>
        </div>
      )}
    </div>
  );
}

function Bar({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1">
          {icon} {label}
        </span>
        <span className="tabular-nums">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full ${color} transition-all duration-200`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function HudBtn({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 font-mono text-[9px] tracking-wide transition sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-[10px] ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-border bg-surface/80 text-muted hover:border-muted hover:text-fg"
      }`}
    >
      {icon}
      {/* Labelled at every size — two of the five icons used to be identical,
          leaving mobile with a row of indistinguishable glyphs. */}
      <span>{label}</span>
    </button>
  );
}
