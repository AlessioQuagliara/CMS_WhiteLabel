(async () => {
  const { io } = require('socket.io-client');
  const serverUrl = 'http://localhost:3000';

  const userId = 2;
  const adminId = 2;

  const userSocket = io(serverUrl, { transports: ['websocket'] });
  const adminSocket = io(serverUrl, { transports: ['websocket'] });

  userSocket.on('connect', () => {
    console.log('user connected', userSocket.id);
    userSocket.emit('identify', { type: 'user', id: userId });
  });
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
    }, 500);
  });

  userSocket.on('message:receive', (data) => {
    console.log('user received message:receive', data);
    // close sockets
    setTimeout(() => {
      userSocket.close();
      adminSocket.close();
      process.exit(0);
    }, 200);
  });

  // timeout
  setTimeout(() => {
    console.log('timeout: no message received');
    userSocket.close();
    adminSocket.close();
    process.exit(1);
  }, 5000);
})();
