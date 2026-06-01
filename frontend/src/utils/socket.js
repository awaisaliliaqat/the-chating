import { io } from 'socket.io-client'

let socket = null

export function connectSocket(token) {
  if (socket?.connected) socket.disconnect()

  // Always use VITE_API_BASE in production — never localhost
  const SOCKET_URL = import.meta.env.VITE_API_BASE || window.location.origin

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['polling', 'websocket'],   // polling first = more compatible
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  })

  socket.on('connect_error', (err) => {
    console.warn('Socket connect error:', err.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}

export function getSocket() { return socket }
