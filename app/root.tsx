import type { LinksFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

export const links: LinksFunction = () => {
  return [];
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{localStorage.setItem('ghs-theme','dark');document.documentElement.dataset.ghsTheme='dark';}catch(e){document.documentElement.dataset.ghsTheme='dark';}",
          }}
        />
        <style>
          {`
            :root {
              color-scheme: dark;
              --ghs-theme-toggle-bg: #020617;
              --ghs-theme-toggle-border: #334155;
              --ghs-theme-toggle-text: #f8fafc;
              --ghs-page-bg: #020617;
              --ghs-panel-bg: #0f172a;
              --ghs-panel-soft: #111827;
              --ghs-panel-muted: #0b1220;
              --ghs-nav-bg: #020617;
              --ghs-border: #334155;
              --ghs-text: #f8fafc;
              --ghs-muted: #94a3b8;
              --ghs-subtle: #cbd5e1;
              --ghs-accent: #38bdf8;
              --ghs-orange: #fb923c;
            }

            html[data-ghs-theme="dark"] {
              color-scheme: dark;
              --ghs-theme-toggle-bg: #020617;
              --ghs-theme-toggle-border: #334155;
              --ghs-theme-toggle-text: #f8fafc;
              --ghs-page-bg: #020617;
              --ghs-panel-bg: #0f172a;
              --ghs-panel-soft: #111827;
              --ghs-panel-muted: #0b1220;
              --ghs-nav-bg: #020617;
              --ghs-border: #334155;
              --ghs-text: #f8fafc;
              --ghs-muted: #94a3b8;
              --ghs-subtle: #cbd5e1;
              --ghs-accent: #38bdf8;
              --ghs-orange: #fb923c;
            }

            html[data-ghs-theme="dark"] body {
              background: var(--ghs-page-bg) !important;
              color: var(--ghs-text) !important;
            }

            html[data-ghs-theme="dark"] main,
            html[data-ghs-theme="dark"] section,
            html[data-ghs-theme="dark"] article {
              background: var(--ghs-panel-bg) !important;
              background-color: var(--ghs-panel-bg) !important;
              color: var(--ghs-text) !important;
              --calendar-bg: var(--ghs-page-bg) !important;
              --calendar-panel: var(--ghs-panel-bg) !important;
              --calendar-soft: var(--ghs-panel-soft) !important;
              --calendar-text: var(--ghs-text) !important;
              --calendar-muted: var(--ghs-muted) !important;
              --calendar-border: var(--ghs-border) !important;
              --calendar-blue: var(--ghs-accent) !important;
              --allotment-bg: var(--ghs-page-bg) !important;
              --allotment-panel: var(--ghs-panel-bg) !important;
              --allotment-soft: var(--ghs-panel-soft) !important;
              --allotment-text: var(--ghs-text) !important;
              --allotment-muted: var(--ghs-muted) !important;
              --allotment-border: var(--ghs-border) !important;
              --allotment-blue: var(--ghs-accent) !important;
            }

            html[data-ghs-theme="dark"] main {
              background: var(--ghs-page-bg) !important;
              background-color: var(--ghs-page-bg) !important;
            }

            html[data-ghs-theme="dark"] main[style*="background: #e8e8e8"],
            html[data-ghs-theme="dark"] main[style*="background:#e8e8e8"],
            html[data-ghs-theme="dark"] main[style*="background: #f8fafc"],
            html[data-ghs-theme="dark"] main[style*="background:#f8fafc"],
            html[data-ghs-theme="dark"] main[style*="background: #f9fafb"],
            html[data-ghs-theme="dark"] main[style*="background:#f9fafb"],
            html[data-ghs-theme="dark"] main[style*="background: #f3f4f6"],
            html[data-ghs-theme="dark"] main[style*="background:#f3f4f6"],
            html[data-ghs-theme="dark"] main[style*="background: linear-gradient"],
            html[data-ghs-theme="dark"] main[style*="background: radial-gradient"],
            html[data-ghs-theme="dark"] div[style*="background: #e8e8e8"],
            html[data-ghs-theme="dark"] div[style*="background:#e8e8e8"],
            html[data-ghs-theme="dark"] div[style*="background: #f8fafc"],
            html[data-ghs-theme="dark"] div[style*="background:#f8fafc"],
            html[data-ghs-theme="dark"] div[style*="background: #f9fafb"],
            html[data-ghs-theme="dark"] div[style*="background:#f9fafb"],
            html[data-ghs-theme="dark"] div[style*="background: #f3f4f6"],
            html[data-ghs-theme="dark"] div[style*="background:#f3f4f6"] {
              background: var(--ghs-page-bg) !important;
              color: var(--ghs-text) !important;
            }

            html[data-ghs-theme="dark"] div[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] div[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] section[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] section[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] article[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] article[style*="background:#ffffff"],
            html[data-ghs-theme="dark"] form[style*="background: #ffffff"],
            html[data-ghs-theme="dark"] form[style*="background:#ffffff"] {
              background: var(--ghs-panel-bg) !important;
              border-color: var(--ghs-border) !important;
              color: var(--ghs-text) !important;
            }

            html[data-ghs-theme="dark"] div[style*="background: #fbfbfb"],
            html[data-ghs-theme="dark"] div[style*="background:#fbfbfb"],
            html[data-ghs-theme="dark"] div[style*="background: #f6f6f6"],
            html[data-ghs-theme="dark"] div[style*="background:#f6f6f6"],
            html[data-ghs-theme="dark"] div[style*="background: #f7f7f7"],
            html[data-ghs-theme="dark"] div[style*="background:#f7f7f7"],
            html[data-ghs-theme="dark"] section[style*="background: #fbfbfb"],
            html[data-ghs-theme="dark"] section[style*="background:#fbfbfb"],
            html[data-ghs-theme="dark"] section[style*="background: #f6f6f6"],
            html[data-ghs-theme="dark"] section[style*="background:#f6f6f6"],
            html[data-ghs-theme="dark"] article[style*="background: #fbfbfb"],
            html[data-ghs-theme="dark"] article[style*="background:#fbfbfb"],
            html[data-ghs-theme="dark"] article[style*="background: #f6f6f6"],
            html[data-ghs-theme="dark"] article[style*="background:#f6f6f6"] {
              background: var(--ghs-panel-muted) !important;
              border-color: #263449 !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="dark"] aside,
            html[data-ghs-theme="dark"] nav {
              background: var(--ghs-nav-bg) !important;
              background-color: var(--ghs-nav-bg) !important;
              border-color: #1e293b !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="dark"] aside[style*="background: #4a4a4a"],
            html[data-ghs-theme="dark"] aside[style*="background:#4a4a4a"],
            html[data-ghs-theme="dark"] nav[style*="background: #4a4a4a"],
            html[data-ghs-theme="dark"] nav[style*="background:#4a4a4a"],
            html[data-ghs-theme="dark"] div[style*="background: #4a4a4a"],
            html[data-ghs-theme="dark"] div[style*="background:#4a4a4a"] {
              background: #020617 !important;
              border-color: #1e293b !important;
              color: #f8fafc !important;
            }

            html[data-ghs-theme="dark"] a,
            html[data-ghs-theme="dark"] button,
            html[data-ghs-theme="dark"] input,
            html[data-ghs-theme="dark"] select,
            html[data-ghs-theme="dark"] textarea {
              border-color: #334155 !important;
            }

            html[data-ghs-theme="dark"] input,
            html[data-ghs-theme="dark"] select,
            html[data-ghs-theme="dark"] textarea {
              background: #020617 !important;
              color: var(--ghs-text) !important;
            }

            html[data-ghs-theme="dark"] table,
            html[data-ghs-theme="dark"] th,
            html[data-ghs-theme="dark"] td {
              background: var(--ghs-panel-soft) !important;
              background-color: var(--ghs-panel-soft) !important;
              border-color: var(--ghs-border) !important;
              color: #e5e7eb !important;
            }

            html[data-ghs-theme="dark"] th {
              background: #020617 !important;
              background-color: #020617 !important;
              color: #cbd5e1 !important;
            }

            html[data-ghs-theme="dark"] [style*="background: #fff"],
            html[data-ghs-theme="dark"] [style*="background:#fff"],
            html[data-ghs-theme="dark"] [style*="background: white"],
            html[data-ghs-theme="dark"] [style*="background:white"],
            html[data-ghs-theme="dark"] [style*="background-color: #fff"],
            html[data-ghs-theme="dark"] [style*="background-color:#fff"],
            html[data-ghs-theme="dark"] [style*="backgroundColor:#fff"] {
              background: var(--ghs-panel-bg) !important;
              background-color: var(--ghs-panel-bg) !important;
              color: var(--ghs-text) !important;
              border-color: var(--ghs-border) !important;
            }

            html[data-ghs-theme="dark"] [style*="background: #f6"],
            html[data-ghs-theme="dark"] [style*="background:#f6"],
            html[data-ghs-theme="dark"] [style*="background: #f7"],
            html[data-ghs-theme="dark"] [style*="background:#f7"],
            html[data-ghs-theme="dark"] [style*="background: #f8"],
            html[data-ghs-theme="dark"] [style*="background:#f8"],
            html[data-ghs-theme="dark"] [style*="background: #f9"],
            html[data-ghs-theme="dark"] [style*="background:#f9"],
            html[data-ghs-theme="dark"] [style*="background: #fb"],
            html[data-ghs-theme="dark"] [style*="background:#fb"],
            html[data-ghs-theme="dark"] [style*="background: #fe"],
            html[data-ghs-theme="dark"] [style*="background:#fe"],
            html[data-ghs-theme="dark"] [style*="background-color: #f6"],
            html[data-ghs-theme="dark"] [style*="background-color:#f6"],
            html[data-ghs-theme="dark"] [style*="background-color: #f7"],
            html[data-ghs-theme="dark"] [style*="background-color:#f7"],
            html[data-ghs-theme="dark"] [style*="background-color: #f8"],
            html[data-ghs-theme="dark"] [style*="background-color:#f8"],
            html[data-ghs-theme="dark"] [style*="background-color: #f9"],
            html[data-ghs-theme="dark"] [style*="background-color:#f9"],
            html[data-ghs-theme="dark"] [style*="background-color: #fb"],
            html[data-ghs-theme="dark"] [style*="background-color:#fb"],
            html[data-ghs-theme="dark"] [style*="background-color: #fe"],
            html[data-ghs-theme="dark"] [style*="background-color:#fe"] {
              background: var(--ghs-panel-muted) !important;
              background-color: var(--ghs-panel-muted) !important;
              color: var(--ghs-text) !important;
              border-color: var(--ghs-border) !important;
            }

            html[data-ghs-theme="dark"] [style*="color: #232323"],
            html[data-ghs-theme="dark"] [style*="color:#232323"],
            html[data-ghs-theme="dark"] [style*="color: #111827"],
            html[data-ghs-theme="dark"] [style*="color:#111827"],
            html[data-ghs-theme="dark"] [style*="color: #052e16"],
            html[data-ghs-theme="dark"] [style*="color:#052e16"] {
              color: var(--ghs-text) !important;
            }

            html[data-ghs-theme="dark"] [style*="color: #555555"],
            html[data-ghs-theme="dark"] [style*="color:#555555"],
            html[data-ghs-theme="dark"] [style*="color: #64748b"],
            html[data-ghs-theme="dark"] [style*="color:#64748b"],
            html[data-ghs-theme="dark"] [style*="color: #777777"],
            html[data-ghs-theme="dark"] [style*="color:#777777"],
            html[data-ghs-theme="dark"] [style*="color: #6b7280"],
            html[data-ghs-theme="dark"] [style*="color:#6b7280"],
            html[data-ghs-theme="dark"] [style*="color: #9ca3af"],
            html[data-ghs-theme="dark"] [style*="color:#9ca3af"] {
              color: var(--ghs-muted) !important;
            }

            html[data-ghs-theme="dark"] [style*="color: #0ea5c6"],
            html[data-ghs-theme="dark"] [style*="color:#0ea5c6"],
            html[data-ghs-theme="dark"] [style*="color: #2563eb"],
            html[data-ghs-theme="dark"] [style*="color:#2563eb"] {
              color: var(--ghs-accent) !important;
            }

            html[data-ghs-theme="dark"] button[aria-label^="Switch to"] {
              background: var(--ghs-theme-toggle-bg) !important;
              border-color: var(--ghs-theme-toggle-border) !important;
              color: var(--ghs-theme-toggle-text) !important;
            }

            html[data-ghs-theme="light"] body {
              background: #e8e8e8 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] main[style*="#0f172a"],
            html[data-ghs-theme="light"] main[style*="#111827"],
            html[data-ghs-theme="light"] main[style*="#020617"],
            html[data-ghs-theme="light"] main[style*="#030712"],
            html[data-ghs-theme="light"] main[style*="radial-gradient"],
            html[data-ghs-theme="light"] main[style*="linear-gradient"],
            html[data-ghs-theme="light"] section[style*="#0f172a"],
            html[data-ghs-theme="light"] section[style*="#111827"],
            html[data-ghs-theme="light"] section[style*="#020617"],
            html[data-ghs-theme="light"] section[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] section[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] article[style*="#0f172a"],
            html[data-ghs-theme="light"] article[style*="#111827"],
            html[data-ghs-theme="light"] article[style*="#020617"],
            html[data-ghs-theme="light"] article[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] article[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] form[style*="#0f172a"],
            html[data-ghs-theme="light"] form[style*="#111827"],
            html[data-ghs-theme="light"] form[style*="#020617"],
            html[data-ghs-theme="light"] form[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] form[style*="rgba(17, 24, 39"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
              box-shadow: 0 1px 2px rgba(0,0,0,0.08) !important;
            }

            html[data-ghs-theme="light"] div[style*="#0f172a"],
            html[data-ghs-theme="light"] div[style*="#111827"],
            html[data-ghs-theme="light"] div[style*="#020617"],
            html[data-ghs-theme="light"] div[style*="#030712"],
            html[data-ghs-theme="light"] div[style*="rgba(15, 23, 42"],
            html[data-ghs-theme="light"] div[style*="rgba(17, 24, 39"],
            html[data-ghs-theme="light"] div[style*="rgba(2, 6, 23"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] aside,
            html[data-ghs-theme="light"] nav {
              background-color: #4a4a4a !important;
              border-color: #343434 !important;
              color: #ffffff !important;
            }

            html[data-ghs-theme="light"] nav a,
            html[data-ghs-theme="light"] aside a,
            html[data-ghs-theme="light"] nav button,
            html[data-ghs-theme="light"] aside button {
              color: #ffffff !important;
            }

            html[data-ghs-theme="light"] input,
            html[data-ghs-theme="light"] select,
            html[data-ghs-theme="light"] textarea {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] table,
            html[data-ghs-theme="light"] th,
            html[data-ghs-theme="light"] td {
              background-color: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] th {
              background-color: #f6f6f6 !important;
              color: #555555 !important;
            }

            html[data-ghs-theme="light"] [style*="color: #f8fafc"],
            html[data-ghs-theme="light"] [style*="color:#f8fafc"],
            html[data-ghs-theme="light"] [style*="color: #e2e8f0"],
            html[data-ghs-theme="light"] [style*="color:#e2e8f0"],
            html[data-ghs-theme="light"] [style*="color: #cbd5e1"],
            html[data-ghs-theme="light"] [style*="color:#cbd5e1"] {
              color: #232323 !important;
            }

            html[data-ghs-theme="light"] [style*="color: #94a3b8"],
            html[data-ghs-theme="light"] [style*="color:#94a3b8"],
            html[data-ghs-theme="light"] [style*="color: #64748b"],
            html[data-ghs-theme="light"] [style*="color:#64748b"] {
              color: #777777 !important;
            }

            html[data-ghs-theme="light"] button[aria-label^="Switch to"] {
              background: #ffffff !important;
              border-color: #d7d7d7 !important;
              color: #232323 !important;
            }

            @media (max-width: 720px) {
              button[aria-label^="Switch to"] {
                right: 12px !important;
                bottom: calc(env(safe-area-inset-bottom, 0px) + 82px) !important;
                min-height: 38px !important;
                padding: 0 11px !important;
                font-size: 12px !important;
              }
            }
          `}
        </style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
