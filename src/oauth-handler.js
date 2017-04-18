module.exports = function (err, req, res) {
  if (err) {
    res.status(500).send(`ERROR: ${err}`);
  } else {
    console.info(`Use /incoming-webhooks/${req.identity.team_id} to receive new reviews.`);
    res.redirect(req.identity.url);
  }
};
