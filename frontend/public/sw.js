// THE CHATING — Service Worker for Push Notifications

self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })

// Handle incoming push notifications (called even when app is closed)
self.addEventListener('push', e => {
  if (!e.data) return

  let payload = {}
  try { payload = e.data.json() } catch { payload = { title: 'THE CHATING', body: e.data.text() } }

  const title   = payload.title || 'THE CHATING'
  const options = {
    body:    payload.body  || 'You have a new notification',
    icon:    '/favicon.ico',
    badge:   '/favicon.ico',
    tag:     payload.data?.type || 'notification',
    data:    payload.data  || {},
    vibrate: [400,150,400,150,400,150,400,150,400,150,400,150,400,150,400],  // strong ring: trtrtrtrtrtrtrt
    actions: payload.data?.type === 'incoming_call' ? [
      { action: 'open', title: '📞 Open App' },
    ] : [],
    requireInteraction: payload.data?.type === 'incoming_call',  // keep visible for calls
  }

  e.waitUntil(self.registration.showNotification(title, options))
})

// Handle notification click
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = self.location.origin + '/'

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new window
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
