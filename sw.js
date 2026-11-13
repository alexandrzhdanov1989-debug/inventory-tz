// v6: network-first for pages and diagnostics, cache-first for stable offline assets.
// OAuth and Yandex API are on other origins and never intercepted.
const CACHE='inventory-tz-v6-oauth-navigation';
const STATIC=['./','./index.html','./app.js','./style.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('inventory-tz-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  const dynamic=req.mode==='navigate'||/\/(?:index|yandex-test|yandex-meta-test)\.(?:html|js)$/.test(url.pathname)||url.pathname.endsWith('/');
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(!dynamic){const hit=await cache.match(req,{ignoreSearch:true});if(hit)return hit;}
    try{
      const response=await fetch(req);
      if(response.ok&&response.type==='basic'){
        const copy=response.clone();
        event.waitUntil(cache.put(req,copy).catch(()=>{}));
      }
      return response;
    }catch(e){
      const hit=await cache.match(req,{ignoreSearch:true});
      if(hit)return hit;
      if(req.mode==='navigate'){const home=await cache.match('./index.html');if(home)return home;}
      throw e;
    }
  })());
});
