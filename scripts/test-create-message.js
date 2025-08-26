(async () => {
  try {
    const Message = require('../server/models/Message');
    // Insert a test message with a from_user_id set
    const inserted = await Message.create({
      from_user_id: 2,
      to_admin_id: 2,
      name: 'Test User',
      email: 'test@example.com',
      message: 'Prova insert with from_user_id',
      ip: '127.0.0.1'
    });
    console.log('Inserted:', inserted);

    // Insert a test message without sender ids (should trigger warning)
    const inserted2 = await Message.create({
      name: 'Orphan',
      email: 'orphan@example.com',
      message: 'Prova orphan insert',
      ip: '127.0.0.1'
    });
    console.log('Inserted orphan:', inserted2);

    // Query last 5 rows
    const db = require('../server/config/database');
    const rows = await db('messages').select('id','from_user_id','from_admin_id','to_admin_id','to_user_id','message','created_at').orderBy('id','desc').limit(5);
    console.log('Last rows:', rows);
    process.exit(0);
  } catch (err) {
    console.error('Error in test script:', err);
    process.exit(1);
  }
})();
