'use strict';
/*
    Entry point of this app, sets us up and running from config and env variables
*/

const path = require('path');
const config = require(path.resolve(__dirname, './config.js'));

if (!config.SLACK_CLIENT_ID || !config.SLACK_SECRET) {
  console.log(`Sorry, you need to give me this app's credentials. Please configure
 SLACK_CLIENT_ID and SLACK_SECRET in config.js`);

  process.exit(-1);
}

const PORT = process.env.PORT || 7142;

// Allows dependency injection (injected modules need to be in the same directory as this source)
const OAUTH_HANDLER_SOURCE = process.env.OAUTH_HANDLER_SOURCE || 'oauth-handler.js';
const WEBSERVER_EXTENSIONS_SOURCE = process.env.WEBSERVER_EXTENSIONS_SOURCE || 'extensions.js';
const STORAGE_MIDDLEWARE_SOURCE = process.env.STORAGE_MIDDLEWARE_SOURCE || 'no-storage.js';

var oAuthHandler = require(path.resolve(__dirname, `./${OAUTH_HANDLER_SOURCE}`));
var serverExtensions = require(path.resolve(__dirname, `./${WEBSERVER_EXTENSIONS_SOURCE}`));
var storage = require(path.resolve(__dirname, `./${STORAGE_MIDDLEWARE_SOURCE}`));

var trustpilotApi = require(path.resolve(__dirname, './trustpilotApi.js'))(config);
var slackapp = require(path.resolve(__dirname, './slackapp.js'))(config, trustpilotApi, storage);

// Set up a web server to expose oauth and webhook endpoints
slackapp.setupWebserver(PORT, () => {
  // Middleware mounting and the like needs to happen before we set up the endpoints
  serverExtensions(slackapp, config, PORT);
  slackapp.createWebhookEndpoints(slackapp.webserver, config.VERIFICATION_TOKEN);
  slackapp.createOauthEndpoints(slackapp.webserver, oAuthHandler);
});
