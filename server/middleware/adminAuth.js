const jwt = require('jsonwebtoken');


const authenticateAdmin = (req, res, next) => {
  // Cerca il token nell'header, nel cookie o nella sessione
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  } else if (req.session && req.session.admin_token) {
    token = req.session.admin_token;
  }

  if (!token) {
    // Se la richiesta accetta HTML, fai redirect al login, altrimenti JSON
    if (req.accepts('html')) {
      return res.redirect('/admin/auth/login');
    } else {
      return res.status(401).json({ error: 'Token di accesso richiesto' });
    }
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (req.accepts('html')) {
        return res.redirect('/admin/auth/login');
      } else {
        return res.status(403).json({ error: 'Token non valido' });
      }
    }
    if (user.role !== 'admin') {
      if (req.accepts('html')) {
        return res.redirect('/admin/auth/login');
      } else {
        return res.status(403).json({ error: 'Accesso consentito solo agli amministratori' });
      }
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateAdmin };