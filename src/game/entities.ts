/**
 * Every placed thing in the world, in one table.
 *
 * Coordinates used to live wherever the mesh happened to be drawn, so a cache
 * existed three times over — renderer, interaction pick, map marker — and a
 * dome twice, shell and collider. Adding one site meant synchronised edits with
 * matching magic numbers in three files, and a missed edit drifted silently.
 *
 * This table is x/z only. Ground height always comes from sampleHeight(x, z);
 * nothing here carries a y.
 */

export type Collider = { x: number; z: number; radius: number; height?: number };

export type WorldEntity = {
  id: string;
  x: number;
  z: number;
  kind: "dome" | "generator" | "tower" | "cache" | "npc" | "beacon" | "prop" | "ruin" | "memorial";
  collider?: Collider;
  interact?: { label: string; radius: number };
  book2?: boolean;
};

/** Push-out radius of a prefab shell. */
const DOME_SHELL = 4.5;

/** Hand-interaction range. Every prompt in the game picks at the same distance. */
const PICK_RADIUS = 7;

/**
 * Prefab shells are the only geometry the controller has ever pushed the player
 * out of, so they are the only rows carrying a collider — see colliders().
 */
function dome(id: string, x: number, z: number): WorldEntity {
  return { id, x, z, kind: "dome", collider: { x, z, radius: DOME_SHELL } };
}

function cache(id: string, x: number, z: number, book2?: boolean): WorldEntity {
  return {
    id,
    x,
    z,
    kind: "cache",
    interact: { label: "Recover cache", radius: PICK_RADIUS },
    book2,
  };
}

/** Names, roles, and dialogue trees stay in data.ts; this row is the position. */
function npc(id: string, x: number, z: number, book2?: boolean): WorldEntity {
  return { id, x, z, kind: "npc", interact: { label: "Talk", radius: PICK_RADIUS }, book2 };
}

export const ENTITIES: WorldEntity[] = [
  dome("dome-command", 0, 6),
  dome("dome-west", -14, 2),
  dome("dome-east", 14, 4),
  dome("dome-south-west", -8, 18),
  dome("dome-south-east", 10, 16),

  // The hatch prompt is picked from the apron south of the command shell, not
  // from the shell itself: anchoring it on the dome would shorten the approach.
  {
    id: "dome-entry",
    x: 0,
    z: 8,
    kind: "prop",
    interact: { label: "Enter command dome", radius: PICK_RADIUS },
  },

  {
    id: "gen-west",
    x: -22,
    z: 12,
    kind: "generator",
    interact: { label: "Inspect collar", radius: PICK_RADIUS },
  },
  { id: "gen-east", x: 22, z: 10, kind: "generator" },
  { id: "gen-north-west", x: -12, z: -8, kind: "generator" },
  { id: "gen-north-east", x: 16, z: -6, kind: "generator" },

  { id: "tower-south-west", x: -35, z: 35, kind: "tower" },
  { id: "tower-south-east", x: 35, z: 35, kind: "tower" },
  { id: "tower-gate", x: 0, z: 42, kind: "tower" },
  { id: "tower-north-west", x: -28, z: -5, kind: "tower" },
  { id: "tower-north-east", x: 28, z: -5, kind: "tower" },

  cache("cache-a", -22, 88),
  cache("cache-b", 28, 118),
  cache("cache-r", -95, 40),
  cache("cache-c", 35, 195, true),

  npc("thornhill", -18, 14),
  npc("castillo", 8, 24),
  npc("voss", 16, 10),
  npc("berger", -6, 32),
  npc("tomas", 4, 18, true),

  {
    id: "ridge-beacon",
    x: -118,
    z: 62,
    kind: "beacon",
    interact: { label: "Plant Ridge-7 beacon", radius: PICK_RADIUS },
  },
  {
    id: "coast-memorial",
    x: 22,
    z: 200,
    kind: "memorial",
    interact: { label: "Log Kaguyahime memorial", radius: PICK_RADIUS },
    book2: true,
  },
  {
    id: "carver-marker",
    x: 6,
    z: 38,
    kind: "memorial",
    interact: { label: "Read Carver's marker", radius: PICK_RADIUS },
  },

  // Berger's salvage: a hull plate off the Verne, seven metres from his anchor
  // at (-6, 32) — on the flat pad, clear of the storage box at (4, 22), the
  // crate row along z 12–14, and the south-west dome shell.
  {
    id: "verne-plate",
    x: -12,
    z: 36,
    kind: "memorial",
    interact: { label: "Inspect Verne hull plate", radius: PICK_RADIUS },
  },

  // Hale's cold camp on the Ridge-7 flank, below the beacon overlook. Measured
  // slopeAt(-101, 57) = 0.37 — comfortably under SLIDE_SLOPE, so the site is
  // standable ground the player can read, not a slide trap.
  {
    id: "hale-camp",
    x: -101,
    z: 57,
    kind: "memorial",
    interact: { label: "Search Hale camp", radius: PICK_RADIUS },
  },
  {
    id: "ruin",
    x: 18,
    z: 155,
    kind: "ruin",
    interact: { label: "Enter chamber", radius: PICK_RADIUS },
  },
];

/**
 * Every collider in the world. Only the dome shells carry one today — the
 * controller has never pushed the player out of anything else, so handing a
 * radius to towers or generators here changes how the colony walks.
 */
export function colliders(): Collider[] {
  return ENTITIES.flatMap((e) => (e.collider ? [e.collider] : []));
}

export function entitiesOfKind(kind: WorldEntity["kind"]): WorldEntity[] {
  return ENTITIES.filter((e) => e.kind === kind);
}
