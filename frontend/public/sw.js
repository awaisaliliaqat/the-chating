// THE CHATING — Service Worker
// Handles push notifications for messages and calls

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Push notification received (app closed/background) ─────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  let payload = {}
  try { payload = e.data.json() } catch { payload = { title:'THE CHATING', body: e.data.text() } }

  const title = payload.title || 'THE CHATING'
  const data  = payload.data  || {}
  const type  = data.type     || 'notification'

  const isCall    = type === 'incoming_call'
  const isMessage = type === 'new_message' || type === 'group_message'

  const options = {
    body:    payload.body || 'You have a new notification',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-72.png',
    tag:     type + '_' + (data.sender_id || data.group_id || Date.now()),
    data:    data,
    // Keep call notifications visible until tapped
    requireInteraction: isCall,
    // Strong vibration for calls, gentle for messages
    vibrate: isCall
      ? [400,150,400,150,400,150,400,150,400,150,400]
      : [200, 100, 200],
    // Action buttons
    actions: isCall
      ? [
          { action:'open',  title:'📞 Open App to Answer' },
        ]
      : [
          { action:'reply', title:'💬 Open Chat' },
          { action:'dismiss', title:'✕ Dismiss' },
        ],
    // Silent for messages if user set DND
    silent: false,
  }

  e.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification clicked ────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()

  const data    = e.notification.data || {}
  const action  = e.action
  const chatUrl = data.chat_url || '/'

  if (action === 'dismiss') return

  // Build the full URL to open
  const urlToOpen = self.location.origin + chatUrl

  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // If app is already open, focus it and navigate
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'navigate', url: chatUrl })
            return client.focus()
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(urlToOpen)
      })
  )
})

// ── Notification close (dismissed by user) ─────────────────────────────────
self.addEventListener('notificationclose', e => {
  // Track dismissals if needed
})
