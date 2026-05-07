import { useMemo, useState, type CSSProperties } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import {
  action as dispatchAction,
  loader as dispatchLoader,
} from "./dispatch";
import type { DispatchOrder } from "../lib/dispatch.server";

export const loader = dispatchLoader;
export const action = dispatchAction;

const DISPATCH_NAV_COLLAPSED_KEY = "dispatchNavCollapsed";

type AllotmentOrder = {
  order: DispatchOrder;
  date: Date | null;
  dateKey: string;
};

type MaterialTotal = {
  key: string;
  material: string;
  unit: string;
  quantity: number;
  orders: DispatchOrder[];
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseRequestedDate(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed || /needs scheduling|unavailable|unknown/i.test(trimmed)) return null;

  const today = new Date();
  if (/\btoday\b/i.test(trimmed)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  if (/\btomorrow\b/i.test(trimmed)) {
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  }

  const slashDate = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashDate) {
    const year =
      slashDate[3].length === 2
        ? 2000 + Number(slashDate[3])
        : Number(slashDate[3]);
    return new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2]));
  }

  const monthDate = trimmed.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/i,
  )?.[0];
  if (monthDate) {
    const parsed = new Date(
      /\d{4}/.test(monthDate) ? monthDate : `${monthDate}, ${today.getFullYear()}`,
    );
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function dateKey(date: Date | null) {
  if (!date) return "unscheduled";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatDateLabel(date: Date | null) {
  if (!date) return "Needs scheduling";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getOrderStatus(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return "Delivered";
  if (order.status === "cancelled") return "Cancelled";
  if (order.assignedRouteId || order.status === "scheduled") return "Scheduled";
  if (order.status === "hold") return "On hold";
  return "New";
}

function shouldShowOnAllotment(order: DispatchOrder) {
  const status = getOrderStatus(order);
  return status !== "Delivered" && status !== "Cancelled";
}

function normalizeQuantity(value?: string | null) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function buildSearchText(order: DispatchOrder) {
  return [
    order.id,
    order.orderNumber,
    order.customer,
    order.contact,
    order.address,
    order.city,
    order.material,
    order.quantity,
    order.unit,
    order.requestedWindow,
    order.timePreference,
    order.notes,
    order.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function AllotmentPage() {
  const loaderData = useLoaderData() as any;
  const actionData = useActionData() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const loginError = actionData?.loginError;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const currentUser = actionData?.currentUser ?? loaderData.currentUser ?? null;
  const [query, setQuery] = useState("");
  const [cursorMonth, setCursorMonth] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKey(new Date()));
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISPATCH_NAV_COLLAPSED_KEY) === "1";
  });

  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const monitorHref = isEmbeddedRoute ? "/app/monitor" : "/monitor";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const allotmentHref = isEmbeddedRoute ? "/app/allotment" : "/allotment";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const canAccess = (permission: string) =>
    !currentUser || currentUser.permissions?.includes(permission);
  const logoutHref = currentUser ? "/login?logout=1" : `${dispatchHref}?logout=1`;

  function toggleNavCollapsed() {
    setNavCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(DISPATCH_NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Keep the nav control working even if storage is unavailable.
      }
      return next;
    });
  }

  const allotmentOrders = useMemo<AllotmentOrder[]>(() => {
    const search = query.trim().toLowerCase();
    return orders
      .filter(shouldShowOnAllotment)
      .filter((order) => !search || buildSearchText(order).includes(search))
      .map((order) => {
        const date = parseRequestedDate(order.requestedWindow);
        return { order, date, dateKey: dateKey(date) };
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return getOrderNumber(a.order).localeCompare(getOrderNumber(b.order));
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.getTime() - b.date.getTime();
      });
  }, [orders, query]);

  const ordersByDay = useMemo(() => {
    const grouped = new Map<string, AllotmentOrder[]>();
    for (const item of allotmentOrders) {
      if (!item.date) continue;
      grouped.set(item.dateKey, [...(grouped.get(item.dateKey) || []), item]);
    }
    return grouped;
  }, [allotmentOrders]);

  const selectedItems = ordersByDay.get(selectedDayKey) || [];
  const selectedDate = selectedItems[0]?.date || parseRequestedDate(selectedDayKey);
  const materialTotals = useMemo<MaterialTotal[]>(() => {
    const totals = new Map<string, MaterialTotal>();
    for (const { order } of selectedItems) {
      const material = String(order.material || "Unknown Material").trim();
      const unit = String(order.unit || "Unit").trim();
      const key = `${material.toLowerCase()}::${unit.toLowerCase()}`;
      const current =
        totals.get(key) || {
          key,
          material,
          unit,
          quantity: 0,
          orders: [],
        };
      current.quantity += normalizeQuantity(order.quantity);
      current.orders.push(order);
      totals.set(key, current);
    }
    return [...totals.values()].sort((a, b) => a.material.localeCompare(b.material));
  }, [selectedItems]);

  const todayDate = new Date();
  const isViewingCurrentMonth =
    cursorMonth.getFullYear() === todayDate.getFullYear() &&
    cursorMonth.getMonth() === todayDate.getMonth();
  const monthStart = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1);
  const gridStart = isViewingCurrentMonth
    ? new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
    : new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const monthLabel = `${monthNames[cursorMonth.getMonth()]} ${cursorMonth.getFullYear()}`;

  function shiftMonth(amount: number) {
    setCursorMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  }

  if (!allowed) {
    return (
      <main style={styles.loginPage}>
        <section style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Material Allotment</h1>
          <p style={styles.subtle}>Enter the admin password to open the daily material totals.</p>
          <Form method="post" style={styles.loginForm}>
            <input type="hidden" name="intent" value="login" />
            <label style={styles.label}>Admin Password</label>
            <input name="password" type="password" autoComplete="current-password" style={styles.input} />
            {loginError ? <div style={styles.error}>{loginError}</div> : null}
            <button type="submit" style={styles.primaryButton}>Open Allotment</button>
          </Form>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <aside style={{ ...styles.sideRail, width: navCollapsed ? 56 : 250, padding: navCollapsed ? "12px 8px" : "16px 14px" }}>
        <button
          type="button"
          onClick={toggleNavCollapsed}
          style={styles.navToggle}
          title={navCollapsed ? "Open navigation" : "Close navigation"}
        >
          {navCollapsed ? ">" : "<"}
        </button>
        <div style={styles.brand}>
          <img src="/green-hills-logo.png" alt="Green Hills Supply" style={styles.logo} />
          <div style={navCollapsed ? styles.collapsedOnlyHidden : undefined}>
            <div style={styles.brandTitle}>Contractor</div>
            <div style={styles.brandSub}>Allotment</div>
          </div>
        </div>
        <nav style={navCollapsed ? styles.collapsedOnlyHidden : styles.nav}>
          <Link to={classicHref} style={styles.navLink}>Classic</Link>
          <Link to={monitorHref} style={styles.navLink}>Monitor</Link>
          <Link to={calendarHref} style={styles.navLink}>Calendar</Link>
          <Link to={allotmentHref} style={styles.navLinkActive}>Allotment</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("orders")} style={styles.navLink}>Orders</Link> : null}
          <Link to={dispatchViewHref("scheduled")} style={styles.navLink}>Scheduled</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("routes")} style={styles.navLink}>Routes</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("trucks")} style={styles.navLink}>Trucks</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("employees")} style={styles.navLink}>Employees</Link> : null}
          <Link to={dispatchViewHref("delivered")} style={styles.navLink}>Delivered</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={navCollapsed ? styles.collapsedOnlyHidden : styles.footerNav}>
          {canAccess("driver") ? <Link to={driverHref} style={styles.utility}>Driver Route</Link> : null}
          {canAccess("quoteTool") ? <Link to={quoteHref} style={styles.utility}>Quote Tool</Link> : null}
          <Link to={mobileHref} style={styles.utility}>Mobile</Link>
          {canAccess("manageUsers") ? <Link to="/settings" style={styles.utility}>Settings</Link> : null}
          {currentUser ? <Link to="/change-password" style={styles.utility}>Change Password</Link> : null}
          <Link to={logoutHref} style={styles.utility}>Log Out</Link>
        </div>
      </aside>

      <section style={styles.workspace}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Material Allotment</p>
            <h1 style={styles.title}>Daily Material Going Out</h1>
            <p style={styles.subtle}>
              Select a requested delivery date to see total material quantities for that day.
            </p>
          </div>
          <div style={styles.monthControls}>
            <button type="button" onClick={() => shiftMonth(-1)} style={styles.smallButton}>Previous</button>
            <strong style={styles.monthLabel}>{monthLabel}</strong>
            <button type="button" onClick={() => shiftMonth(1)} style={styles.smallButton}>Next</button>
          </div>
        </header>

        <div style={styles.toolbar}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search orders, customers, material, address, notes..."
            style={styles.search}
          />
        </div>

        <section style={styles.layoutGrid}>
          <div style={styles.calendarPanel}>
            <div style={styles.weekHeader}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} style={styles.weekDay}>{day}</div>
              ))}
            </div>
            <div style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const key = dateKey(day);
                const dayOrders = ordersByDay.get(key) || [];
                const muted = day.getMonth() !== cursorMonth.getMonth();
                const selected = selectedDayKey === key;
                const dayQuantity = dayOrders.reduce(
                  (sum, item) => sum + normalizeQuantity(item.order.quantity),
                  0,
                );
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDayKey(key)}
                    style={{
                      ...(muted ? styles.dayMuted : styles.day),
                      ...(selected ? styles.daySelected : {}),
                    }}
                  >
                    <span style={styles.dayNumber}>{day.getDate()}</span>
                    {dayOrders.length ? (
                      <>
                        <span style={styles.dayCount}>{dayOrders.length} loads</span>
                        <span style={styles.dayTotal}>{formatQuantity(dayQuantity)} total units</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <aside style={styles.summaryPanel}>
            <p style={styles.kicker}>Selected Day</p>
            <h2 style={styles.panelTitle}>{formatDateLabel(selectedDate)}</h2>
            <p style={styles.subtle}>
              {selectedItems.length} active load{selectedItems.length === 1 ? "" : "s"} included in these material totals.
            </p>

            <div style={styles.totalsGrid}>
              {materialTotals.map((total) => (
                <article key={total.key} style={styles.totalCard}>
                  <div>
                    <strong style={styles.materialName}>{total.material}</strong>
                    <p style={styles.subtle}>{total.orders.length} load{total.orders.length === 1 ? "" : "s"}</p>
                  </div>
                  <div style={styles.totalQuantity}>
                    {formatQuantity(total.quantity)} <span>{total.unit}</span>
                  </div>
                  <div style={styles.materialBreakdown}>
                    {total.orders.map((order) => (
                      <span key={order.id} style={styles.materialBreakdownItem}>
                        {formatQuantity(normalizeQuantity(order.quantity))} {order.unit}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {!materialTotals.length ? (
                <div style={styles.emptyState}>No active material loads on this date.</div>
              ) : null}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

const navBase: CSSProperties = {
  borderRadius: 8,
  color: "#e5e7eb",
  fontWeight: 800,
  padding: "14px 16px",
  textDecoration: "none",
};

const utilityBase: CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#e5e7eb",
  fontWeight: 800,
  padding: "11px 14px",
  textDecoration: "none",
};

const styles: Record<string, CSSProperties> = {
  page: {
    ["--allotment-bg" as any]: "#020617",
    ["--allotment-panel" as any]: "#0f172a",
    ["--allotment-soft" as any]: "#111827",
    ["--allotment-text" as any]: "#f8fafc",
    ["--allotment-muted" as any]: "#94a3b8",
    ["--allotment-border" as any]: "#334155",
    ["--allotment-blue" as any]: "#38bdf8",
    background: "#020617",
    color: "var(--allotment-text)",
    display: "flex",
    minHeight: "100vh",
  },
  loginPage: {
    alignItems: "center",
    background: "#020617",
    color: "#f8fafc",
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  loginCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    maxWidth: 480,
    padding: 32,
    width: "100%",
  },
  loginTitle: { fontSize: 34, margin: "0 0 8px" },
  loginForm: { display: "grid", gap: 12, marginTop: 22 },
  sideRail: {
    background: "#020617",
    borderRight: "1px solid #1e293b",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: "100vh",
    position: "sticky",
    top: 0,
    overflow: "hidden",
    transition: "width 160ms ease, padding 160ms ease",
  },
  navToggle: {
    alignItems: "center",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "#ff7a1a",
    cursor: "pointer",
    display: "inline-flex",
    fontWeight: 900,
    height: 30,
    justifyContent: "center",
    width: 34,
  },
  collapsedOnlyHidden: { display: "none" },
  brand: { alignItems: "center", display: "flex", gap: 12 },
  logo: { height: 52, objectFit: "contain", width: 52 },
  brandTitle: { color: "#f8fafc", fontSize: 18, fontWeight: 900 },
  brandSub: { color: "#cbd5e1", fontSize: 12, fontWeight: 800 },
  nav: { display: "grid", gap: 8 },
  navLink: navBase,
  navLinkActive: {
    ...navBase,
    background: "#1e293b",
    border: "1px solid transparent",
    color: "#ff7a1a",
  },
  footerNav: { display: "grid", gap: 8 },
  utility: utilityBase,
  workspace: { display: "grid", flex: 1, gap: 14, padding: 14 },
  header: {
    alignItems: "flex-start",
    background: "var(--allotment-panel)",
    border: "1px solid var(--allotment-border)",
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    padding: "14px 16px",
  },
  kicker: { color: "#e85d04", fontSize: 12, fontWeight: 900, letterSpacing: 1.6, margin: 0, textTransform: "uppercase" },
  title: { fontSize: 28, lineHeight: 1, margin: "8px 0 10px" },
  subtle: { color: "var(--allotment-muted)", fontSize: 14, lineHeight: 1.45, margin: 0 },
  toolbar: { display: "flex", gap: 16 },
  search: {
    background: "var(--allotment-panel)",
    border: "1px solid var(--allotment-border)",
    borderRadius: 999,
    color: "var(--allotment-text)",
    flex: 1,
    fontSize: 15,
    minWidth: 240,
    padding: "14px 16px",
  },
  monthControls: { alignItems: "center", display: "flex", gap: 10 },
  monthLabel: { minWidth: 160, textAlign: "center" },
  smallButton: {
    background: "var(--allotment-panel)",
    border: "1px solid var(--allotment-border)",
    borderRadius: 999,
    color: "var(--allotment-text)",
    cursor: "pointer",
    fontWeight: 900,
    padding: "12px 14px",
  },
  layoutGrid: {
    alignItems: "start",
    display: "grid",
    gap: 14,
    gridTemplateColumns: "minmax(520px, 1fr) minmax(360px, 0.62fr)",
  },
  calendarPanel: {
    background: "var(--allotment-panel)",
    border: "1px solid var(--allotment-border)",
    overflow: "hidden",
  },
  weekHeader: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  weekDay: {
    background: "var(--allotment-soft)",
    borderBottom: "1px solid var(--allotment-border)",
    color: "var(--allotment-muted)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    padding: "12px 14px",
    textTransform: "uppercase",
  },
  calendarGrid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  day: {
    background: "#0f172a",
    border: 0,
    borderBottom: "1px solid var(--allotment-border)",
    borderRight: "1px solid var(--allotment-border)",
    color: "var(--allotment-text)",
    cursor: "pointer",
    display: "grid",
    gap: 8,
    minHeight: 116,
    padding: 12,
    textAlign: "left",
  },
  dayMuted: {
    background: "#111827",
    border: 0,
    borderBottom: "1px solid var(--allotment-border)",
    borderRight: "1px solid var(--allotment-border)",
    color: "var(--allotment-muted)",
    cursor: "pointer",
    display: "grid",
    gap: 8,
    minHeight: 116,
    opacity: 0.48,
    padding: 12,
    textAlign: "left",
  },
  daySelected: {
    boxShadow: "inset 0 0 0 3px #f97316",
  },
  dayNumber: { fontSize: 16, fontWeight: 900 },
  dayCount: {
    background: "rgba(34, 197, 94, 0.18)",
    borderRadius: 999,
    color: "#86efac",
    fontSize: 12,
    fontWeight: 900,
    justifySelf: "start",
    padding: "4px 8px",
  },
  dayTotal: { color: "var(--allotment-blue)", fontSize: 12, fontWeight: 900 },
  summaryPanel: {
    background: "var(--allotment-panel)",
    border: "1px solid var(--allotment-border)",
    display: "grid",
    gap: 14,
    padding: 18,
    position: "sticky",
    top: 14,
  },
  panelTitle: { fontSize: 24, lineHeight: 1.1, margin: "6px 0 0" },
  totalsGrid: { display: "grid", gap: 12 },
  totalCard: {
    background: "#0b1220",
    border: "1px solid var(--allotment-border)",
    borderLeft: "5px solid #f97316",
    display: "grid",
    gap: 12,
    padding: 14,
  },
  materialName: { display: "block", fontSize: 18 },
  totalQuantity: {
    color: "#38bdf8",
    fontSize: 30,
    fontWeight: 950,
    lineHeight: 1,
  },
  materialBreakdown: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  materialBreakdownItem: {
    background: "#020617",
    border: "1px solid var(--allotment-border)",
    borderRadius: 999,
    color: "var(--allotment-text)",
    fontSize: 12,
    fontWeight: 900,
    padding: "7px 10px",
  },
  emptyState: {
    background: "rgba(249, 115, 22, 0.12)",
    border: "1px solid rgba(249, 115, 22, 0.35)",
    color: "#fed7aa",
    fontWeight: 900,
    padding: 16,
  },
  label: {
    color: "var(--allotment-muted)",
    display: "block",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    background: "#020617",
    border: "1px solid var(--allotment-border)",
    borderRadius: 14,
    color: "var(--allotment-text)",
    fontSize: 16,
    padding: "13px 14px",
    width: "100%",
  },
  primaryButton: {
    background: "linear-gradient(180deg, #ff9b25, #ff6b00)",
    border: "1px solid #ff7a1a",
    borderRadius: 16,
    color: "#fff7ed",
    cursor: "pointer",
    fontWeight: 900,
    padding: "14px 16px",
  },
  error: {
    background: "rgba(127, 29, 29, 0.35)",
    border: "1px solid rgba(248, 113, 113, 0.4)",
    borderRadius: 12,
    color: "#fecaca",
    padding: 12,
  },
};
