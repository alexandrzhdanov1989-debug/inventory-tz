const CACHE='inventory-tz-v2-yandex-test';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icon.svg','./yandex-test.html','./yandex-test.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inventory-tz-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 const url=new URL(e.request.url);
 if(url.pathname.endsWith('/')||url.pathname.endsWith('/index.html')){
   e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));return;
 }
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r})));
});
