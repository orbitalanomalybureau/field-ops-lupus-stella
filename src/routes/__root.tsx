import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { RouteErrorFault } from "@/components/ui/WorldErrorBoundary";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";

export const Route = createRootRoute({
  errorComponent: ({ error }) => <RouteErrorFault error={error} />,
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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      // Non-blocking webfont load: the terminal UI paints immediately on the
      // system mono/sans fallbacks declared in styles.css, then upgrades.
      // TODO(offline): self-host these as woff2 under public/fonts to drop the
      // last third-party runtime request — see DEPLOY.md § Fonts.
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icons/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
    ],
  }),
  component: RootDocument,
});

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
        <link
          rel="stylesheet"
          href={FONT_HREF}
          media="print"
          // Flip to `all` once loaded so the font never blocks first paint.
          onLoad={(e) => {
            (e.currentTarget as HTMLLinkElement).media = "all";
          }}
        />
        <noscript>
          <link rel="stylesheet" href={FONT_HREF} />
        </noscript>
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
