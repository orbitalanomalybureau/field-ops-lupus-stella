import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { CACHE_LOGS, NPCS, SCAN_TARGETS, SITE_LOGS, WORLD } from "@/game/data";
import { ENTITIES, entitiesOfKind, type WorldEntity } from "@/game/entities";
import { consumeEdge, isHeld, lastDevice } from "@/game/input";
import { passesCeiling } from "@/game/selectors";
import { useGameStore } from "@/game/store";
import { getAudio } from "@/game/audio";
import type { ObjectiveId } from "@/game/types";

/** Scan targets that unlock a quest node. Parallel to SCAN_TARGETS.codexId. */
const SCAN_REVEALS: Record<string, ObjectiveId> = {
  "scan-grid": "ruins",
};

/** Registry rows this system picks. Resolved once; the pick runs every frame. */
const BY_ID = new Map(ENTITIES.map((e) => [e.id, e] as const));
const CACHES = entitiesOfKind("cache");

/**
 * One-shot discovery sites. Each fires once, tracked by a persisted seen-flag
 * set through the same effect verb dialogue uses — no new store surface, and
 * the flag rides the save blob so a read site stays read across reloads.
 */
const SITES = ["carver-marker", "verne-plate", "hale-camp"] as const;

/**
 * Rest targets for the ops-floor bunk, as timeOfDay fractions. Dawn matches
 * the deploy-time morning (the store default 0.35 sits just after it). Dusk
 * lands a hair past the store's strict isNight threshold (timeOfDay > 0.78)
 * so the fern window is already open the frame the operative wakes.
 */
const REST_DAWN = 0.3;
const REST_DUSK = 0.785;

/**
 * How long the interact key must be held before the watch rotates. The rest
 * label flips in place under one key ("until dusk"/"until dawn"), so a press
 * edge let a double-tap cost a full rotation; a hold cannot be tapped twice.
 */
const REST_HOLD_SEC = 1.2;

function dist2(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

type Cand = {
  label: string;
  sub?: string;
  dist: number;
  radius: number;
  action: () => void;
  /** Hold-to-confirm instead of a press edge. Stable across a flipping label. */
  holdId?: string;
};

export function InteractionSystem() {
  const fernTimer = useRef(0);
  const perimeterArmed = useRef(false);
  const perimeterDone = useRef(false);
  const scanHold = useRef(0);
  const nearScanId = useRef<string | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  // Last prompt written to the store, so an unchanged prompt does not push a
  // fresh object every frame and re-render the HUD off movement alone.
  const lastPrompt = useRef<string | null>(null);
  // Hold-to-confirm accumulator, keyed by holdId rather than label: resting
  // flips the label in place the instant the clock jumps, and the spent latch
  // has to outlive that or a still-held key would rotate the watch twice.
  const holdId = useRef<string | null>(null);
  const holdTimer = useRef(0);
  const holdSpent = useRef(false);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    if (store.phase !== "playing" && store.phase !== "ruins") return;

    const { x, z } = store.playerPos;
    const d = Math.min(delta, 0.05);
    const ceil = store.spoilerCeiling;
    const char = store.getCharacter();
    const scanMul = char?.scanBonus ?? 1;
    // A hold needs a HELD interact, which only the keyboard path reports:
    // touch sends one tap edge and the pad re-adds its edge every poll. On
    // those devices the action stays a press, so the bunk is still reachable.
    const canHold = lastDevice() === "keyboard";

    // Spawn sits inside the gate's 12 m completion ring, so the trigger only
    // arms once the operative has actually walked away — a fresh deploy must
    // not complete the perimeter tasking on its first frame.
    const gateDist = dist2(x, z, WORLD.southGate[0], WORLD.southGate[2]);
    if (!perimeterArmed.current && gateDist > 25) {
      perimeterArmed.current = true;
    }
    if (perimeterArmed.current && !perimeterDone.current && gateDist < 12) {
      perimeterDone.current = true;
      store.completeObjective("perimeter");
    }

    if (z > WORLD.treelineZ - 6 && z < WORLD.treelineZ + 35) {
      fernTimer.current += d;
      if (
        fernTimer.current > WORLD.fernPulse * 1.1 &&
        !store.objectives.find((o) => o.id === "ferns")?.done
      ) {
        store.completeObjective("ferns");
        store.unlockCodex("ferns");
        store.unlockCodex("titans");
      }
    }

    let best: Cand | null = null;
    const consider = (c: Cand) => {
      if (c.dist > c.radius) return;
      if (!best || c.dist < best.dist) best = c;
    };

    /** Label, pick range, and spoiler tier all come off the registry row. */
    const considerEntity = (
      e: WorldEntity | undefined,
      action: () => void,
      opts?: { label?: string; sub?: string; holdId?: string },
    ) => {
      if (!e?.interact || !passesCeiling(e, ceil)) return;
      consider({
        label: opts?.label ?? e.interact.label,
        sub: opts?.sub ?? "Press E",
        dist: dist2(x, z, e.x, e.z),
        radius: e.interact.radius,
        action,
        holdId: opts?.holdId,
      });
    };

    for (const n of NPCS) {
      considerEntity(BY_ID.get(n.id), () => store.openDialogue(n.id), {
        label: `Talk — ${n.name}`,
        sub: n.role,
      });
    }

    // Entering is picked from the apron; leaving, from the ops floor under the
    // shell. The two prompts are deliberately anchored two metres apart.
    if (store.insideDome) {
      considerEntity(BY_ID.get("dome-command"), () => store.exitDome(), {
        label: "Exit command dome",
      });

      // REST — the fern harvest is night-only and a day is eight real
      // minutes; the bunk turns "come back after dark" into one watch
      // rotation. By day (tod 0.3–0.7) the rotation lands at dusk, when the
      // fern window opens; any other hour it lands at dawn. Storm weather
      // never refuses here: the prompt only exists on the ops floor, and the
      // dome IS the storm shelter — the outside-in-a-storm refusal has no
      // reachable state. The jump is instantaneous this wave; a fade hook
      // exists in FieldOpsApp if a later pass wants to dress it. Half a day
      // is too much to spend on a press edge, so this one action is a hold.
      const tod = store.timeOfDay;
      const toDusk = tod >= 0.3 && tod <= 0.7;
      considerEntity(
        BY_ID.get("dome-bunk"),
        () => {
          const s = useGameStore.getState();
          if (s.trackedByFang) {
            // A predator holding the player's line does not lose it to a nap.
            s.pushMessage("Can't rest — something has your line.");
            getAudio().refusalBuzz();
            return;
          }
          // advanceTime takes game hours; timeOfDay is a day fraction at
          // 24 h per day, so the forward gap to the target scales by 24.
          const target = toDusk ? REST_DUSK : REST_DAWN;
          s.advanceTime(((target - tod + 1) % 1) * 24);
          s.setStamina(100);
          s.setHealth(Math.min(100, s.health + 20));
          s.pushMessage(`REST — watch rotated to ${toDusk ? "dusk" : "dawn"}`);
          getAudio().pulseInteract();
          s.persist();
        },
        {
          label: toDusk ? "Rest until dusk" : "Rest until dawn",
          sub: canHold ? "Hold E — watch rotation" : "Watch rotation",
          holdId: "rest",
        },
      );
    } else {
      considerEntity(BY_ID.get("dome-entry"), () => store.enterDome(), {
        sub: "Ops floor",
      });
    }

    const ruin = BY_ID.get("ruin");
    const ruinD = dist2(x, z, WORLD.ruinPos[0], WORLD.ruinPos[2]);
    if (!store.ruinOpened) {
      // openRuin() refuses the sealed chamber; the prompt must say so first.
      const sealed = !store.isObjectiveAvailable("ruins");
      const atDoor = ruinD < (ruin?.interact?.radius ?? 0);
      considerEntity(ruin, () => store.openRuin(), {
        label: sealed ? "Inspect chamber seal" : undefined,
        sub: sealed
          ? "Alloy inert — seal holds"
          : atDoor
            ? "Press E"
            : "Approach",
      });
    } else if (store.phase === "playing") {
      // The breach is permanent, so the door stays a door: both endings live
      // in the chamber, and a save that chose "Continue exploring" must
      // always be able to walk back in. Gated off phase "ruins" so the
      // prompt never renders under the open chamber overlay.
      considerEntity(ruin, () => store.reenterRuin(), {
        label: "Return to the chamber",
      });
    }

    for (const c of CACHES) {
      if (store.cachesLooted.includes(c.id)) continue;
      considerEntity(c, () => {
        store.lootCache(c.id);
        // The cache is also a page: Survey Team B's serialized log rides in
        // with the supplies. Recovered, not written — the entry is unauthored.
        const log = CACHE_LOGS[c.id as keyof typeof CACHE_LOGS];
        if (log) {
          store.addJournal(log.title, log.body, false);
          store.pushMessage(`RECOVERED — ${log.title}`);
        }
        getAudio().pulseInteract();
      });
    }

    if (!store.ridgeBeaconPlanted) {
      considerEntity(BY_ID.get("ridge-beacon"), () => {
        store.plantRidgeBeacon();
        getAudio().pulseInteract();
      });
    }

    if (!store.kaguyahimeLogged) {
      considerEntity(
        BY_ID.get("coast-memorial"),
        () => {
          store.logKaguyahime();
          getAudio().pulseInteract();
        },
        { sub: "Far-continent vector" },
      );
    }

    if (!store.codex.find((c) => c.id === "collars")?.unlocked) {
      considerEntity(BY_ID.get("gen-west"), () => store.unlockCodex("collars"), {
        sub: "Press E or scan",
      });
    }

    // Discovery sites are not taskings — no pip points here. The prompt on the
    // registry row is the only invitation, and it withdraws once read.
    for (const id of SITES) {
      if (store.flags[`seen-${id}`]) continue;
      considerEntity(BY_ID.get(id), () => {
        const log = SITE_LOGS[id];
        store.applyDialogueEffect(`flag:seen-${id}`);
        store.addJournal(log.title, log.body, false);
        store.pushMessage(`SITE LOG — ${log.title}`);
        if (log.codex) store.unlockCodex(log.codex);
        getAudio().pulseInteract();
      });
    }

    if (best) {
      const b: Cand = best;
      const inRange = b.dist < b.radius;
      const holding = Boolean(b.holdId) && canHold && inRange;

      let hold: number | undefined;
      if (holding) {
        if (holdId.current !== b.holdId) {
          holdId.current = b.holdId ?? null;
          holdTimer.current = 0;
          holdSpent.current = false;
        }
        if (!isHeld("interact")) {
          // Released: the ring drains and the latch re-arms. One hold, one
          // rotation — a key left down must not roll the clock twice.
          holdTimer.current = 0;
          holdSpent.current = false;
        } else if (!holdSpent.current) {
          // Real time, not the physics clamp: `d` would stretch 1.2 s into
          // ten on a headless frame, while a single stall frame must still
          // not fill the ring by itself.
          holdTimer.current = Math.min(
            REST_HOLD_SEC,
            holdTimer.current + Math.min(delta, 0.25),
          );
          if (holdTimer.current >= REST_HOLD_SEC) {
            holdSpent.current = true;
            b.action();
          }
        }
        hold = holdTimer.current / REST_HOLD_SEC;
      } else {
        holdId.current = null;
      }

      // Distance rounded to the metre: the readout shows integers, so sub-metre
      // drift must not count as a change and re-render the prompt every frame.
      // The ring is quantized the same way, to tenths.
      const ring = hold === undefined ? "" : Math.round(hold * 10);
      const key = `${b.label}|${b.sub ?? ""}|${Math.round(b.dist)}|${ring}`;
      if (key !== lastPrompt.current) {
        lastPrompt.current = key;
        store.setInteract({ label: b.label, sub: b.sub, dist: b.dist, hold });
      }
      // A hold action deliberately leaves nothing pending: the press edge is
      // still consumed below, it just does not fire the rotation.
      pendingAction.current = inRange && !holding ? b.action : null;
    } else {
      if (lastPrompt.current !== null) {
        lastPrompt.current = null;
        store.setInteract(null);
      }
      pendingAction.current = null;
      holdId.current = null;
    }

    // The interact edge is consumed here and nowhere else — whichever caller
    // reads it first clears it, and the controller's snapshot() would too.
    if (consumeEdge("interact")) {
      pendingAction.current?.();
    }

    if (store.scannerActive) {
      let nearest: (typeof SCAN_TARGETS)[0] | null = null;
      let nd = 999;
      for (const t of SCAN_TARGETS) {
        if (!passesCeiling(t, ceil)) continue;
        if (store.scannedIds.includes(t.id)) continue;
        const dd = dist2(x, z, t.x, t.z);
        if (dd < t.radius && dd < nd) {
          nd = dd;
          nearest = t;
        }
      }
      if (nearest) {
        if (nearScanId.current !== nearest.id) {
          nearScanId.current = nearest.id;
          scanHold.current = 0;
        }
        const need = 1.6 / scanMul;
        scanHold.current += d;
        store.setScanProgress(Math.min(1, scanHold.current / need));
        if (scanHold.current >= need) {
          // Harvest FIRST and gate consumption on it: a nightOnly harvest
          // (the ferns) refuses by day and returns false, and the target must
          // stay scannable so the operative can come back after dark — marking
          // it scanned here would burn the only sample for nothing.
          const harvested = store.harvestScan(nearest.id);
          if (harvested) {
            store.markScanned(nearest.id);
            if (nearest.codexId) store.unlockCodex(nearest.codexId);
            const revealed = SCAN_REVEALS[nearest.id];
            if (revealed) store.revealObjective(revealed);
            store.pushMessage(`SCAN COMPLETE — ${nearest.title}`);
            getAudio().pulseInteract();
          }
          scanHold.current = 0;
          nearScanId.current = null;
        }
      } else {
        scanHold.current = Math.max(0, scanHold.current - d);
        store.setScanProgress(scanHold.current / 1.6);
        nearScanId.current = null;
      }
    } else {
      scanHold.current = 0;
      store.setScanProgress(0);
      nearScanId.current = null;
    }

    // Proximity codex unlocks are rewards for arriving somewhere, not a way
    // around the gate: standing near the Titans must not hand over what the
    // chamber is before the operative has traced the gradient to it.
    if (ruinD < 30 && store.isObjectiveAvailable("ruins")) {
      store.unlockCodex("ruins");
    }
    if (x < -70 && store.isObjectiveAvailable("ridge7")) {
      store.unlockCodex("ridge7");
    }
  });

  return null;
}
