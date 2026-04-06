function isAuth(req, res, next) {
  if (req.user || req.session.user) {
    return next();
  }
  return res.redirect("/signin");
}

module.exports = isAuth;