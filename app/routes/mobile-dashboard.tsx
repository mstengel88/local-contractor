import { Form, useActionData, useLoaderData, useLocation } from "react-router";
import { data, redirect } from "react-router";
import { getRecentCustomQuotes } from "../lib/custom-quotes.server";
import {
  adminQuoteCookie,
  getAdminQuotePassword,
  hasAdminQuoteAccess,
} from "../lib/admin-quote-auth.server";

function formatMoney(cents: number | null | undefined) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #1f2937 0%, #111827 45%, #030712 100%)",
    color: "#f9fafb",
    padding: "20px 14px 120px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflowX: "clip" as const,
  },
  shell: {
    maxWidth: "760px",
    margin: "0 auto",
    display: "grid",
    gap: "16px",
  },
  card: {
    background: "rgba(17, 24, 39, 0.9)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 18px 34px rgba(2, 6, 23, 0.35)",
    backdropFilter: "blur(12px)",
  } as const,
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 800,
    color: "#f8fafc",
  },
  sectionSub: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontSize: "14px",
  },
  button: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    textDecoration: "none",
    color: "#f8fafc",
    borderRadius: "18px",
    padding: "18px 16px",
    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(15, 118, 110, 0.18))",
    border: "1px solid rgba(96, 165, 250, 0.28)",
    minHeight: "96px",
    justifyContent: "center",
  } as const,
  buttonTitle: {
    fontSize: "17px",
    fontWeight: 800,
  },
  buttonSub: {
    fontSize: "13px",
    color: "#bfdbfe",
    lineHeight: 1.45,
  },
  smallButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.86)",
    color: "#e2e8f0",
    textDecoration: "none",
    fontWeight: 700,
  } as const,
  input: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.92)",
    color: "#f8fafc",
    padding: "14px 16px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#cbd5e1",
  },
  bottomNav: {
    position: "fixed" as const,
    left: 12,
    right: 12,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    zIndex: 30,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    padding: 10,
    borderRadius: 18,
    background: "rgba(2, 6, 23, 0.94)",
    border: "1px solid rgba(51, 65, 85, 0.95)",
    boxShadow: "0 18px 38px rgba(2, 6, 23, 0.45)",
    backdropFilter: "blur(14px)",
  },
  navLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.86)",
    color: "#e2e8f0",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "13px",
  } as const,
  statusErr: {
    marginTop: "16px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    color: "#fee2e2",
    fontWeight: 700,
  } as const,
};

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith("/app/");
  const dashboardPath = isEmbeddedRoute ? "/app/mobile" : "/mobile";

  if (url.searchParams.get("logout") === "1") {
    return redirect(dashboardPath, {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  const allowed = await hasAdminQuoteAccess(request);
  const recentQuotes = allowed ? await getRecentCustomQuotes(8) : [];

  return data({ allowed, recentQuotes });
}

export async function action({ request }: any) {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent !== "login") {
    return data({ allowed: false, loginError: "Invalid request", recentQuotes: [] }, { status: 400 });
  }

  const password = String(form.get("password") || "");
  const expected = getAdminQuotePassword();

  if (!expected || password !== expected) {
    return data(
      { allowed: false, loginError: "Invalid password", recentQuotes: [] },
      { status: 401 },
    );
  }

  return data(
    {
      allowed: true,
      loginError: null,
      recentQuotes: await getRecentCustomQuotes(8),
    },
    {
      headers: {
        "Set-Cookie": await adminQuoteCookie.serialize("ok"),
      },
    },
  );
}

export default function MobileDashboardPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const recentQuotes = (actionData?.recentQuotes || loaderData.recentQuotes || []) as any[];
  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const quoteToolBase = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const reviewHref = isEmbeddedRoute ? "/app/quote-review" : "/quote-review";
  const dashboardHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";

  if (!allowed) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}>
            <h1 style={styles.title}>Mobile Dashboard</h1>
            <p style={styles.subtitle}>
              Enter the admin password to open the mobile quote workspace.
            </p>

            <Form method="post" autoComplete="off" style={{ marginTop: 22 }}>
              <input type="hidden" name="intent" value="login" />
              <label style={styles.label}>Admin Password</label>
              <input type="password" name="password" autoComplete="current-password" style={styles.input} />
              {actionData?.loginError ? (
                <div style={styles.statusErr}>{actionData.loginError}</div>
              ) : null}
              <button
                type="submit"
                style={{ ...styles.smallButton, marginTop: 16, background: "linear-gradient(135deg, #2563eb, #14b8a6)", color: "#eff6ff" }}
              >
                Open Mobile Dashboard
              </button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={{ ...styles.card, position: "sticky", top: 10, zIndex: 18 }}>
          <h1 style={styles.title}>Local Contractor Quote</h1>
          <p style={styles.subtitle}>
            Quick mobile entry point for building quotes, reviewing history, and jumping into the right pricing mode fast.
          </p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Start A Quote</h2>
          <p style={styles.sectionSub}>Choose the quote mode you want before opening the full builder.</p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <a href={`${quoteToolBase}?audience=customer`} style={styles.button}>
              <span style={styles.buttonTitle}>Customer Quote</span>
              <span style={styles.buttonSub}>Standard customer pricing and normal quote flow.</span>
            </a>
            <a href={`${quoteToolBase}?audience=contractor&tier=tier1`} style={styles.button}>
              <span style={styles.buttonTitle}>Contractor Quote</span>
              <span style={styles.buttonSub}>Open the builder with contractor pricing ready to go.</span>
            </a>
            <a href={`${quoteToolBase}?audience=custom`} style={styles.button}>
              <span style={styles.buttonTitle}>Custom Quote</span>
              <span style={styles.buttonSub}>Editable pricing, shipping math, and manual adjustments.</span>
            </a>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Quick Actions</h2>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <a href={quoteToolBase} style={styles.smallButton}>Open Quote Tool</a>
            <a href={reviewHref} style={styles.smallButton}>Review Quotes</a>
            <a href={`${dashboardHref}?logout=1`} style={styles.smallButton}>Log Out</a>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Recent Quotes</h2>
          <p style={styles.sectionSub}>Open review with a recent quote ready to inspect.</p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {recentQuotes.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>No recent quotes yet.</div>
            ) : (
              recentQuotes.map((quote) => (
                <a
                  key={quote.id}
                  href={`${reviewHref}?quote=${encodeURIComponent(quote.id)}`}
                  style={{
                    ...styles.button,
                    minHeight: "unset",
                    overflowWrap: "anywhere",
                  }}
                >
                  <span style={styles.buttonTitle}>
                    {quote.customer_name || quote.customer_email || "Unnamed quote"}
                  </span>
                  <span style={styles.buttonSub}>
                    {formatMoney(quote.quote_total_cents)} · {quote.city}, {quote.province}
                  </span>
                  <span style={{ ...styles.buttonSub, color: "#94a3b8" }}>
                    {new Date(quote.created_at).toLocaleString()}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.bottomNav}>
        <a href={dashboardHref} style={styles.navLink}>Dashboard</a>
        <a href={quoteToolBase} style={styles.navLink}>Quote Tool</a>
        <a href={reviewHref} style={styles.navLink}>Review</a>
      </div>
    </div>
  );
}
