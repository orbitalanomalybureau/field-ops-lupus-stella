/**
 * Live NPC positions, written every frame by the schedule system in NPCs.tsx.
 * Read-only for consumers (map pins, future prompt work). A mutable module
 * rather than store state — this changes at simulation cadence and nothing
 * should re-render for it.
 *
 * InteractionSystem still picks the talk prompt from the registry anchor with
 * its 7 m radius, so every scheduled station stays within ~6 m of its NPC's
 * anchor — the walking figure never leaves its own prompt circle. Storm
 * sheltering is the sanctioned exception: everyone breaks radius to muster at
 * the command-dome hatch, and the prompt keys off the empty anchor until the
 * front passes.
 */
export const npcPositions = new Map<string, { x: number; z: number }>();
