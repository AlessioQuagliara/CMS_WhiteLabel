const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.user_token) {
    token = req.cookies.user_token;
  } else if (req.session && req.session.user_token) {
    token = req.session.user_token;
  }

  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    } else {
      return res.status(401).json({ error: 'Token di accesso richiesto' });
    }
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (req.accepts('html')) {
        return res.redirect('/auth/login');
      } else {
        return res.status(403).json({ error: 'Token non valido' });
      }
    }
    if (user.role !== 'user') {
      if (req.accepts('html')) {
        return res.redirect('/auth/login');
      } else {
        return res.status(403).json({ error: 'Accesso consentito solo agli utenti' });
      }
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };