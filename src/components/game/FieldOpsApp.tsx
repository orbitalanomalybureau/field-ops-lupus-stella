import { useCallback, useEffect, useRef, useState } from "react";
import { clearEdges, matchesAction } from "@/game/input";
import { useGameStore } from "@/game/store";
import type { GamePhase } from "@/game/types";
import { onHostMessage, postToParent } from "@/lib/embed";
import { track } from "@/lib/telemetry";
import { AvaComms } from "./AvaComms";
import { BootScreen, InsertionTransition } from "./overlays/BootScreen";
import { CharacterSelect } from "./overlays/CharacterSelect";
import { Briefing } from "./overlays/Briefing";
import { HUD } from "./overlays/HUD";
import { MobileControls } from "./overlays/MobileControls";
import { CompleteScreen } from "./overlays/CompleteScreen";
import { RuinModal } from "./overlays/RuinModal";
import { ClickToPlay } from "./overlays/ClickToPlay";
import { PauseMenu } from "./overlays/PauseMenu";
import { PhotoMode } from "./overlays/PhotoMode";
import { CommsPlaceholder, DialogueModal } from "./overlays/DialogueModal";
import { JournalPanel } from "./overlays/JournalPanel";
import { SettingsPanel } from "./overlays/SettingsPanel";
import { KeybindOverlay, Tutorial } from "./overlays/Tutorial";
import { WorldErrorBoundary } from "@/components/ui/WorldErrorBoundary";

type Props = {
  embed?: boolean;
  skipBoot?: boolean;
};

/** Phases that need the 3D chunk mounted. */
const WORLD_PHASES: GamePhase[] = [
  "playing",
  "ruins",
  "paused",
  "dialogue",
  "journal",
  "photo",
  "settings",
];

export function FieldOpsApp(props: Props) {
  // The boundary sits above the component that throws: chunk-load failures
  // surface via the canvasError re-throw inside, and render crashes anywhere
  // in the world tree land here instead of on a dead black screen.
  return (
    <WorldErrorBoundary>
      <FieldOpsAppInner {...props} />
    </WorldErrorBoundary>
  );
}

function FieldOpsAppInner({ embed = false, skipBoot = false }: Props) {
  const phase = useGameStore((s) => s.phase);
  const photoMode = useGameStore((s) => s.photoMode);
  const reducedMotion = useGameStore((s) => s.reducedMotion);
  const setPhase = useGameStore((s) => s.setPhase);
  const setEmbedMode = useGameStore((s) => s.setEmbedMode);
  const hydrate = useGameStore((s) => s.hydrate);
  const initPreferences = useGameStore((s) => s.initPreferences);
  const startAutosave = useGameStore((s) => s.startAutosave);
  const applyDeepLink = useGameStore((s) => s.applyDeepLink);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePhoto = useGameStore((s) => s.togglePhotoMode);
  const [mounted, setMounted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const insertionSpent = useRef(false);
  const [GameCanvas, setGameCanvas] = useState<null | React.ComponentType>(null);
  const [canvasError, setCanvasError] = useState<Error | null>(null);
  if (canvasError) throw canvasError;

  useEffect(() => {
    setMounted(true);
    setEmbedMode(embed);
    initPreferences();
    hydrate();
    try {
      const params = new URLSearchParams(window.location.search);
      if ([...params.keys()].length) applyDeepLink(params);
    } catch {
      /* ignore */
    }
    if (skipBoot || embed) {
      if (useGameStore.getState().phase === "boot") setPhase("select");
    }
  }, [setPhase, setEmbedMode, embed, skipBoot, hydrate, initPreferences, applyDeepLink]);

  useEffect(() => startAutosave(), [startAutosave]);

  // Funnel instrumentation (Phase 5). Declared after the mount effect on
  // purpose: hydrate() has already replaced the objectives array by the time
  // this subscribes, so a restored save's finished objectives do not replay
  // as fresh completions on every page load.
  useEffect(() => {
    track("boot", { embed: embed ? 1 : 0 });
    return useGameStore.subscribe((s, prev) => {
      if (s.characterId && s.characterId !== prev.characterId) {
        track("select_operative", { operative: s.characterId });
      }
      if (WORLD_PHASES.includes(s.phase) && !WORLD_PHASES.includes(prev.phase)) {
        track("deploy", { operative: s.characterId ?? "unknown" });
      }
      if (s.objectives !== prev.objectives) {
        for (const o of s.objectives) {
          if (!o.done) continue;
          const before = prev.objectives.find((p) => p.id === o.id);
          if (before && !before.done) {
            track("objective_complete", { id: o.id });
          }
        }
      }
      if (s.ending && s.ending !== prev.ending) {
        track("ending", { ending: s.ending });
      }
    });
  }, [embed]);

  const finishBoot = useCallback(() => {
    if (useGameStore.getState().phase === "boot") setPhase("select");
  }, [setPhase]);

  const endInsertion = useCallback(() => setInserting(false), []);

  // The first frame of the world is the expensive one — chunk fetch plus every
  // shader in the scene — and it is spent on a black canvas. Cover it once per
  // session, on whichever route reaches the surface: deploy, resume, deep link.
  useEffect(() => {
    if (insertionSpent.current || !WORLD_PHASES.includes(phase)) return;
    insertionSpent.current = true;
    setInserting(true);
  }, [phase]);

  useEffect(() => {
    const unsubscribe = onHostMessage((msg) => {
      const s = useGameStore.getState();
      if (msg.type === "fieldops:pause") s.togglePause();
      if (msg.type === "fieldops:reset") s.reset();
      if (msg.type === "fieldops:journal") s.openJournal();
      if (msg.type === "fieldops:photo") s.togglePhotoMode();
      if (msg.type === "fieldops:deeplink") {
        const p = new URLSearchParams();
        if (msg.spoiler) p.set("spoiler", msg.spoiler);
        if (msg.spawn) p.set("spawn", msg.spawn);
        if (msg.operative) p.set("operative", msg.operative);
        if (msg.chapter) p.set("chapter", msg.chapter);
        s.applyDeepLink(p);
      }
    });
    postToParent({ type: "fieldops:ready", embed });
    return unsubscribe;
  }, [embed]);

  useEffect(() => {
    postToParent({ type: "fieldops:phase", phase });
  }, [phase]);

  // A queued one-shot press never crosses a phase boundary: an E buffered
  // while a dialogue or the pause menu was open would otherwise replay on the
  // first playing frame and reopen what the player just closed.
  useEffect(
    () =>
      useGameStore.subscribe((s, prev) => {
        if (s.phase !== prev.phase) clearEdges();
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      if (s.phase === "playing" || s.phase === "ruins") {
        if (matchesAction(e.code, "journal")) {
          e.preventDefault();
          openJournal();
        }
        if (matchesAction(e.code, "photo")) {
          e.preventDefault();
          togglePhoto();
        }
        if (matchesAction(e.code, "settings")) {
          e.preventDefault();
          useGameStore.setState({
            prevPhase: s.phase,
            phase: "settings",
          });
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
      // Escape stays literal here: it is the universal close key, not a
      // rebindable action, and must exit photo mode whatever pause is bound to.
      if (
        s.phase === "photo" &&
        (matchesAction(e.code, "photo") || e.code === "Escape")
      ) {
        togglePhoto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openJournal, togglePhoto]);

  useEffect(() => {
    if (phase !== "briefing" && !WORLD_PHASES.includes(phase)) return;
    let cancelled = false;
    // One retry, then surface the failure. Without the catch, a tab left open
    // across a redeploy 404s the old hashed chunk and the world simply never
    // arrives — a silent black screen with a working HUD.
    const load = (attempt: number) => {
      import("./scene/GameCanvas")
        .then((mod) => {
          if (!cancelled) setGameCanvas(() => mod.GameCanvas);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (attempt < 1) {
            window.setTimeout(() => load(attempt + 1), 1200);
            return;
          }
          setCanvasError(
            err instanceof Error ? err : new Error("world chunk failed to load"),
          );
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (!mounted) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-void font-mono text-sm text-muted">
        INITIALIZING TERMINAL…
      </div>
    );
  }

  const inWorld = WORLD_PHASES.includes(phase);

  const showHud = (phase === "playing" || phase === "ruins" || phase === "dialogue") && !photoMode;

  return (
    <div
      className={`relative w-full overflow-hidden bg-void text-fg ${embed ? "h-full min-h-[480px]" : "h-dvh"} ${reducedMotion ? "reduced-motion" : ""}`}
      data-fieldops-embed={embed ? "1" : "0"}
    >
      {inWorld && GameCanvas && (
        // data attribute: how PhotoMode finds the WebGL canvas to read back
        // without importing anything from the lazily loaded scene chunk.
        <div className="absolute inset-0" data-fieldops-canvas>
          <GameCanvas />
        </div>
      )}
      {inWorld && <AvaComms />}

      {phase === "boot" && !skipBoot && !embed && <BootScreen onDone={finishBoot} />}
      {(phase === "select" || (phase === "boot" && (skipBoot || embed))) && <CharacterSelect />}
      {phase === "briefing" && <Briefing />}
      {showHud && (
        <>
          <HUD />
          <MobileControls />
          <ClickToPlay />
        </>
      )}
      {inWorld && !photoMode && <Tutorial />}
      {inWorld && <KeybindOverlay />}
      {phase === "photo" && <PhotoMode />}
      {phase === "paused" && <PauseMenu />}
      {/* Mounted across the whole world phase set so the flip into 'dialogue'
          never remounts it — it has to be subscribed before the flip lands. */}
      {inWorld && <CommsPlaceholder />}
      {phase === "dialogue" && <DialogueModal />}
      {phase === "journal" && <JournalPanel />}
      {phase === "settings" && <SettingsPanel />}
      {phase === "ruins" && !photoMode && <RuinModal />}
      {phase === "complete" && <CompleteScreen />}

      {inWorld && <FlatlineOverlay />}

      {!embed && !photoMode && <div className="terminal-scan absolute inset-0 z-50 opacity-30" />}

      {inserting && <InsertionTransition ready={Boolean(GameCanvas)} onDone={endInsertion} />}
    </div>
  );
}

/** The overlay reads the same clock flatline() writes with. */
function evacNow(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

/**
 * Death is an evacuation, not a game-over screen. While store.evacUntil (a
 * performance.now()-based deadline set once per death by flatline()) is in
 * the future, the collar has already pulled the operative out and this
 * overlay blacks the world while the respawn happens under it — diegetic,
 * non-interactive, self-clearing. A leaf: it subscribes only to evacUntil, a
 * number that moves once per death, and runs a coarse local clock only while
 * the window is open, so nothing else in the app re-renders for a death.
 */
function FlatlineOverlay() {
  const evacUntil = useGameStore((s) => s.evacUntil);
  const [now, setNow] = useState(() => evacNow());

  useEffect(() => {
    if (evacUntil <= evacNow()) return;
    setNow(evacNow());
    const id = window.setInterval(() => {
      const t = evacNow();
      setNow(t);
      // Self-arrest after the window lapses; otherwise this ticks (and
      // re-renders a null leaf) until the next death.
      if (t >= evacUntil) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [evacUntil]);

  if (evacUntil <= now) return null;
  // Fully black through the hold; the world fades back in over the final
  // second as the deadline lapses.
  const opacity = Math.min(1, (evacUntil - now) / 1000);
  return (
    <div
      role="status"
      aria-live="assertive"
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-void transition-opacity duration-200"
      style={{ opacity }}
    >
      <div className="text-center font-mono">
        <p className="text-[11px] tracking-[0.35em] text-danger">
          VITALS FLATLINE — COLLAR AUTO-EVAC
        </p>
        <p className="mt-2 text-xs text-muted">
          OPERATIVE RECOVERED — FIELD LOG INTACT
        </p>
      </div>
    </div>
  );
}
