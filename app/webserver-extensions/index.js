/*
  This module extends the default behavior of botkit's web server.
*/
const localtunnel = require('./localtunnel');
const teamHandlers = require('./team-handlers');
const extraRoutes = require('./extra-routes');

module.exports = (slackapp, config, port) => {
  localtunnel(port);
  teamHandlers(slackapp, config);
  extraRoutes(slackapp);
};
