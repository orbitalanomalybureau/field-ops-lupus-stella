/**
 * The single input surface: keyboard, touch, and gamepad in, one snapshot out.
 *
 * Input used to reach the controller through three untyped window globals
 * (`__touchInput`, `__keyE`, `__combatMul`) written and read in different
 * components. That made rebinding, gamepad support, and any kind of input
 * replay impossible, and it silently broke whenever a file moved.
 *
 * Everything that produces input writes here; PlayerController and
 * InteractionSystem read `snapshot()` once per frame. Nothing else touches
 * `window`.
 */

export type Action =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "sprint"
  | "jump"
  | "scan"
  | "interact"
  | "combat"
  | "journal"
  | "photo"
  | "settings"
  | "map"
  | "codex"
  | "objectives"
  | "pause";

/** Actions that fire once per press rather than while held. */
const EDGE_ACTIONS: ReadonlySet<Action> = new Set([
  "interact",
  "jump",
  "combat",
  "journal",
  "photo",
  "settings",
  "map",
  "codex",
  "objectives",
  "pause",
]);

export type Keymap = Record<Action, string[]>;

/** KeyboardEvent.code values. Defaults match what the game has always used. */
export const DEFAULT_KEYMAP: Keymap = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  scan: ["KeyQ", "KeyV"],
  interact: ["KeyE"],
  combat: ["KeyF"],
  journal: ["KeyJ"],
  photo: ["KeyP"],
  settings: ["KeyK"],
  map: ["KeyM"],
  codex: ["KeyC"],
  objectives: ["KeyO", "Tab"],
  pause: ["Escape"],
};

export type InputSnapshot = {
  /** Strafe, -1 left to 1 right. */
  moveX: number;
  /** Forward/back, -1 back to 1 forward. */
  moveZ: number;
  /** Yaw/pitch delta in radians accumulated since the last snapshot. */
  lookX: number;
  lookY: number;
  sprint: boolean;
  scan: boolean;
  /** Edge-triggered: true for exactly one snapshot per press. */
  jump: boolean;
  combat: boolean;
  /** What produced the most recent input, for prompt glyphs. */
  device: Device;
};

export type Device = "keyboard" | "touch" | "gamepad";

type TouchState = {
  moveX: number;
  moveZ: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  scan: boolean;
};

const held = new Set<string>();
const edgePending = new Set<Action>();
let keymap: Keymap = structuredCloneMap(DEFAULT_KEYMAP);
let lookX = 0;
let lookY = 0;
let device: Device = "keyboard";
let sensitivity = 1;
let invertY = false;
let padIndex: number | null = null;

const touch: TouchState = {
  moveX: 0,
  moveZ: 0,
  lookX: 0,
  lookY: 0,
  sprint: false,
  scan: false,
};

function structuredCloneMap(map: Keymap): Keymap {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, [...v]]),
  ) as Keymap;
}

function actionsFor(code: string): Action[] {
  return (Object.keys(keymap) as Action[]).filter((a) =>
    keymap[a].includes(code),
  );
}

export function isHeld(action: Action): boolean {
  return keymap[action].some((code) => held.has(code));
}

/** True once per press. Reading clears it. */
export function consumeEdge(action: Action): boolean {
  if (!edgePending.has(action)) return false;
  edgePending.delete(action);
  return true;
}

export function setKeymap(next: Partial<Keymap>): void {
  keymap = { ...keymap, ...structuredCloneMap(next as Keymap) };
}

export function getKeymap(): Keymap {
  return structuredCloneMap(keymap);
}

export function resetKeymap(): void {
  keymap = structuredCloneMap(DEFAULT_KEYMAP);
}

export function setLookSensitivity(v: number): void {
  sensitivity = Math.max(0.2, Math.min(3, v));
}

export function setInvertY(v: boolean): void {
  invertY = v;
}

export function lastDevice(): Device {
  return device;
}

/** Called by the touch controls each pointer move. */
export function setTouchMove(x: number, z: number): void {
  touch.moveX = x;
  touch.moveZ = z;
  if (x !== 0 || z !== 0) device = "touch";
}

/** Drag-to-look deltas in pixels; converted to radians here. */
export function addTouchLook(dx: number, dy: number): void {
  touch.lookX += dx;
  touch.lookY += dy;
  device = "touch";
}

export function setTouchButton(
  button: "sprint" | "scan",
  down: boolean,
): void {
  touch[button] = down;
  device = "touch";
}

export function pressAction(action: Action): void {
  device = "touch";
  if (EDGE_ACTIONS.has(action)) edgePending.add(action);
}

/**
 * Mouse look. Kept separate from touch so sensitivity can differ per device
 * without the controller knowing which is active.
 */
export function addMouseLook(dx: number, dy: number): void {
  lookX += dx * 0.002 * sensitivity;
  lookY += dy * 0.0017 * sensitivity * (invertY ? -1 : 1);
  device = "keyboard";
}

function pollGamepad(): { moveX: number; moveZ: number } | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  const pad =
    (padIndex !== null ? pads[padIndex] : null) ??
    pads.find((p) => p?.connected) ??
    null;
  if (!pad) return null;
  padIndex = pad.index;

  const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
  const lx = dead(pad.axes[0] ?? 0);
  const ly = dead(pad.axes[1] ?? 0);
  const rx = dead(pad.axes[2] ?? 0);
  const ry = dead(pad.axes[3] ?? 0);

  if (lx || ly || rx || ry) device = "gamepad";
  lookX += rx * 0.045 * sensitivity;
  lookY += ry * 0.035 * sensitivity * (invertY ? -1 : 1);

  // A / X / RB in the standard mapping.
  if (pad.buttons[0]?.pressed) edgePending.add("jump");
  if (pad.buttons[2]?.pressed) edgePending.add("interact");
  if (pad.buttons[5]?.pressed) edgePending.add("combat");
  if (pad.buttons[9]?.pressed) edgePending.add("pause");

  return { moveX: lx, moveZ: -ly };
}

/**
 * Read and clear the frame's accumulated input. Call exactly once per frame,
 * from PlayerController — look deltas are consumed, so a second caller would
 * silently steal them.
 *
 * Deliberately does NOT include `interact`. InteractionSystem owns that edge
 * and reads it with consumeEdge("interact"); PlayerController runs first in
 * the frame, so returning it here consumed the press before the interaction
 * system ever saw it and E did nothing at all. An edge has exactly one owner.
 */
export function snapshot(): InputSnapshot {
  const pad = pollGamepad();

  let moveX = 0;
  let moveZ = 0;
  if (isHeld("right")) moveX += 1;
  if (isHeld("left")) moveX -= 1;
  if (isHeld("forward")) moveZ += 1;
  if (isHeld("back")) moveZ -= 1;

  moveX += touch.moveX + (pad?.moveX ?? 0);
  moveZ += touch.moveZ + (pad?.moveZ ?? 0);

  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }

  const outLookX = lookX + touch.lookX * 0.0032 * sensitivity;
  const outLookY =
    lookY + touch.lookY * 0.0028 * sensitivity * (invertY ? -1 : 1);
  lookX = 0;
  lookY = 0;
  touch.lookX = 0;
  touch.lookY = 0;

  return {
    moveX,
    moveZ,
    lookX: outLookX,
    lookY: outLookY,
    sprint: isHeld("sprint") || touch.sprint,
    scan: isHeld("scan") || touch.scan,
    jump: consumeEdge("jump"),
    combat: consumeEdge("combat"),
    device,
  };
}

/** Drop all held state — used on blur, pause, and pointer-lock loss. */
export function clearHeld(): void {
  held.clear();
  edgePending.clear();
  touch.moveX = 0;
  touch.moveZ = 0;
  touch.lookX = 0;
  touch.lookY = 0;
  touch.sprint = false;
  touch.scan = false;
}

/** Attach the window listeners. Returns a cleanup function. */
export function attachKeyboard(): () => void {
  if (typeof window === "undefined") return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    const actions = actionsFor(e.code);
    if (!actions.length) return;
    device = "keyboard";
    // Tab and Space would otherwise scroll or move focus out of the canvas.
    if (e.code === "Tab" || e.code === "Space") e.preventDefault();
    if (!held.has(e.code)) {
      for (const a of actions) if (EDGE_ACTIONS.has(a)) edgePending.add(a);
    }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearHeld);
  document.addEventListener("visibilitychange", clearHeld);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearHeld);
    document.removeEventListener("visibilitychange", clearHeld);
  };
}

/** Test seam: force a set of held key codes. */
export function debugSetKeys(codes: string[]): void {
  held.clear();
  for (const c of codes) held.add(c);
}
