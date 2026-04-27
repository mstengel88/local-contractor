import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { data } from "react-router";
import {
  createAppUser,
  listAppUsers,
  requireUserPermission,
  updateAppUserProfile,
} from "../lib/user-auth.server";
import {
  allPermissions,
  permissionLabels,
  type UserPermission,
} from "../lib/user-permissions";

export async function loader({ request }: any) {
  const currentUser = await requireUserPermission(request, "manageUsers");
  const users = await listAppUsers();
  return data({ currentUser, users, allPermissions, permissionLabels });
}

export async function action({ request }: any) {
  await requireUserPermission(request, "manageUsers");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const permissions = form.getAll("permissions").map(String);

  try {
    if (intent === "create-user") {
      await createAppUser({
        email: String(form.get("email") || "").trim(),
        password: String(form.get("password") || ""),
        name: String(form.get("name") || "").trim(),
        role: String(form.get("role") || "user").trim(),
        permissions,
      });
      return data({
        ok: true,
        message: "User created.",
        users: await listAppUsers(),
      });
    }

    if (intent === "update-user") {
      await updateAppUserProfile({
        id: String(form.get("userId") || ""),
        name: String(form.get("name") || "").trim(),
        role: String(form.get("role") || "user").trim(),
        permissions,
        isActive: form.get("isActive") === "on",
      });
      return data({
        ok: true,
        message: "User updated.",
        users: await listAppUsers(),
      });
    }

    return data({ ok: false, message: "Unknown settings action." }, { status: 400 });
  } catch (error) {
    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to save user settings.",
        users: await listAppUsers(),
      },
      { status: 400 },
    );
  }
}

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const users = actionData?.users || loaderData.users;
  const isSubmitting = navigation.state === "submitting";

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Admin Settings</p>
            <h1 style={styles.title}>Users, Roles & Privileges</h1>
            <p style={styles.subtitle}>
              Control which parts of the contractor app each user can see and what they can do.
            </p>
          </div>
          <nav style={styles.nav}>
            <Link to="/custom-quote" style={styles.navButton}>Quote Tool</Link>
            <Link to="/dispatch" style={styles.navButton}>Dispatch</Link>
            <Link to="/login?logout=1" style={styles.navButton}>Log Out</Link>
          </nav>
        </header>

        {actionData?.message ? (
          <div style={actionData.ok ? styles.success : styles.error}>{actionData.message}</div>
        ) : null}

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Create User</h2>
          <Form method="post" style={styles.form}>
            <input type="hidden" name="intent" value="create-user" />
            <div style={styles.formGrid}>
              <Field label="Name" name="name" />
              <Field label="Email" name="email" type="email" />
              <Field label="Temporary Password" name="password" type="password" />
              <RoleSelect defaultValue="user" />
            </div>
            <PermissionGrid selected={["quoteTool"]} />
            <button type="submit" style={styles.primaryButton} disabled={isSubmitting}>
              Create User
            </button>
          </Form>
        </section>

        <section style={styles.userGrid}>
          {users.map((user) => (
            <article key={user.id} style={styles.panel}>
              <div style={styles.userHeader}>
                <div>
                  <h2 style={styles.panelTitle}>{user.name || user.email}</h2>
                  <p style={styles.subtitle}>{user.email}</p>
                </div>
                <span style={user.isActive ? styles.activeBadge : styles.disabledBadge}>
                  {user.isActive ? "Active" : "Disabled"}
                </span>
              </div>

              <Form method="post" style={styles.form}>
                <input type="hidden" name="intent" value="update-user" />
                <input type="hidden" name="userId" value={user.id} />
                <div style={styles.formGrid}>
                  <Field label="Name" name="name" defaultValue={user.name} />
                  <RoleSelect defaultValue={user.role} />
                </div>
                <label style={styles.checkboxLine}>
                  <input type="checkbox" name="isActive" defaultChecked={user.isActive} />
                  User is active
                </label>
                <PermissionGrid selected={user.permissions} />
                <button type="submit" style={styles.secondaryButton} disabled={isSubmitting}>
                  Save User
                </button>
              </Form>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} style={styles.input} required />
    </div>
  );
}

function RoleSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <div>
      <label style={styles.label}>Role</label>
      <select name="role" defaultValue={defaultValue} style={styles.input}>
        <option value="admin">Admin</option>
        <option value="dispatcher">Dispatcher</option>
        <option value="driver">Driver</option>
        <option value="sales">Sales</option>
        <option value="user">User</option>
      </select>
    </div>
  );
}

function PermissionGrid({ selected }: { selected: UserPermission[] | string[] }) {
  const selectedSet = new Set(selected);
  return (
    <div style={styles.permissionGrid}>
      {allPermissions.map((permission) => (
        <label key={permission} style={styles.permissionItem}>
          <input
            type="checkbox"
            name="permissions"
            value={permission}
            defaultChecked={selectedSet.has(permission)}
          />
          <span>{permissionLabels[permission]}</span>
        </label>
      ))}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 18,
    background:
      "radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #0f172a, #020617)",
    color: "#f8fafc",
    fontFamily:
      '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as const,
  shell: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  } as const,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    padding: 22,
    borderRadius: 26,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.88)",
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
    margin: "8px 0 0",
    color: "#94a3b8",
    lineHeight: 1.45,
  },
  nav: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,
  navButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid rgba(56, 189, 248, 0.35)",
    color: "#e0f2fe",
    textDecoration: "none",
    fontWeight: 850,
  },
  panel: {
    padding: 20,
    borderRadius: 24,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 24px 64px rgba(2, 6, 23, 0.36)",
  } as const,
  panelTitle: {
    margin: 0,
    fontSize: 22,
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 16,
  } as const,
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  } as const,
  userGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
  } as const,
  userHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
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
    minHeight: 44,
    boxSizing: "border-box" as const,
    borderRadius: 12,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "#020617",
    color: "#f8fafc",
    padding: "0 12px",
  },
  permissionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  } as const,
  permissionItem: {
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(51, 65, 85, 0.95)",
    background: "rgba(2, 6, 23, 0.72)",
    color: "#e2e8f0",
    fontWeight: 800,
  } as const,
  checkboxLine: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    color: "#e2e8f0",
    fontWeight: 850,
  } as const,
  primaryButton: {
    minHeight: 48,
    border: "none",
    borderRadius: 14,
    background: "linear-gradient(135deg, #84cc16, #22c55e)",
    color: "#052e16",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(56, 189, 248, 0.45)",
    background: "rgba(14, 165, 233, 0.14)",
    color: "#e0f2fe",
    fontWeight: 950,
    cursor: "pointer",
  },
  success: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(34, 197, 94, 0.4)",
    background: "rgba(20, 83, 45, 0.42)",
    color: "#bbf7d0",
    fontWeight: 850,
  },
  error: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(248, 113, 113, 0.4)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    fontWeight: 850,
  },
  activeBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34, 197, 94, 0.16)",
    color: "#86efac",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase" as const,
  },
  disabledBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(248, 113, 113, 0.16)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase" as const,
  },
};
