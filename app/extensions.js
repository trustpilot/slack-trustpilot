const localtunnel = require('localtunnel');

module.exports = function (slackapp, config, port) {
  if (process.env.ENABLE_LOCAL_TUNNEL) {
    localtunnel(port, (err, tunnel) => {
      if (err) {
        throw err;
      }

      console.log('Tunnel started at', tunnel.url);

      tunnel.on('close', () => {
        console.error('Your tunnel was closed.');
        process.exit();
      });
    });
  }

  // Custom endpoint for External Webhooks from Trustpilot
  slackapp.webserver.post('/incoming-webhooks/:teamId', (req, res) => {
    const events = req.body.events;

    events.filter((e) => {
      return e.eventName === 'service-review-created';
    }).forEach((e) => {
      e.eventData.consumer.displayName = e.eventData.consumer.name; // Massaging into expected format
      slackapp.postNewReview(e.eventData, req.params.teamId);
    });

    res.sendStatus(200);
  });

  /*
  As of Botkit 0.6.8, we can't guarantee that our OAuth callback will have the last write on the team
  and set the businessUnitId. Because of callback hell in the /oauth handler, the following line might
  have the last say and blow away our changes (depending on storage engine used, but that's a detail)
  https://github.com/howdyai/botkit/blob/c21ec51cff18aa3b8617d4225de48e806ecf3c72/lib/SlackBot.js#L734
  So we use the create/update_team handlers to dirtily mutate the team object before that last write.
  */
  function dirtilyUpdateTeamWithBusinessUnitId(team) {
    team.businessUnitId = config.BUSINESS_UNIT_ID;
  }

  slackapp.on('create_team', (bot, team) => dirtilyUpdateTeamWithBusinessUnitId(team));
  slackapp.on('update_team', (bot, team) => dirtilyUpdateTeamWithBusinessUnitId(team));
};
