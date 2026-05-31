import { io } from 'socket.io-client'

let socket = null

export function connectSocket(token) {
  if (socket?.connected) socket.disconnect()
  const SOCKET_URL = import.meta.env.VITE_API_BASE || 'http://localhost:5001'
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}

export function getSocket() { return socket }
