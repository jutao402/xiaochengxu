// Bump the cache version whenever app assets change.
const PREFIX=`daily-${encodeURIComponent(self.registration.scope)}-`;
const CACHE=PREFIX+'v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./db.js','./data.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
// Do not skip waiting automatically: the page saves pending edits first.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    if(event.request.mode==='navigate')return (await cache.match('./index.html'))||fetch(event.request);
    const cached=await cache.match(event.request,{ignoreSearch:true});return cached||fetch(event.request);
  }));
});
