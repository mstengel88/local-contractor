self.addEventListener("push", (event) => {
  let payload = {
    title: "New loader assignment",
    body: "Open Loader View to see the next load.",
    url: "/loader",
    tag: "loader-load-next",
  };

  try {
    payload = {
      ...payload,
      ...(event.data ? event.data.json() : {}),
    };
  } catch {
    // Keep the generic safe payload if parsing fails.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "New loader assignment", {
      body: payload.body || "Open Loader View to see the next load.",
      icon: "/green-hills-logo.png",
      badge: "/green-hills-logo.png",
      tag: payload.tag || "loader-load-next",
      renotify: true,
      requireInteraction: true,
      data: {
        url: payload.url || "/loader",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/loader";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.includes(targetUrl)) {
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
