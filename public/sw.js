// DarijaSub service worker — handles push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "DarijaSub", {
      body:  data.body  ?? "",
      icon:  "/favicon.ico",
      badge: "/favicon.ico",
      data:  { url: data.url ?? "/dashboard/scheduler" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const target = data?.url ?? "/dashboard/scheduler";
        for (const client of clientList) {
          if (client.url.includes(target) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("https://darija-subtitle.vercel.app/dashboard/scheduler");
        }
      })
  );
});
