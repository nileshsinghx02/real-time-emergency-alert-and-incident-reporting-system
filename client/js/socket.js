/* ===================================================================
   Socket.io Client — Real-time communication layer
   =================================================================== */

let socket = null;

function initSocket() {
  if (socket) return socket;

  const user = getUser();
  if (!user || !getToken()) return null;

  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    // Server requires a valid JWT in the handshake (io.use middleware)
    auth: { token: getToken() },
    query: { token: getToken() }
  });

  socket.on('connect', () => {
    console.log('⚡ Socket connected:', socket.id);
    // Rooms are joined server-side automatically; legacy no-op kept for compat
    socket.emit('joinRoom', { userId: user.id, role: user.role });
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket connection error:', err.message);
    // Invalid/expired token — stop retrying and force re-login
    if (err.message && (err.message.includes('Authentication') || err.message.includes('token'))) {
      disconnectSocket();
      clearAuth();
      window.location.href = '/';
    }
  });

  return socket;
}

function getSocket() {
  return socket;
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
