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

function getTravelMinutes(order: DispatchOrder) {
  const minutes = Number(order.travelMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatTravelMinutes(minutes: number) {
  const rounded = Math.round(minutes);
  if (!rounded) return "0 min";
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
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
  const [expandedDayKeys, setExpandedDayKeys] = useState<string[]>([]);

  const isEmbeddedRoute = location.pathname.startsWith("/app/");
  const classicHref = isEmbeddedRoute ? "/app/classic" : "/classic";
  const calendarHref = isEmbeddedRoute ? "/app/calendar" : "/calendar";
  const allotmentHref = isEmbeddedRoute ? "/app/allotment" : "/allotment";
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

  const travelMinutesByDay = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const item of calendarOrders) {
      if (!item.date) continue;
      grouped.set(
        item.dateKey,
        (grouped.get(item.dateKey) || 0) + getTravelMinutes(item.order),
      );
    }
    return grouped;
  }, [calendarOrders]);

  const unscheduledOrders = calendarOrders.filter((item) => !item.date);
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

  function toggleDayExpanded(key: string) {
    setExpandedDayKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
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
          <Link to={allotmentHref} style={styles.navLink}>Allotment</Link>
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
            <a href="/calendar.rss" target="_blank" rel="noreferrer" style={styles.rssButton}>
              RSS Feed
            </a>
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
                const dayTravelMinutes = travelMinutesByDay.get(key) || 0;
                const expanded = expandedDayKeys.includes(key);
                const visibleOrders = expanded ? dayOrders : dayOrders.slice(0, 5);
                const muted = day.getMonth() !== cursorMonth.getMonth();
                const today = dateKey(day) === dateKey(new Date());
                return (
                  <div key={key} style={muted ? styles.dayMuted : styles.day}>
                    <div style={styles.dayHeader}>
                      <span style={today ? styles.todayBadge : undefined}>{day.getDate()}</span>
                      {dayOrders.length ? <span style={styles.dayCount}>{dayOrders.length}</span> : null}
                    </div>
                    {dayOrders.length ? (
                      <div style={styles.dayTotal}>
                        Total delivery time: {formatTravelMinutes(dayTravelMinutes)}
                      </div>
                    ) : null}
                    <div style={styles.dayOrders}>
                      {visibleOrders.map(({ order }) => (
                        <Link key={order.id} to={editorHref(order.id)} style={styles.orderChip}>
                          <strong>{getOrderNumber(order)}</strong>
                          <span>{order.customer}</span>
                          <small>{getLoadLabel(order)}</small>
                        </Link>
                      ))}
                      {dayOrders.length > 5 ? (
                        <button
                          type="button"
                          onClick={() => toggleDayExpanded(key)}
                          style={styles.moreChip}
                        >
                          {expanded ? "Show less" : `+${dayOrders.length - 5} more`}
                        </button>
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
    ["--calendar-bg" as any]: "#020617",
    ["--calendar-panel" as any]: "#0f172a",
    ["--calendar-soft" as any]: "#111827",
    ["--calendar-text" as any]: "#f8fafc",
    ["--calendar-muted" as any]: "#94a3b8",
    ["--calendar-border" as any]: "#334155",
    ["--calendar-blue" as any]: "#38bdf8",
    ["--calendar-green" as any]: "#22c55e",
    background: "#020617",
    color: "var(--calendar-text)",
    display: "flex",
    minHeight: "100vh",
  },
  loginPage: {
    ["--calendar-panel" as any]: "#0f172a",
    ["--calendar-text" as any]: "#f8fafc",
    ["--calendar-muted" as any]: "#94a3b8",
    ["--calendar-border" as any]: "#334155",
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
    boxShadow: "none",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: "100vh",
    padding: "16px 14px",
    position: "sticky",
    top: 0,
    width: 250,
  },
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
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 0,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    padding: "14px 16px",
  },
  kicker: { color: "#e85d04", fontSize: 12, fontWeight: 900, letterSpacing: 1.6, margin: 0, textTransform: "uppercase" },
  title: { fontSize: 28, lineHeight: 1, margin: "8px 0 10px" },
  subtle: { color: "var(--calendar-muted)", fontSize: 14, lineHeight: 1.45, margin: 0 },
  headerActions: { display: "flex", gap: 10 },
  toggle: {
    background: "#0f172a",
    border: "1px solid var(--calendar-border)",
    borderRadius: 999,
    color: "var(--calendar-text)",
    cursor: "pointer",
    fontWeight: 900,
    padding: "12px 18px",
  },
  toggleActive: {
    background: "linear-gradient(180deg, #ff9b25, #ff6b00)",
    border: "1px solid #ff7a1a",
    borderRadius: 999,
    color: "#fff7ed",
    cursor: "pointer",
    fontWeight: 900,
    padding: "12px 18px",
  },
  rssButton: {
    alignItems: "center",
    background: "#0f172a",
    border: "1px solid #f97316",
    borderRadius: 999,
    color: "#e85d04",
    display: "inline-flex",
    fontWeight: 900,
    padding: "12px 18px",
    textDecoration: "none",
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
    borderRadius: 999,
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
    borderRadius: 999,
    cursor: "pointer",
    color: "var(--calendar-text)",
    fontWeight: 900,
    padding: "12px 14px",
  },
  calendarPanel: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 0,
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
    background: "#0f172a",
    borderBottom: "1px solid var(--calendar-border)",
    borderRight: "1px solid var(--calendar-border)",
    minHeight: 150,
    padding: 12,
  },
  dayMuted: {
    background: "#111827",
    borderBottom: "1px solid var(--calendar-border)",
    borderRight: "1px solid var(--calendar-border)",
    minHeight: 150,
    opacity: 0.48,
    padding: 12,
  },
  dayHeader: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  dayTotal: {
    color: "var(--calendar-blue)",
    fontSize: 12,
    fontWeight: 900,
    marginTop: 8,
  },
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
    background: "#0b1220",
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
    background: "transparent",
    border: "1px dashed var(--calendar-border)",
    borderRadius: 10,
    color: "var(--calendar-muted)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 900,
    padding: "7px 8px",
    textAlign: "left",
  },
  listPanel: {
    background: "var(--calendar-panel)",
    border: "1px solid var(--calendar-border)",
    borderRadius: 0,
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
    borderRadius: 0,
    padding: 22,
  },
  panelTitle: { fontSize: 22, margin: "0 0 14px" },
  unscheduledGrid: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" },
  unscheduledCard: {
    background: "rgba(249, 115, 22, 0.12)",
    border: "1px solid rgba(249, 115, 22, 0.35)",
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
    background: "#020617",
    border: "1px solid var(--calendar-border)",
    borderRadius: 14,
    color: "var(--calendar-text)",
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
