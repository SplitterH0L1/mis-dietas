/* Mis dietas: funciona sin conexión y recibe lo que se comparte desde Android. */
const VERSION = "mis-dietas-2026-10-15-1";
const COMPARTIDO = "mis-dietas-compartido";
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  const guardar = [VERSION, VERSION + "-fuentes", COMPARTIDO];
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => !guardar.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/compartir")) {
    e.respondWith(recibir(req));
    return;
  }
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    /* Primero la red, para tener siempre la última versión; sin conexión, la guardada. */
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put("./index.html", copia)); }
      return r;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + "-fuentes").then(async c => {
      const guardada = await c.match(req);
      const red = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => guardada || Response.error());
      return guardada || red;
    }));
  }
});

async function recibir(req) {
  const datos = await req.formData();
  const cache = await caches.open(COMPARTIDO);
  await cache.delete("compartido-archivo");
  await cache.delete("compartido-texto");
  const archivo = datos.get("archivo");
  if (archivo && typeof archivo !== "string" && archivo.size) {
    await cache.put("compartido-archivo", new Response(archivo, {
      headers: { "Content-Type": archivo.type || "application/octet-stream", "X-Nombre": encodeURIComponent(archivo.name || "archivo") },
    }));
  } else {
    const texto = [datos.get("text"), datos.get("title"), datos.get("url")].filter(x => typeof x === "string" && x.trim()).join("\n");
    await cache.put("compartido-texto", new Response(texto));
  }
  return Response.redirect(new URL("./?compartido=1", self.registration.scope).href, 303);
}
