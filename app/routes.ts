import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),

  route("custom-quote", "routes/custom-quote.tsx"),
  route("quote-review", "routes/quote-review.tsx"),
  route("dispatch", "routes/dispatch.tsx"),
  route("classic", "routes/classic.tsx"),
  route("calendar", "routes/calendar.tsx"),
  route("allotment", "routes/allotment.tsx"),
  route("calendar.ics", "routes/calendar.ics.ts"),
  route("calendar-feed/:secret", "routes/calendar-feed.$secret.ts"),
  route("calendar.rss", "routes/calendar.rss.ts"),
  route("dispatch/driver", "routes/dispatch-driver.tsx"),
  route("dispatch/driver/detail", "routes/dispatch-driver-detail.tsx"),
  route("mobile", "routes/mobile-dashboard.tsx"),
  route("login", "routes/login.tsx"),
  route("change-password", "routes/change-password.tsx"),
  route("settings", "routes/settings.tsx"),

  route("auth/login", "routes/auth.login/route.tsx"),
  route("auth/*", "routes/auth.$.tsx"),

  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("admin", "routes/app.admin.tsx"),
    route("additional", "routes/app.additional.tsx"),
    route("custom-quote", "routes/app.custom-quote.tsx"),
    route("quote-review", "routes/app.quote-review.tsx"),
    route("dispatch", "routes/app.dispatch.tsx"),
    route("classic", "routes/app.classic.tsx"),
    route("calendar", "routes/app.calendar.tsx"),
    route("allotment", "routes/app.allotment.tsx"),
    route("dispatch/driver", "routes/app.dispatch-driver.tsx"),
    route("dispatch/driver/detail", "routes/app.dispatch-driver-detail.tsx"),
    route("mobile", "routes/app.mobile.tsx"),
  ]),

  route("api/shipping-estimate", "routes/api.shipping-estimate.ts"),
  route("api/carrier-service", "routes/api.carrier-service.ts"),
  route("api/sync-products", "routes/api.sync-products.ts"),
  route("api/create-draft-order", "routes/api.create-draft-order.ts"),
  route("api/delete-quote", "routes/api.delete-quote.ts"),
  route("api/update-quote", "routes/api.update-quote.ts"),
  route("api/dispatch-poll-mailbox", "routes/api.dispatch-poll-mailbox.ts"),
  route("api/dispatch-driver-location", "routes/api.dispatch-driver-location.ts"),

  route("app/api/shipping-estimate", "routes/app.api.shipping-estimate.ts"),
  route("app/api/carrier-service", "routes/app.api.carrier-service.ts"),
  route("app/api/create-draft-order", "routes/app.api.create-draft-order.ts"),
  route("app/api/delete-quote", "routes/app.api.delete-quote.ts"),
  route("app/api/update-quote", "routes/app.api.update-quote.ts"),

  route("webhooks/products/update", "routes/webhooks.products.update.ts"),
  route("webhooks/app/scopes_update", "routes/webhooks.app.scopes_update.tsx"),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
] satisfies RouteConfig;
