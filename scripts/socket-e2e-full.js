(async () => {
  const io = require('socket.io-client');
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

  const userId = 2;
  const adminId = 2;

  const userSocket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3, timeout: 5000 });
  const adminSocket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3, timeout: 5000 });

  let userGotAdmin = false;
  let adminGotUser = false;

  function finish(success) {
    try { userSocket.close(); } catch(e) {}
    try { adminSocket.close(); } catch(e) {}
    process.exit(success ? 0 : 1);
  }

  userSocket.on('connect', () => {
    console.log('user connected', userSocket.id);
    userSocket.emit('identify', { type: 'user', id: userId });
  });
  userSocket.on('connect_error', (err) => console.error('user connect_error', err && err.message));
  userSocket.on('error', (err) => console.error('user error', err));

  adminSocket.on('connect', () => {
    console.log('admin connected', adminSocket.id);
    adminSocket.emit('identify', { type: 'admin', id: adminId });
  });
  adminSocket.on('connect_error', (err) => console.error('admin connect_error', err && err.message));
  adminSocket.on('error', (err) => console.error('admin error', err));

  // admin -> user
  userSocket.on('message:receive', (data) => {
    console.log('user received message:receive', data);
    if (data && data.fromType === 'admin') {
      userGotAdmin = true;
      // after receiving admin->user, send user->admin
      setTimeout(() => {
        console.log('user emitting message:private -> admin');
        userSocket.emit('message:private', {
          fromType: 'user',
          fromId: userId,
          toType: 'admin',
          toId: adminId,
          message: 'Test E2E user->admin via socket',
          name: 'User Test',
          email: 'user@test'
        });
      }, 300);
    }
  });

  // admin receives user->admin
  adminSocket.on('message:receive', (data) => {
    console.log('admin received message:receive', data);
    if (data && data.fromType === 'user') {
      adminGotUser = true;
      // both directions succeeded
      console.log('Both directions succeeded');
      finish(true);
    }
  });

  // when both connected, admin sends first message
  let bothConnected = false;
  function trySendAdmin() {
    if (userSocket.connected && adminSocket.connected && !bothConnected) {
      bothConnected = true;
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
      }, 300);
    }
  }

  userSocket.on('connect', trySendAdmin);
  adminSocket.on('connect', trySendAdmin);

  // overall timeout
  setTimeout(() => {
    console.error('timeout: full E2E did not complete (userGotAdmin=' + userGotAdmin + ', adminGotUser=' + adminGotUser + ')');
    finish(false);
  }, 15000);
})();
