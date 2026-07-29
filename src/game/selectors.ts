import type {
  CodexEntry,
  Objective,
  ObjectiveId,
  SpoilerCeiling,
} from "./types";

/**
 * Pure content-visibility rules, shared by the store and by any component that
 * renders objectives.
 *
 * Two independent gates decide whether the player may see something:
 *
 *   spoiler ceiling — how far into the series the reader has got
 *   quest graph     — how much this operative has figured out in the field
 *
 * They are easy to apply inconsistently. The objectives panel used to filter on
 * the ceiling alone, which listed the ruin and the chamber in the log from the
 * first second — exactly the "walk south and win" leak the graph exists to
 * close. Anything rendering objectives goes through here.
 */

export function passesCeiling<T extends { book2?: boolean }>(
  item: T,
  ceiling: SpoilerCeiling,
): boolean {
  return !item.book2 || ceiling !== "book1";
}

/** Listed in the log: known to the operative, or already completed. */
export function isObjectiveVisible(
  objective: Objective,
  revealed: readonly ObjectiveId[],
  ceiling: SpoilerCeiling,
): boolean {
  if (!passesCeiling(objective, ceiling)) return false;
  return (
    !objective.hidden || objective.done || revealed.includes(objective.id)
  );
}

/** Actionable now: visible, and every prerequisite already done. */
export function isObjectiveActionable(
  objective: Objective,
  all: readonly Objective[],
  revealed: readonly ObjectiveId[],
  ceiling: SpoilerCeiling,
): boolean {
  if (!isObjectiveVisible(objective, revealed, ceiling)) return false;
  return (objective.requires ?? []).every((id) =>
    all.some((o) => o.id === id && o.done),
  );
}

export function visibleObjectivesOf(
  objectives: readonly Objective[],
  revealed: readonly ObjectiveId[],
  ceiling: SpoilerCeiling,
): Objective[] {
  return objectives.filter((o) => isObjectiveVisible(o, revealed, ceiling));
}

export function visibleCodexOf(
  codex: readonly CodexEntry[],
  ceiling: SpoilerCeiling,
): CodexEntry[] {
  return codex.filter((c) => passesCeiling(c, ceiling));
}
