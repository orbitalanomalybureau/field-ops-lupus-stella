import { useEffect, useState } from "react";
import { useGameStore } from "@/game/store";
import { BootScreen } from "./overlays/BootScreen";
import { CharacterSelect } from "./overlays/CharacterSelect";
import { Briefing } from "./overlays/Briefing";
import { HUD } from "./overlays/HUD";
import { MobileControls } from "./overlays/MobileControls";
import { CompleteScreen } from "./overlays/CompleteScreen";
import { RuinModal } from "./overlays/RuinModal";
import { ClickToPlay } from "./overlays/ClickToPlay";
import { PauseMenu } from "./overlays/PauseMenu";
import { DialogueModal } from "./overlays/DialogueModal";
import { JournalPanel } from "./overlays/JournalPanel";
import { SettingsPanel } from "./overlays/SettingsPanel";

type Props = {
  embed?: boolean;
  skipBoot?: boolean;
};

export function FieldOpsApp({ embed = false, skipBoot = false }: Props) {
  const phase = useGameStore((s) => s.phase);
  const photoMode = useGameStore((s) => s.photoMode);
  const setPhase = useGameStore((s) => s.setPhase);
  const setEmbedMode = useGameStore((s) => s.setEmbedMode);
  const hydrate = useGameStore((s) => s.hydrate);
  const applyDeepLink = useGameStore((s) => s.applyDeepLink);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePhoto = useGameStore((s) => s.togglePhotoMode);
  const [mounted, setMounted] = useState(false);
  const [GameCanvas, setGameCanvas] = useState<null | React.ComponentType>(
    null,
  );

  useEffect(() => {
    setMounted(true);
    setEmbedMode(embed);
    hydrate();
    try {
      const params = new URLSearchParams(window.location.search);
      if ([...params.keys()].length) applyDeepLink(params);
    } catch {
      /* ignore */
    }
    if (skipBoot || embed) {
      if (useGameStore.getState().phase === "boot") setPhase("select");
      return;
    }
    const t = window.setTimeout(() => {
      if (useGameStore.getState().phase === "boot") setPhase("select");
    }, 1400);
    return () => window.clearTimeout(t);
  }, [setPhase, setEmbedMode, embed, skipBoot, hydrate, applyDeepLink]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      const msg = e.data as {
        type?: string;
        spoiler?: string;
        spawn?: string;
        operative?: string;
      };
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
        s.applyDeepLink(p);
      }
    };
    window.addEventListener("message", onMsg);
    try {
      window.parent?.postMessage({ type: "fieldops:ready", embed }, "*");
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("message", onMsg);
  }, [embed]);

  useEffect(() => {
    try {
      window.parent?.postMessage({ type: "fieldops:phase", phase }, "*");
    } catch {
      /* ignore */
    }
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      if (s.phase === "playing" || s.phase === "ruins") {
        if (e.code === "KeyJ") {
          e.preventDefault();
          openJournal();
        }
        if (e.code === "KeyP") {
          e.preventDefault();
          togglePhoto();
        }
        if (e.code === "KeyK") {
          e.preventDefault();
          useGameStore.setState({
            prevPhase: s.phase,
            phase: "settings",
          });
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
      if (s.phase === "photo" && (e.code === "KeyP" || e.code === "Escape")) {
        togglePhoto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openJournal, togglePhoto]);

  useEffect(() => {
    const worldPhases = [
      "playing",
      "ruins",
      "paused",
      "dialogue",
      "journal",
      "photo",
      "settings",
    ];
    if (!worldPhases.includes(phase)) return;
    let cancelled = false;
    import("./scene/GameCanvas").then((mod) => {
      if (!cancelled) setGameCanvas(() => mod.GameCanvas);
    });
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

  const inWorld = [
    "playing",
    "ruins",
    "paused",
    "dialogue",
    "journal",
    "photo",
    "settings",
  ].includes(phase);

  const showHud =
    (phase === "playing" || phase === "ruins" || phase === "dialogue") &&
    !photoMode;

  return (
    <div
      className={`relative w-full overflow-hidden bg-void text-fg ${embed ? "h-full min-h-[480px]" : "h-dvh"}`}
      data-fieldops-embed={embed ? "1" : "0"}
    >
      {inWorld && GameCanvas && (
        <div className="absolute inset-0">
          <GameCanvas />
        </div>
      )}

      {phase === "boot" && !skipBoot && !embed && <BootScreen />}
      {(phase === "select" || (phase === "boot" && (skipBoot || embed))) && (
        <CharacterSelect />
      )}
      {phase === "briefing" && <Briefing />}
      {showHud && (
        <>
          <HUD />
          <MobileControls />
          <ClickToPlay />
        </>
      )}
      {phase === "photo" && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 font-mono text-[10px] text-fg/70">
          PHOTO MODE · P to exit
        </div>
      )}
      {phase === "paused" && <PauseMenu />}
      {phase === "dialogue" && <DialogueModal />}
      {phase === "journal" && <JournalPanel />}
      {phase === "settings" && <SettingsPanel />}
      {phase === "ruins" && !photoMode && <RuinModal />}
      {phase === "complete" && <CompleteScreen />}

      {!embed && !photoMode && (
        <div className="terminal-scan absolute inset-0 z-50 opacity-30" />
      )}
    </div>
  );
}
