/*
  This module extends the default behavior of botkit's web server.
*/
const localtunnel = require('./localtunnel');
const teamHandlers = require('./team-handlers');
const extraRoutes = require('./extra-routes');
const oAuthCallback = require('./oauth-callback');

module.exports = (slackapp, config) => {
  if (config.ENABLE_LOCAL_TUNNEL) {
    localtunnel(config.PORT);
  }
  teamHandlers(slackapp, config);
  extraRoutes(slackapp);

  return {
    oAuthCallback: oAuthCallback(slackapp),
  };
};
