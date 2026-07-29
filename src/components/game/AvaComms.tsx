import { useEffect } from "react";
import { AVA_LINES, WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import type { AvaTrigger, CharacterId } from "@/game/types";

/** Squared trigger radii — evaluated per state change, so no sqrt. */
const RUIN_NEAR_SQ = 30 * 30;
const COAST_NEAR_SQ = 30 * 30;
/** timeOfDay where DUSK becomes NIGHT — the HUD clock's boundary. */
const NIGHT_TOD = 0.8;

/**
 * Once-per-run latch. Module scope, not component state: the component
 * unmounts whenever the player leaves the world (complete screen, reset) and
 * a remount must not replay lines mid-run. The operative change is the run
 * boundary — reset() clears characterId before a new selection, so replaying
 * with the same operative still clears the latch.
 */
const fired = new Set<AvaTrigger>();
let latchOwner: CharacterId | null = null;

function distSq(px: number, pz: number, pos: readonly [number, number, number]): number {
  const dx = px - pos[0];
  const dz = pz - pos[2];
  return dx * dx + dz * dz;
}

/**
 * The Ava comms layer (Firewatch-style, Pillar 5e). Headless: watches the
 * store through subscribe — zero React renders — and drops one line per
 * trigger per run into the message ticker. Theo hears Ava herself; the other
 * operatives hear the terse colony-net version of the same traffic. Missing
 * content is silent by design so triggers can ship ahead of lines.
 */
export function AvaComms() {
  useEffect(() => {
    const deliver = (trigger: AvaTrigger) => {
      if (fired.has(trigger)) return;
      fired.add(trigger);
      const line = AVA_LINES.find((l) => l.trigger === trigger);
      if (!line) return;
      const s = useGameStore.getState();
      const theo = s.characterId === "theo";
      const text = theo ? line.ava : line.net;
      if (!text) return;
      s.pushMessage(`${theo ? "AVA" : "NET"} — ${text}`);
    };

    return useGameStore.subscribe((s, prev) => {
      if (s.characterId !== latchOwner) {
        latchOwner = s.characterId;
        fired.clear();
      }
      if (!s.characterId) return;

      const { x, z } = s.playerPos;
      if (!fired.has("treeline") && z > WORLD.treelineZ) {
        deliver("treeline");
      }
      if (!fired.has("tracked") && s.trackedByFang) {
        deliver("tracked");
      }
      if (!fired.has("storm-in") && s.weather === "storm") {
        deliver("storm-in");
      }
      if (!fired.has("ruin-near") && distSq(x, z, WORLD.ruinPos) < RUIN_NEAR_SQ) {
        deliver("ruin-near");
      }
      if (!fired.has("nightfall") && prev.timeOfDay < NIGHT_TOD && s.timeOfDay >= NIGHT_TOD) {
        deliver("nightfall");
      }
      // Edge, not level: fangKills persists, and a save that already has
      // kills had its first kill in a previous session.
      if (!fired.has("first-kill") && prev.fangKills === 0 && s.fangKills > 0) {
        deliver("first-kill");
      }
      // Same reasoning for the ambush codex: only the moment of unlock counts.
      if (!fired.has("ambush-seen") && s.codex !== prev.codex) {
        const now = s.codex.find((c) => c.id === "route-learning")?.unlocked;
        const was = prev.codex.find((c) => c.id === "route-learning")?.unlocked;
        if (now && !was) deliver("ambush-seen");
      }
      if (
        !fired.has("coast") &&
        s.spoilerCeiling === "book2early" &&
        distSq(x, z, WORLD.coastMemorial) < COAST_NEAR_SQ
      ) {
        deliver("coast");
      }
      if (!fired.has("broadcast") && s.ending === "broadcast" && prev.ending !== "broadcast") {
        deliver("broadcast");
      }
    });
  }, []);

  return null;
}
