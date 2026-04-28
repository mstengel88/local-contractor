import { useMemo, useState, type CSSProperties } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import {
  action as dispatchAction,
  loader as dispatchLoader,
} from "./dispatch";
import type { DispatchOrder } from "../lib/dispatch.server";

export const loader = dispatchLoader;
export const action = dispatchAction;

type CalendarOrder = {
  order: DispatchOrder;
  date: Date | null;
  dateKey: string;
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
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderNumber(order: DispatchOrder) {
  return order.orderNumber ? `#${order.orderNumber}` : order.id;
}

function getLoadLabel(order: DispatchOrder) {
  return [order.quantity, order.unit, order.material].filter(Boolean).join(" ");
}

function getOrderAddress(order: DispatchOrder) {
  return [order.address, order.city].filter(Boolean).join(", ");
}

function getOrderStatus(order: DispatchOrder) {
  if (order.status === "delivered" || order.deliveryStatus === "delivered") return "Delivered";
  if (order.assignedRouteId || order.status === "scheduled") return "Scheduled";
  if (order.status === "hold") return "On hold";
  return "New";
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

export default function DispatchCalendarPage() {
  const loaderData = useLoaderData() as any;
  const actionData = useActionData() as any;
  const location = useLocation();
  const allowed = actionData?.allowed ?? loaderData.allowed;
  const loginError = actionData?.loginError;
  const orders = (actionData?.orders ?? loaderData.orders ?? []) as DispatchOrder[];
  const currentUser = actionData?.currentUser ?? loaderData.currentUser ?? null;
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [query, setQuery] = useState("");
  const [cursorMonth, setCursorMonth] = useState(() => new Date());

  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const dispatchHref = isEmbeddedRoute ? "/app/dispatch" : "/dispatch";
  const quoteHref = isEmbeddedRoute ? "/app/custom-quote" : "/custom-quote";
  const driverHref = isEmbeddedRoute ? "/app/dispatch/driver" : "/dispatch/driver";
  const mobileHref = isEmbeddedRoute ? "/app/mobile" : "/mobile";
  const dispatchViewHref = (view: string) => `${dispatchHref}?view=${view}`;
  const editorHref = (orderId: string) =>
    `${dispatchHref}?view=orders&order=${encodeURIComponent(orderId)}&returnTo=${encodeURIComponent(
      calendarHref,
    )}`;
  const canAccess = (permission: string) =>
    !currentUser || currentUser.permissions?.includes(permission);
  const logoutHref = currentUser ? "/login?logout=1" : `${dispatchHref}?logout=1`;

  const calendarOrders = useMemo<CalendarOrder[]>(() => {
    const search = query.trim().toLowerCase();
    return orders
      .filter((order) => getOrderStatus(order) !== "Delivered")
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
    const grouped = new Map<string, CalendarOrder[]>();
    for (const item of calendarOrders) {
      if (!item.date) continue;
      grouped.set(item.dateKey, [...(grouped.get(item.dateKey) || []), item]);
    }
    return grouped;
  }, [calendarOrders]);

  const unscheduledOrders = calendarOrders.filter((item) => !item.date);
  const monthStart = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
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
          <h1 style={styles.loginTitle}>Dispatch Calendar</h1>
          <p style={styles.subtle}>Enter the admin password to open the contractor calendar.</p>
          <Form method="post" style={styles.loginForm}>
            <input type="hidden" name="intent" value="login" />
            <label style={styles.label}>Admin Password</label>
            <input name="password" type="password" autoComplete="current-password" style={styles.input} />
            {loginError ? <div style={styles.error}>{loginError}</div> : null}
            <button type="submit" style={styles.primaryButton}>Open Calendar</button>
          </Form>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <aside style={styles.sideRail}>
        <div style={styles.brand}>
          <img src="/green-hills-logo.png" alt="Green Hills Supply" style={styles.logo} />
          <div>
            <div style={styles.brandTitle}>Contractor</div>
            <div style={styles.brandSub}>Calendar</div>
          </div>
        </div>
        <nav style={styles.nav}>
          <Link to={classicHref} style={styles.navLink}>Classic</Link>
          <Link to={calendarHref} style={styles.navLinkActive}>Calendar</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("orders")} style={styles.navLink}>Orders</Link> : null}
          <Link to={dispatchViewHref("scheduled")} style={styles.navLink}>Scheduled</Link>
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("routes")} style={styles.navLink}>Routes</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("trucks")} style={styles.navLink}>Trucks</Link> : null}
          {canAccess("manageDispatch") ? <Link to={dispatchViewHref("employees")} style={styles.navLink}>Employees</Link> : null}
          <Link to={dispatchViewHref("delivered")} style={styles.navLink}>Delivered</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={styles.footerNav}>
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
            <p style={styles.kicker}>Dispatch Calendar</p>
            <h1 style={styles.title}>Requested Delivery Dates</h1>
            <p style={styles.subtle}>
              Orders are placed by requested date. Switch to List when you want a compact schedule.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              style={viewMode === "calendar" ? styles.toggleActive : styles.toggle}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={viewMode === "list" ? styles.toggleActive : styles.toggle}
            >
              List
            </button>
          </div>
        </header>

        <div style={styles.toolbar}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search orders, customers, material, address, notes..."
            style={styles.search}
          />
          {viewMode === "calendar" ? (
            <div style={styles.monthControls}>
              <button type="button" onClick={() => shiftMonth(-1)} style={styles.smallButton}>Previous</button>
              <strong style={styles.monthLabel}>{monthLabel}</strong>
              <button type="button" onClick={() => shiftMonth(1)} style={styles.smallButton}>Next</button>
            </div>
          ) : null}
        </div>

        {viewMode === "calendar" ? (
          <section style={styles.calendarPanel}>
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
                const today = dateKey(day) === dateKey(new Date());
                return (
                  <div key={key} style={muted ? styles.dayMuted : styles.day}>
                    <div style={styles.dayHeader}>
                      <span style={today ? styles.todayBadge : undefined}>{day.getDate()}</span>
                      {dayOrders.length ? <span style={styles.dayCount}>{dayOrders.length}</span> : null}
                    </div>
                    <div style={styles.dayOrders}>
                      {dayOrders.slice(0, 5).map(({ order }) => (
                        <Link key={order.id} to={editorHref(order.id)} style={styles.orderChip}>
                          <strong>{getOrderNumber(order)}</strong>
                          <span>{order.customer}</span>
                          <small>{getLoadLabel(order)}</small>
                        </Link>
                      ))}
                      {dayOrders.length > 5 ? (
                        <div style={styles.moreChip}>+{dayOrders.length - 5} more</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section style={styles.listPanel}>
            {calendarOrders.map(({ order, date }) => (
              <Link key={order.id} to={editorHref(order.id)} style={styles.listRow}>
                <div>
                  <strong style={styles.listDate}>{formatDateLabel(date)}</strong>
                  <div style={styles.subtle}>{order.requestedWindow || "Needs scheduling"}</div>
                </div>
                <div>
                  <strong>{getOrderNumber(order)} {order.customer}</strong>
                  <div style={styles.subtle}>{getOrderAddress(order)}</div>
                </div>
                <div>{getLoadLabel(order) || "No material"}</div>
                <span style={styles.statusPill}>{getOrderStatus(order)}</span>
              </Link>
            ))}
          </section>
        )}

        {unscheduledOrders.length ? (
          <section style={styles.unscheduledPanel}>
            <h2 style={styles.panelTitle}>Needs Scheduling</h2>
            <div style={styles.unscheduledGrid}>
              {unscheduledOrders.map(({ order }) => (
                <Link key={order.id} to={editorHref(order.id)} style={styles.unscheduledCard}>
                  <strong>{getOrderNumber(order)} {order.customer}</strong>
                  <span>{getOrderAddress(order)}</span>
                  <small>{getLoadLabel(order) || "No material"}</small>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

const navBase: CSSProperties = {
  borderRadius: 16,
  color: "var(--calendar-text)",
  fontWeight: 800,
  padding: "14px 16px",
  textDecoration: "none",
};

const utilityBase: CSSProperties = {
  border: "1px solid var(--calendar-border)",
  borderRadius: 14,
  color: "var(--calendar-text)",
  fontWeight: 800,
  padding: "11px 14px",
  textDecoration: "none",
};

const styles: Record<string, CSSProperties> = {
  page: {
    ["--calendar-bg" as any]: "#020817",
    ["--calendar-panel" as any]: "rgba(15, 23, 42, 0.92)",
    ["--calendar-soft" as any]: "rgba(30, 41, 59, 0.92)",
    ["--calendar-text" as any]: "#f8fafc",
    ["--calendar-muted" as any]: "#94a3b8",
    ["--calendar-border" as any]: "rgba(56, 189, 248, 0.22)",
    ["--calendar-blue" as any]: "#38bdf8",
    ["--calendar-green" as any]: "#22c55e",
    background:
      "radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 32%), radial-gradient(circle at 85% 12%, rgba(132, 204, 22, 0.16), transparent 30%), linear-gradient(135deg, #020817 0%, #0f172a 52%, #08111f 100%)",
    color: "var(--calendar-text)",
    display: "flex",
    minHeight: "100vh",
  },
  loginPage: {
    ["--calendar-panel" as any]: "rgba(15, 23, 42, 0.94)",
    ["--calendar-text" as any]: "#f8fafc",
    ["--calendar-muted" as any]: "#94a3b8",
    ["--calendar-border" as any]: "rgba(56, 189, 248, 0.24)",
    alignItems: "center",
    background:
      "radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 32%), linear-gradient(135deg, #020817 0%, #0f172a 100%)",
    color: "#f8fafc",
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  loginCard: {
    background: "rgba(15, 23, 42, 0.94)",
    border: "1px solid rgba(56, 189, 248, 0.24)",
    borderRadius: 28,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.36)",
    maxWidth: 480,
    padding: 32,
    width: "100%",
  },
  loginTitle: { fontSize: 34, margin: "0 0 8px" },
  loginForm: { display: "grid", gap: 12, marginTop: 22 },
  sideRail: {
    background: "rgba(2, 8, 23, 0.84)",
    borderRight: "1px solid var(--calendar-border)",
    boxShadow: "18px 0 60px rgba(0, 0, 0, 0.22)",
    display: "flex",
    flexDirection: "column",
    gap: 22,
    minHeight: "100vh",
    padding: 22,
    position: "sticky",
    top: 0,
    width: 250,
  },
  brand: { alignItems: "center", display: "flex", gap: 12 },
  logo: { height: 52, objectFit: "contain", width: 52 },
  brandTitle: { fontSize: 18, fontWeight: 900 },
  brandSub: { color: "var(--calendar-muted)", fontSize: 12, fontWeight: 800 },
  nav: { display: "grid", gap: 8 },
  navLink: navBase,
  navLinkActive: {
    ...navBase,
    background: "linear-gradient(135deg, rgba(14, 165, 233, 0.26), rgba(34, 197, 94, 0.18))",
    border: "1px solid rgba(56, 189, 248, 0.42)",
    color: "#f8fafc",
  },
  footerNav: { display: "grid", gap: 8 },
  utility: utilityBase,
  workspace: { display: "grid", flex: 1, gap: 18, padding: 28 },
  header: {
    alignItems: "flex-start",
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 28,
    boxShadow: "0 18px 60px rgba(0, 0, 0, 0.28)",
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    padding: 28,
  },
  kicker: { color: "var(--calendar-blue)", fontSize: 13, fontWeight: 900, letterSpacing: 1.6, margin: 0, textTransform: "uppercase" },
  title: { fontSize: 38, lineHeight: 1, margin: "8px 0 10px" },
  subtle: { color: "var(--calendar-muted)", fontSize: 14, lineHeight: 1.45, margin: 0 },
  headerActions: { display: "flex", gap: 10 },
  toggle: {
    background: "rgba(2, 8, 23, 0.72)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 999,
    color: "var(--calendar-text)",
    cursor: "pointer",
    fontWeight: 900,
    padding: "12px 18px",
  },
  toggleActive: {
    background: "linear-gradient(135deg, #8cd400, #14b8d4)",
    border: "1px solid transparent",
    borderRadius: 999,
    color: "#07111f",
    cursor: "pointer",
    fontWeight: 900,
    padding: "12px 18px",
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
  },
  search: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 18,
    color: "var(--calendar-text)",
    flex: 1,
    fontSize: 15,
    minWidth: 240,
    padding: "14px 16px",
  },
  monthControls: { alignItems: "center", display: "flex", gap: 10 },
  monthLabel: { minWidth: 160, textAlign: "center" },
  smallButton: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 14,
    cursor: "pointer",
    color: "var(--calendar-text)",
    fontWeight: 900,
    padding: "12px 14px",
  },
  calendarPanel: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 26,
    overflow: "hidden",
  },
  weekHeader: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  weekDay: {
    background: "var(--calendar-soft)",
    borderBottom: "1px solid var(--calendar-border)",
    color: "var(--calendar-muted)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    padding: "12px 14px",
    textTransform: "uppercase",
  },
  calendarGrid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  day: {
    background: "rgba(2, 8, 23, 0.28)",
    borderBottom: "1px solid var(--calendar-border)",
    borderRight: "1px solid var(--calendar-border)",
    minHeight: 150,
    padding: 12,
  },
  dayMuted: {
    background: "rgba(15, 23, 42, 0.38)",
    borderBottom: "1px solid var(--calendar-border)",
    borderRight: "1px solid var(--calendar-border)",
    minHeight: 150,
    opacity: 0.48,
    padding: 12,
  },
  dayHeader: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  todayBadge: {
    alignItems: "center",
    background: "var(--calendar-blue)",
    borderRadius: 999,
    color: "#fff",
    display: "inline-flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  dayCount: {
    background: "rgba(34, 197, 94, 0.18)",
    borderRadius: 999,
    color: "#86efac",
    fontSize: 12,
    fontWeight: 900,
    padding: "4px 8px",
  },
  dayOrders: { display: "grid", gap: 7, marginTop: 10 },
  orderChip: {
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid var(--calendar-border)",
    borderLeft: "5px solid var(--calendar-blue)",
    borderRadius: 12,
    color: "var(--calendar-text)",
    display: "grid",
    gap: 2,
    padding: 9,
    textDecoration: "none",
  },
  moreChip: {
    color: "var(--calendar-muted)",
    fontSize: 12,
    fontWeight: 900,
    padding: "2px 4px",
  },
  listPanel: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 26,
    display: "grid",
    overflow: "hidden",
  },
  listRow: {
    alignItems: "center",
    borderBottom: "1px solid var(--calendar-border)",
    color: "var(--calendar-text)",
    display: "grid",
    gap: 16,
    gridTemplateColumns: "220px 1.5fr 1fr auto",
    padding: "16px 18px",
    textDecoration: "none",
  },
  listDate: { display: "block", marginBottom: 2 },
  statusPill: {
    background: "rgba(56, 189, 248, 0.16)",
    borderRadius: 999,
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: 900,
    padding: "7px 10px",
    textAlign: "center",
  },
  unscheduledPanel: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 26,
    padding: 22,
  },
  panelTitle: { fontSize: 22, margin: "0 0 14px" },
  unscheduledGrid: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" },
  unscheduledCard: {
    background: "rgba(251, 146, 60, 0.1)",
    border: "1px solid rgba(251, 146, 60, 0.35)",
    borderRadius: 16,
    color: "var(--calendar-text)",
    display: "grid",
    gap: 4,
    padding: 14,
    textDecoration: "none",
  },
  label: {
    color: "var(--calendar-muted)",
    display: "block",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    background: "rgba(2, 8, 23, 0.72)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 14,
    color: "var(--calendar-text)",
    fontSize: 16,
    padding: "13px 14px",
    width: "100%",
  },
  primaryButton: {
    background: "linear-gradient(135deg, #8cd400, #14b8d4)",
    border: 0,
    borderRadius: 16,
    color: "#07111f",
    cursor: "pointer",
    fontWeight: 900,
    padding: "14px 16px",
  },
  error: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    borderRadius: 12,
    color: "#991b1b",
    padding: 12,
  },
};
