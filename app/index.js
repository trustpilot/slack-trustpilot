/*
    Entry point of this app, sets us up and running from config and env variables
*/

const ApiClient = require('./api-client');
const StorageEngine = require('./storage-engine');
const SlackApp = require('./slackapp');

const run = (config, trustpilotClient, webserverExtensions) => {
  if (!config.SLACK_CLIENT_ID || !config.SLACK_SECRET || !config.SLACK_SIGNING_SECRET) {
    console.log(`Sorry, you need to give me this app's credentials. Please configure
    SLACK_CLIENT_ID, SLACK_SECRET and SLACK_SIGNING_SECRET in config.js`);

    process.exit(-1);
  }

  const apiClient = ApiClient(trustpilotClient);
  const storageEngine = StorageEngine(config.BOTKIT_STORAGE_TYPE);
  const slackapp = SlackApp(config, apiClient, storageEngine);

  // Set up a web server to expose oauth and webhook endpoints
  slackapp.setupWebserver(config.PORT, () => {
    // Middleware mounting and the like needs to happen before we set up the endpoints
    const { oAuthCallback } = webserverExtensions(slackapp, config);
    slackapp.createWebhookEndpoints(slackapp.webserver);
    slackapp.createOauthEndpoints(slackapp.webserver, oAuthCallback);
  });
};

if (require.main !== module) {
  module.exports = run;
} else {
  /* eslint-disable global-require */
  const config = require('./config.js');
  const webserverExtensions = require('./webserver-extensions');
  const Trustpilot = require('trustpilot');
  /* eslint-enable global-require */

  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
  });

  const trustpilotClient = new Trustpilot.TrustpilotApi({
    key: config.API_KEY,
    secret: config.API_SECRET,
    username: config.BUSINESS_USER_NAME,
    password: config.BUSINESS_USER_PASS,
    baseUrl: config.API_HOST,
  });

  run(config, trustpilotClient, webserverExtensions);
}
