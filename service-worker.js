const CACHE_NAME = 'uke-trainer-v2';
const FILES_TO_CACHE = ['index.html','styles.css','app_v2.js','songs.json','chords.json','manifest.json'];
self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', evt=>{evt.waitUntil(self.clients.claim());});
self.addEventListener('fetch', evt=>{evt.respondWith(caches.match(evt.request).then(resp=>resp||fetch(evt.request)));});
