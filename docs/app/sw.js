/* Kosto: permite instalar la versión web como aplicación y abrirla más rápido. */
const CACHE = "kosto-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const esMotor = url.hostname === "cdn.jsdelivr.net" || url.hostname === "files.pythonhosted.org" || url.hostname === "pypi.org";
  const esPropio = url.origin === self.location.origin;
  if (!esMotor && !esPropio) return;
  if (esMotor) {
    // El motor no cambia: primero la copia guardada (abre mucho más rápido)
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const g = await c.match(req);
      if (g) return g;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
  } else {
    // Archivos de Kosto: primero la red (siempre la última versión), copia guardada si no hay internet
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req)));
  }
});
