import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { RouteErrorFault } from "@/components/ui/WorldErrorBoundary";

export const Route = createRootRoute({
  errorComponent: ({ error }) => <RouteErrorFault error={error} />,
  notFoundComponent: SectorUncharted,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
      {
        title: "Field Ops: Lupus Stella — 2121 EXODUS",
      },
      {
        name: "description",
        content:
          "Classified field survey of Lupus Stella. Open-world recon from the Odyssey command database.",
      },
      { name: "theme-color", content: "#0a0c12" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Fonts are self-hosted (@font-face in styles.css) — zero third-party
      // runtime requests, which is what makes the PWA genuinely offline.
      {
        rel: "preload",
        href: "/fonts/plex-mono-400.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icons/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
    ],
  }),
  component: RootDocument,
});

/**
 * Root notFoundComponent — an unknown path lands on the same diegetic surface
 * as route errors (SurveyMeshFault) and connectivity loss (CARRIER LOST)
 * instead of the framework's raw "Not Found".
 */
function SectorUncharted() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-5 bg-void px-6 text-center font-mono text-fg">
      <p className="text-[10px] tracking-[0.3em] text-warn">
        ODYSSEY COMMAND // NAV QUERY
      </p>
      <p className="text-lg tracking-widest">SECTOR UNCHARTED</p>
      <p className="max-w-md text-xs leading-relaxed text-muted">
        No survey data exists at this address. The coordinates were never
        mapped, or the route was decommissioned after the last sweep.
      </p>
      <Link
        to="/"
        className="min-h-11 rounded border border-accent/60 px-5 py-2 text-xs tracking-widest text-accent transition-colors hover:border-accent hover:bg-accent/10"
      >
        RETURN TO COMMAND
      </Link>
    </div>
  );
}

function RootDocument() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline optional */
      });
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
