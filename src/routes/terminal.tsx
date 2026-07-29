import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/terminal")({
  component: TerminalShell,
  head: () => ({
    meta: [{ title: "Classified Terminal — 2121 EXODUS" }],
  }),
});

/**
 * Mock of the novel site Classified Terminal that hosts Field Ops in a frame.
 * Use this as the integration reference for exodus2121.com.
 */
function TerminalShell() {
  const [phase, setPhase] = useState("idle");
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    const lines = [
      "ODYSSEY COMMAND DATABASE · CLEARANCE SIGMA",
      "Linking classified archive…",
      "SIM-012 Field Ops: Lupus Stella — ONLINE",
      "Embed channel ready.",
    ];
    let i = 0;
    const t = window.setInterval(() => {
      if (i >= lines.length) {
        window.clearInterval(t);
        return;
      }
      setBootLines((prev) => [...prev, lines[i]!]);
      i++;
    }, 280);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      const msg = e.data as { type?: string; phase?: string };
      if (msg.type === "fieldops:ready") setPhase("ready");
      if (msg.type === "fieldops:phase" && msg.phase) setPhase(msg.phase);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-void text-fg">
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-accent">
              CLASSIFIED TERMINAL
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              2121: EXODUS · Odyssey archive
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${phase === "ready" || phase === "playing" ? "bg-accent" : "bg-warn"}`}
            />
            CH {phase.toUpperCase()}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <section className="panel-glass rounded-lg p-4 font-mono text-xs leading-relaxed text-muted">
          {bootLines.map((l) => (
            <p key={l} className="text-accent/90">
              › {l}
            </p>
          ))}
          <p className="mt-3 text-dim">
            Field Ops is the open-world survey layer for Book I / early Book II.
            Embed path:{" "}
            <code className="text-fg">/embed</code> · Full session:{" "}
            <Link to="/" className="text-accent underline-offset-2 hover:underline">
              /
            </Link>
          </p>
        </section>

        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLaunched(true)}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-fg hover:bg-primary-glow"
          >
            Launch SIM-012 Field Ops
          </button>
          <a
            href="/embed"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-fg"
          >
            Open embed alone
          </a>
        </section>

        {launched && (
          <div className="panel-glass overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[10px] text-dim">
              <span>IFRAME · /embed · postMessage bridge active</span>
              <button
                type="button"
                className="text-muted hover:text-fg"
                onClick={() => {
                  const frame = document.getElementById(
                    "fieldops-frame",
                  ) as HTMLIFrameElement | null;
                  frame?.contentWindow?.postMessage(
                    { type: "fieldops:pause" },
                    "*",
                  );
                }}
              >
                SEND PAUSE
              </button>
            </div>
            <iframe
              id="fieldops-frame"
              title="Field Ops Lupus Stella"
              src="/embed"
              className="h-[min(70vh,720px)] w-full border-0 bg-void"
              allow="fullscreen; autoplay; pointer-lock"
            />
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            {
              t: "Book I path",
              d: "New Eden · ferns · ruins · REMEMBER",
            },
            {
              t: "Ridge-7",
              d: "West basalt expedition · beacon plant",
            },
            {
              t: "Staff logs",
              d: "Thornhill · Castillo · Voss · Berger",
            },
          ].map((c) => (
            <div key={c.t} className="panel-glass rounded-md p-4">
              <p className="font-mono text-[10px] tracking-widest text-accent">
                {c.t}
              </p>
              <p className="mt-2 text-sm text-muted">{c.d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-4 py-3 text-center font-mono text-[10px] text-dim">
        Integration reference for exodus2121.com Classified Terminal · not a
        clone of third-party UI chrome
      </footer>
    </div>
  );
}
