import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { NPCS, SCAN_TARGETS, WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import { getAudio } from "@/game/audio";
import type { ObjectiveId } from "@/game/types";

/** Scan targets that unlock a quest node. Parallel to SCAN_TARGETS.codexId. */
const SCAN_REVEALS: Record<string, ObjectiveId> = {
  "scan-grid": "ruins",
};

function dist2(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

type Cand = {
  label: string;
  sub?: string;
  dist: number;
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

    if (!perimeterDone.current && dist2(x, z, 0, 42) < 12) {
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
      if (c.dist > 7) return;
      if (!best || c.dist < best.dist) best = c;
    };

    for (const n of NPCS) {
      if (n.book2 && ceil === "book1") continue;
      consider({
        label: `Talk — ${n.name}`,
        sub: n.role,
        dist: dist2(x, z, n.x, n.z),
        action: () => store.openDialogue(n.id),
      });
    }

    // Dome enter/exit
    if (store.insideDome) {
      consider({
        label: "Exit command dome",
        sub: "Press E",
        dist: dist2(x, z, 0, 6),
        action: () => store.exitDome(),
      });
    } else {
      consider({
        label: "Enter command dome",
        sub: "Ops floor",
        dist: dist2(x, z, 0, 8),
        action: () => store.enterDome(),
      });
    }

    const ruinD = dist2(x, z, WORLD.ruinPos[0], WORLD.ruinPos[2]);
    if (!store.ruinOpened) {
      // openRuin() refuses the sealed chamber; the prompt must say so first.
      const sealed = !store.isObjectiveAvailable("ruins");
      const atDoor = ruinD < 7;
      consider({
        label: sealed ? "Inspect chamber seal" : "Enter chamber",
        sub: sealed ? "Alloy inert — seal holds" : atDoor ? "Press E" : "Approach",
        dist: ruinD,
        action: () => store.openRuin(),
      });
    }

    const caches: [string, number, number, boolean?][] = [
      ["cache-a", -22, 88],
      ["cache-b", 28, 118],
      ["cache-r", -95, 40],
      ["cache-c", 35, 195, true],
    ];
    for (const [id, px, pz, book2] of caches) {
      if (book2 && ceil === "book1") continue;
      if (store.cachesLooted.includes(id)) continue;
      consider({
        label: "Recover cache",
        sub: "Press E",
        dist: dist2(x, z, px, pz),
        action: () => {
          store.lootCache(id);
          getAudio().pulseInteract();
        },
      });
    }

    if (!store.ridgeBeaconPlanted) {
      consider({
        label: "Plant Ridge-7 beacon",
        sub: "Press E",
        dist: dist2(x, z, WORLD.ridgeOverlook[0], WORLD.ridgeOverlook[2]),
        action: () => {
          store.plantRidgeBeacon();
          getAudio().pulseInteract();
        },
      });
    }

    if (ceil !== "book1" && !store.kaguyahimeLogged) {
      consider({
        label: "Log Kaguyahime memorial",
        sub: "Far-continent vector",
        dist: dist2(x, z, WORLD.coastMemorial[0], WORLD.coastMemorial[2]),
        action: () => {
          store.logKaguyahime();
          getAudio().pulseInteract();
        },
      });
    }

    if (!store.codex.find((c) => c.id === "collars")?.unlocked) {
      consider({
        label: "Inspect collar",
        sub: "Press E or scan",
        dist: dist2(x, z, -22, 12),
        action: () => store.unlockCodex("collars"),
      });
    }

    if (best) {
      const b: Cand = best;
      store.setInteract({ label: b.label, sub: b.sub, dist: b.dist });
      pendingAction.current = b.dist < 7 ? b.action : null;
    } else {
      store.setInteract(null);
      pendingAction.current = null;
    }

    if (checkKeyE() || checkTouchInteract()) {
      pendingAction.current?.();
    }

    if (store.scannerActive) {
      let nearest: (typeof SCAN_TARGETS)[0] | null = null;
      let nd = 999;
      for (const t of SCAN_TARGETS) {
        if (t.book2 && ceil === "book1") continue;
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

function checkKeyE() {
  const w = window as unknown as { __keyE?: boolean };
  if (w.__keyE) {
    w.__keyE = false;
    return true;
  }
  return false;
}

function checkTouchInteract() {
  const t = (window as unknown as { __touchInput?: { interact: boolean } })
    .__touchInput;
  if (t?.interact) {
    t.interact = false;
    return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyE") {
      (window as unknown as { __keyE: boolean }).__keyE = true;
    }
  });
}
