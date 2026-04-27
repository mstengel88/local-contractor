import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { data, redirect } from "react-router";
import {
  getCurrentUser,
  signInContractorUser,
  userAuthCookie,
} from "../lib/user-auth.server";
import { adminQuoteCookie } from "../lib/admin-quote-auth.server";

export async function loader({ request }: any) {
  const url = new URL(request.url);

  if (url.searchParams.get("logout") === "1") {
    return redirect("/login", {
      headers: [
        ["Set-Cookie", await userAuthCookie.serialize("", { maxAge: 0 })],
        ["Set-Cookie", await adminQuoteCookie.serialize("", { maxAge: 0 })],
      ],
    });
  }

  const user = await getCurrentUser(request);
  const next = url.searchParams.get("next") || "/custom-quote";
  if (user) return redirect(next);

  return data({ next });
}

export async function action({ request }: any) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/custom-quote");

  try {
    const session = await signInContractorUser(email, password);
    return redirect(next, {
      headers: {
        "Set-Cookie": session.cookie,
      },
    });
  } catch (error) {
    return data(
      {
        next,
        error: error instanceof Error ? error.message : "Unable to sign in.",
      },
      { status: 400 },
    );
  }
}

export default function LoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <img src="/green-hills-logo.png" alt="Green Hills Supply" style={styles.logo} />
        <p style={styles.kicker}>Contractor Workspace</p>
        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.subtitle}>
          Use your Supabase user account to open the quote, dispatch, and driver tools.
        </p>

        <Form method="post" style={styles.form}>
          <input type="hidden" name="next" value={actionData?.next || loaderData.next} />
          <div>
            <label style={styles.label}>Email</label>
            <input name="email" type="email" autoComplete="email" required style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Password</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={styles.input}
            />
          </div>

          {actionData?.error ? <div style={styles.error}>{actionData.error}</div> : null}

          <button type="submit" style={styles.button} disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </Form>

        <div style={styles.links}>
          <Link to="/custom-quote" style={styles.link}>Quote Tool</Link>
          <Link to="/dispatch" style={styles.link}>Dispatch</Link>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background:
      "radial-gradient(circle at top left, rgba(132, 204, 22, 0.2), transparent 28%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.2), transparent 30%), linear-gradient(180deg, #0f172a, #020617)",
    color: "#f8fafc",
    fontFamily:
      '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  card: {
    width: "min(440px, 100%)",
    padding: 28,
    borderRadius: 28,
    border: "1px solid rgba(132, 204, 22, 0.28)",
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 34px 90px rgba(2, 6, 23, 0.5)",
  } as const,
  logo: {
    width: 132,
    height: "auto",
    display: "block",
    marginBottom: 18,
  } as const,
  kicker: {
    margin: 0,
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
  },
  title: {
    margin: "8px 0 0",
    fontSize: 36,
    lineHeight: 1,
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 22,
  } as const,
  label: {
    display: "block",
    marginBottom: 6,
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  input: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box" as const,
    borderRadius: 14,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 14px",
    fontSize: 16,
  },
  error: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(248, 113, 113, 0.4)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    fontWeight: 800,
  },
  button: {
    minHeight: 52,
    border: "none",
    borderRadius: 16,
    background: "linear-gradient(135deg, #84cc16, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer",
  },
  links: {
    display: "flex",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap" as const,
  },
  link: {
    color: "#93c5fd",
    fontWeight: 800,
    textDecoration: "none",
  },
};
