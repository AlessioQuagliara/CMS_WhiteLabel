(async () => {
  const io = require('socket.io-client');
  const serverUrl = 'http://localhost:3000';

  const userId = 2;
  const adminId = 2;

  const userSocket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3, timeout: 5000 });
  const adminSocket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3, timeout: 5000 });

  userSocket.on('connect', () => {
    console.log('user connected', userSocket.id);
    userSocket.emit('identify', { type: 'user', id: userId });
  });
  userSocket.on('connect_error', (err) => console.error('user connect_error', err && err.message));
  userSocket.on('error', (err) => console.error('user error', err));

  adminSocket.on('connect', () => {
    console.log('admin connected', adminSocket.id);
    adminSocket.emit('identify', { type: 'admin', id: adminId });
    // after identifying, admin sends a private message to user
    setTimeout(() => {
      console.log('admin emitting message:private -> user');
      adminSocket.emit('message:private', {
        fromType: 'admin',
        fromId: adminId,
        toType: 'user',
        toId: userId,
        message: 'Test E2E dal admin via socket',
        name: 'Admin Test',
        email: 'admin@test'
      });
    }, 800);
  });
  adminSocket.on('connect_error', (err) => console.error('admin connect_error', err && err.message));
  adminSocket.on('error', (err) => console.error('admin error', err));

  userSocket.on('message:receive', (data) => {
    console.log('user received message:receive', data);
    // close sockets gracefully
    setTimeout(() => {
      try { userSocket.close(); } catch(e) {}
      try { adminSocket.close(); } catch(e) {}
      process.exit(0);
    }, 200);
  });

  // timeout
  setTimeout(() => {
    console.error('timeout: no message received within 10s');
    try { userSocket.close(); } catch(e) {}
    try { adminSocket.close(); } catch(e) {}
    process.exit(1);
  }, 10000);
})();
