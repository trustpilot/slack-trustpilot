const config = require('../config.js');

module.exports = (slackapp) =>
  function(err, req, res) {
    if (err) {
      res.status(500).send(`ERROR: ${err}`);
    } else {
      slackapp.log(
        `Use /incoming-webhooks/${req.identity.team_id}?businessUnitId=${
          config.BUSINESS_UNIT_ID
        } to receive new reviews.`
      );
      res.redirect(req.identity.url);
    }
  };
