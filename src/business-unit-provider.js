/*
This looks silly, but we want to be able to get a Business Unit Id by other means.
Here, we're just wrapping a promise around whatever is in the config, but you're free
to build your own business unit provider and inject it using the BUSINESS_UNIT_PROVIDER_SOURCE
environment variable (see index.js)
*/
module.exports = function (config) {
  return {
    getTeamBusinessUnitId: function () {
      return global.Promise.resolve(config.BUSINESS_UNIT_ID);
    }
  };
};