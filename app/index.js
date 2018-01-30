/*
    Entry point of this app, sets us up and running from config and env variables
*/

const config = require('./config.js');

if (!config.SLACK_CLIENT_ID || !config.SLACK_SECRET) {
  console.log(`Sorry, you need to give me this app's credentials. Please configure
 SLACK_CLIENT_ID and SLACK_SECRET in config.js`);

  process.exit(-1);
}

const trustpilotApi = require('./trustpilot-api')(config);
const storageEngine = require('./storage-engine');
const slackapp = require('./slackapp.js')(config, trustpilotApi, storageEngine);
const webserverExtensions = require('./webserver-extensions');

const PORT = process.env.PORT || 7142;

// Set up a web server to expose oauth and webhook endpoints
slackapp.setupWebserver(PORT, () => {
  // Middleware mounting and the like needs to happen before we set up the endpoints
  const {
    oAuthCallback,
  } = webserverExtensions(slackapp, config, PORT);
  slackapp.createWebhookEndpoints(slackapp.webserver, config.VERIFICATION_TOKEN);
  slackapp.createOauthEndpoints(slackapp.webserver, oAuthCallback);
});
