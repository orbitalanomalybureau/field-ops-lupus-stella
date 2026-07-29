import { createFileRoute } from "@tanstack/react-router";
import { FieldOpsApp } from "@/components/game/FieldOpsApp";

export const Route = createFileRoute("/embed")({
  component: EmbedPage,
  head: () => ({
    meta: [
      {
        title: "Field Ops Embed — 2121 EXODUS",
      },
      {
        name: "description",
        content:
          "Embeddable Classified Terminal field survey of Lupus Stella for exodus2121.com",
      },
    ],
  }),
});

/**
 * Minimal chrome for iframe on the novel site:
 * https://exodus2121.com/ — Classified Terminal panel
 *
 * Parent can:
 *   iframe.src = "https://<host>/embed"
 *   postMessage({ type: "fieldops:pause" | "fieldops:reset" })
 * Listens for:
 *   { type: "fieldops:ready" }, { type: "fieldops:phase", phase }
 */
function EmbedPage() {
  return (
    <div className="h-dvh w-full bg-void">
      <FieldOpsApp embed skipBoot />
    </div>
  );
}
