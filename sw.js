const CACHE_NAME = 'weather-pwa-cache-v1.9';
const APP_SHELL_FILES = [
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './offline.html',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './views/home.html',
    './views/favorites.html',
    './views/settings.html',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2'
];
const OPENWEATHER_API_DOMAIN = 'api.openweathermap.org';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                const promises = APP_SHELL_FILES.map(url => {
                    return cache.add(url).catch(err => {
                        console.warn(`[SW] Failed to add to cache during install: ${url}`, err);
                    });
                });
                return Promise.all(promises);
            })
            .then(() => self.skipWaiting())
            .catch(error => {
                console.error('[SW] Error during installation and App Shell caching:', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && (cacheName.startsWith('weather-pwa-cache-') || cacheName.startsWith('pogoda-pwa-cache-'))) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.hostname === OPENWEATHER_API_DOMAIN) {
        event.respondWith(fetch(event.request).catch(() => {
            console.warn('[SW] API request to OpenWeather failed (network error at SW level).');
            return new Response(null, { status: 503, statusText: 'Service Unavailable (Network Error in SW)' });
        }));
        return; 
    }
    
    const isAppShellOrCdn = APP_SHELL_FILES.some(shellUrl => {
        const localShellUrl = shellUrl.startsWith('./') ? shellUrl.substring(2) : shellUrl;
        return requestUrl.pathname.endsWith(localShellUrl);
    }) || requestUrl.href.startsWith('https://cdn.tailwindcss.com') ||
       requestUrl.href.startsWith('https://fonts.googleapis.com') ||
       requestUrl.href.startsWith('https://fonts.gstatic.com');


    if (isAppShellOrCdn) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    const isCdnOrFont = requestUrl.href.startsWith('https://cdn.tailwindcss.com') ||
                                        requestUrl.href.startsWith('https://fonts.googleapis.com') ||
                                        requestUrl.href.startsWith('https://fonts.gstatic.com');

                    if (isCdnOrFont) { 
                        const networkFetch = fetch(event.request).then(networkResponse => {
                            if (networkResponse && networkResponse.ok) {
                                const responseToCache = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                            }
                            return networkResponse;
                        }).catch(err => {
                            console.warn(`[SW] Network fetch error (SWR): ${event.request.url}`, err);
                        });
                        return cachedResponse || networkFetch;
                    }
                    
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.ok) {
                            const isLocalAppShellFile = APP_SHELL_FILES.some(shellPath => requestUrl.pathname.endsWith(shellPath.replace('./', '')));
                            if(isLocalAppShellFile){
                                const responseToCache = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                            }
                        }
                        return networkResponse;
                    });
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./offline.html'); 
                    }
                })
        );
    }
    else if (requestUrl.hostname === 'openweathermap.org' && requestUrl.pathname.startsWith('/img/wn/')) {
         event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    return cachedResponse || fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    }).catch(err => {
                        console.warn(`[SW] Failed to fetch weather icon: ${event.request.url}`, err);
                    });
                })
        );
    }
});
