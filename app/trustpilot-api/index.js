const Trustpilot = require('trustpilot');
const apiBridge = require('./api-bridge');

module.exports = function (config) {

  const client = new Trustpilot({
    apiKey: config.API_KEY,
    secret: config.API_SECRET,
    username: config.BUSINESS_USER_NAME,
    password: config.BUSINESS_USER_PASS,
    baseUrl: config.API_HOST,
  });

  return apiBridge(client);
};
