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
  | "attack"
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
  "attack",
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
  // KeyR is the free key nearest WASD; mouse button 0 maps to the same edge
  // in attachKeyboard, and gamepad RT in pollGamepad.
  attack: ["KeyR"],
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

/**
 * Touch-first hardware must get TAP prompts from the very first hint, not
 * after the first touch flips `device`. `pointer: coarse` describes the
 * PRIMARY pointer, so a touch-capable laptop still opens with keyboard
 * glyphs; maxTouchPoints only breaks the tie where matchMedia is missing.
 */
function initialDevice(): Device {
  if (typeof window === "undefined") return "keyboard";
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: coarse)").matches
      ? "touch"
      : "keyboard";
  }
  return navigator.maxTouchPoints > 0 ? "touch" : "keyboard";
}

const held = new Set<string>();
const edgePending = new Set<Action>();
let keymap: Keymap = structuredCloneMap(DEFAULT_KEYMAP);
let lookX = 0;
let lookY = 0;
let device: Device = initialDevice();
let sensitivity = 1;
let invertY = false;
let padIndex: number | null = null;
let padAttackWas = false;

/* --------------------------------- aim ---------------------------------- */
// Aim is a held POSTURE, not an edge, and deliberately not a snapshot field:
// snapshot() is consumed exactly once per frame by PlayerController, while
// Creatures and the HUD also need to know the aim state. A non-consuming
// query has no ownership problem; an edge or snapshot field would.

/** RMB held — only ever set while pointer lock was held at press time. */
let mouseAim = false;
/** Gamepad LT (buttons[6]) held, refreshed by pollGamepad each snapshot. */
let padAim = false;
/** Touch TOGGLE, owned by MobileControls via setTouchAim. */
let touchAim = false;
/** Aim-assist friction — Creatures flips it near a live predator. */
let aimFrictionOn = false;
const AIM_FRICTION = 0.55;

function lookScale(): number {
  return aimFrictionOn ? AIM_FRICTION : 1;
}

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

/**
 * Does this physical key currently map to this action? The one lookup UI
 * keydown handlers are allowed to use — HUD panel toggles and the app-shell
 * hotkeys route through here so rebinds in Settings apply everywhere, not
 * just to the actions PlayerController reads.
 */
export function matchesAction(code: string, action: Action): boolean {
  return keymap[action].includes(code);
}

/** "KeyE" → "E". The prompt follows a rebind instead of lying about it. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "SPC";
  return code.toUpperCase();
}

/**
 * Resolve binding tokens in authored copy ({scan} — data.ts objective text)
 * to the live binding: the touch button's glyph on coarse-pointer devices,
 * the bound key otherwise. The HUD calls this at render so rebinds stay
 * honest; the store calls it when detail text is frozen into a journal entry,
 * where the binding at time of writing is the only one the entry can name.
 */
export function bindingTokenText(text: string): string {
  if (!text.includes("{scan}")) return text;
  const key = device === "touch" ? "SCN" : keyLabel(keymap.scan[0] ?? "KeyQ");
  return text.replaceAll("{scan}", key);
}

/** True once per press. Reading clears it. */
export function consumeEdge(action: Action): boolean {
  if (!edgePending.has(action)) return false;
  edgePending.delete(action);
  return true;
}

/**
 * Drop queued one-shot presses without touching held keys or look state.
 * Called on phase transitions out of gameplay: an E pressed while a dialogue
 * or pause menu is open must not survive in edgePending and replay on the
 * first playing frame — that made Close look broken (the dialogue reopened
 * itself) and auto-opened NPCs after Resume.
 */
export function clearEdges(): void {
  edgePending.clear();
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
 * True while the operative is holding the aim posture: RMB under pointer
 * lock, gamepad LT, or the touch aim toggle. Non-consuming — callable from
 * anywhere, any number of times per frame.
 *
 * The pointer-lock check lives here rather than only at press time so a lost
 * lock (Escape, overlay, alt-tab) drops mouse aim the same frame instead of
 * leaving the rifle raised with no way to lower it.
 */
export function aimActive(): boolean {
  const lockHeld =
    typeof document !== "undefined" && document.pointerLockElement !== null;
  return (mouseAim && lockHeld) || padAim || touchAim;
}

/**
 * Aim-assist friction. Creatures calls this with "reticle within ~6 degrees
 * of a live predator"; while active, all look input runs at 55% sensitivity
 * so sticks and thumbs can settle on the target.
 */
export function setAimFriction(active: boolean): void {
  aimFrictionOn = active;
}

/**
 * Touch aim is a TOGGLE, not a hold — a thumb cannot hold aim and drag to
 * look at once. MobileControls owns the button and its visual state; it
 * survives clearHeld() because the player set it deliberately and blur/pause
 * must not silently desync the module from the button.
 */
export function setTouchAim(on: boolean): void {
  touchAim = on;
  device = "touch";
}

/**
 * Mouse look. Kept separate from touch so sensitivity can differ per device
 * without the controller knowing which is active.
 */
export function addMouseLook(dx: number, dy: number): void {
  lookX += dx * 0.002 * sensitivity * lookScale();
  lookY += dy * 0.0017 * sensitivity * (invertY ? -1 : 1) * lookScale();
  device = "keyboard";
}

function pollGamepad(): { moveX: number; moveZ: number } | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) {
    padAim = false;
    return null;
  }
  const pads = navigator.getGamepads();
  const pad =
    (padIndex !== null ? pads[padIndex] : null) ??
    pads.find((p) => p?.connected) ??
    null;
  if (!pad) {
    // A disconnected pad must not leave the rifle raised forever.
    padAim = false;
    return null;
  }
  padIndex = pad.index;

  const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
  const lx = dead(pad.axes[0] ?? 0);
  const ly = dead(pad.axes[1] ?? 0);
  const rx = dead(pad.axes[2] ?? 0);
  const ry = dead(pad.axes[3] ?? 0);

  if (lx || ly || rx || ry) device = "gamepad";
  lookX += rx * 0.045 * sensitivity * lookScale();
  lookY += ry * 0.035 * sensitivity * (invertY ? -1 : 1) * lookScale();

  // LT (button 6) is the aim hold — a held state, not an edge.
  padAim = pad.buttons[6]?.pressed ?? false;

  // A / X / RB in the standard mapping.
  if (pad.buttons[0]?.pressed) edgePending.add("jump");
  if (pad.buttons[2]?.pressed) edgePending.add("interact");
  if (pad.buttons[5]?.pressed) edgePending.add("combat");
  if (pad.buttons[9]?.pressed) edgePending.add("pause");
  // RT (button 7), tracked as a real edge: a held trigger must not
  // machine-gun a swing per poll the way the repeat on the buttons above
  // would; one pull is one attack.
  const rt = pad.buttons[7]?.pressed ?? false;
  if (rt && !padAttackWas) edgePending.add("attack");
  padAttackWas = rt;

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
 * `attack` is excluded for the same reason: Creatures.tsx owns it.
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

  // Touch look converts at consumption time, so friction applies here; the
  // mouse/gamepad paths already applied it when they accumulated.
  const outLookX = lookX + touch.lookX * 0.0032 * sensitivity * lookScale();
  const outLookY =
    lookY +
    touch.lookY * 0.0028 * sensitivity * (invertY ? -1 : 1) * lookScale();
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
  // Held aim drops with everything else; the touch aim TOGGLE deliberately
  // does not — MobileControls owns that button's state (see setTouchAim).
  mouseAim = false;
  padAim = false;
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

  // Mouse combat buttons. Wired here rather than through a second attach
  // function so PlayerController stays the input module's only mount point.
  // Both only while pointer lock is held — an unlocked click is UI, or the
  // very click that acquires the lock, never a swing or a shoulder-raise.
  // Button 0 is the attack edge (Creatures.tsx is its sole consumer);
  // button 2 is the aim HOLD, released on pointerup or lock loss.
  const onPointerDown = (e: PointerEvent) => {
    if (!document.pointerLockElement) return;
    if (e.button === 0) {
      device = "keyboard";
      edgePending.add("attack");
    } else if (e.button === 2) {
      device = "keyboard";
      mouseAim = true;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 2) mouseAim = false;
  };
  // Right mouse is the aim hold; the browser menu would steal the button
  // mid-fight. Unlocked right-clicks stay ordinary UI.
  const onContextMenu = (e: MouseEvent) => {
    if (document.pointerLockElement || mouseAim) e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", clearHeld);
  document.addEventListener("visibilitychange", clearHeld);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("blur", clearHeld);
    document.removeEventListener("visibilitychange", clearHeld);
  };
}

/** Test seam: force a set of held key codes. */
export function debugSetKeys(codes: string[]): void {
  held.clear();
  for (const c of codes) held.add(c);
}
