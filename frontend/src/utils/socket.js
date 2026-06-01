import { io } from 'socket.io-client'

let socket = null

export function connectSocket(token) {
  if (socket?.connected) socket.disconnect()

  // Works from any domain automatically
  const SOCKET_URL = import.meta.env.VITE_API_BASE
    || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? window.location.origin
        : 'http://localhost:5001')

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
