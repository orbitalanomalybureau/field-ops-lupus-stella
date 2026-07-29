import { createFileRoute } from "@tanstack/react-router";
import { FieldOpsApp } from "@/components/game/FieldOpsApp";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <FieldOpsApp />;
}
