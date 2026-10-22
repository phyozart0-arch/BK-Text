// ============================================================
// BK TEXT — SERVICE WORKER v1.0.0
// Offline Support + Cache Management
// ============================================================

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `bktext-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `bktext-dynamic-${CACHE_VERSION}`;

// App Shell — Core files to cache on install
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json'
];

// External resources to cache (fonts, icons)
const EXTERNAL_CACHE = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Pyidaungsu:wght@400;700&display=swap'
];

// Domains to NEVER cache (Firebase, Ads, Tracking)
const NEVER_CACHE_DOMAINS = [
    'firebaseio.com',
    'firebaseapp.com',
    'googleapis.com',
    'gstatic.com',
    'adsterra.com',
    'acscdn.com',
    'profitableratecpmnetwork.com',
    'highrevenueformat.com',
    'monetag.com',
    'admaven.com',
    'ipapi.co',
    'imgbb.com',
    'i.ibb.co'
];

// ============================================================
// INSTALL — Cache App Shell
// ============================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...', CACHE_VERSION);
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching App Shell');
                return cache.addAll(APP_SHELL);
            })
            .then(() => {
                console.log('[SW] Caching External Resources');
                return caches.open(DYNAMIC_CACHE).then(cache => {
                    return Promise.all(
                        EXTERNAL_CACHE.map(url => 
                            cache.add(url).catch(err => 
                                console.log('[SW] Failed to cache:', url, err)
                            )
                        )
                    );
                });
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('[SW] Install failed:', err);
            })
    );
});

// ============================================================
// ACTIVATE — Clean Old Caches
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('bktext-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activate complete');
                return self.clients.claim();
            })
    );
});

// ============================================================
// FETCH — Network First with Cache Fallback
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Only handle GET requests
    if (request.method !== 'GET') return;
    
    const url = new URL(request.url);
    
    // Skip never-cache domains
    if (NEVER_CACHE_DOMAINS.some(domain => url.hostname.includes(domain))) {
        return;
    }
    
    // Skip chrome-extension, data URLs
    if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') {
        return;
    }
    
    // Navigation requests (HTML pages) — Network First
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request)
                        .then(cached => cached || caches.match('/index.html'));
                })
        );
        return;
    }
    
    // Other requests — Cache First, then Network
    event.respondWith(
        caches.match(request)
            .then(cached => {
                if (cached) {
                    // Return cached, update in background
                    fetch(request).then(response => {
                        if (response && response.status === 200) {
                            caches.open(DYNAMIC_CACHE).then(cache => {
                                cache.put(request, response);
                            });
                        }
                    }).catch(() => {});
                    
                    return cached;
                }
                
                // Not cached — fetch from network
                return fetch(request).then(response => {
                    // Don't cache non-OK responses or opaque responses
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(request, responseClone);
                    });
                    
                    return response;
                }).catch(err => {
                    console.log('[SW] Fetch failed:', err);
                    // Return offline placeholder if available
                    return new Response('Offline', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});

// ============================================================
// MESSAGE — Handle skipWaiting
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});