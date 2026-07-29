import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { NPCS, SCAN_TARGETS, WORLD } from "@/game/data";
import { ENTITIES, entitiesOfKind, type WorldEntity } from "@/game/entities";
import { consumeEdge } from "@/game/input";
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

function dist2(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

type Cand = {
  label: string;
  sub?: string;
  dist: number;
  radius: number;
  action: () => void;
};

export function InteractionSystem() {
  const fernTimer = useRef(0);
  const perimeterDone = useRef(false);
  const scanHold = useRef(0);
  const nearScanId = useRef<string | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    if (store.phase !== "playing" && store.phase !== "ruins") return;

    const { x, z } = store.playerPos;
    const d = Math.min(delta, 0.05);
    const ceil = store.spoilerCeiling;
    const char = store.getCharacter();
    const scanMul = char?.scanBonus ?? 1;

    if (
      !perimeterDone.current &&
      dist2(x, z, WORLD.southGate[0], WORLD.southGate[2]) < 12
    ) {
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
      opts?: { label?: string; sub?: string },
    ) => {
      if (!e?.interact || !passesCeiling(e, ceil)) return;
      consider({
        label: opts?.label ?? e.interact.label,
        sub: opts?.sub ?? "Press E",
        dist: dist2(x, z, e.x, e.z),
        radius: e.interact.radius,
        action,
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
    }

    for (const c of CACHES) {
      if (store.cachesLooted.includes(c.id)) continue;
      considerEntity(c, () => {
        store.lootCache(c.id);
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

    if (best) {
      const b: Cand = best;
      store.setInteract({ label: b.label, sub: b.sub, dist: b.dist });
      pendingAction.current = b.dist < b.radius ? b.action : null;
    } else {
      store.setInteract(null);
      pendingAction.current = null;
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
          store.markScanned(nearest.id);
          if (nearest.codexId) store.unlockCodex(nearest.codexId);
          const revealed = SCAN_REVEALS[nearest.id];
          if (revealed) store.revealObjective(revealed);
          store.pushMessage(`SCAN COMPLETE — ${nearest.title}`);
          getAudio().pulseInteract();
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
