'use strict';

// Allow dependency injection of an extended client module
const Trustpilot = process.env.TRUSTPILOT_CLIENT_MODULE ?
  require(process.env.TRUSTPILOT_CLIENT_MODULE) :
  require('trustpilot');

module.exports = function (config) {

  const client = new Trustpilot({
    apiKey: config.API_KEY,
    secret: config.API_SECRET,
    username: config.BUSINESS_USER_NAME,
    password: config.BUSINESS_USER_PASS,
    baseUrl: config.API_HOST
  });
  const BUSINESS_UNIT_ID = config.BUSINESS_UNIT_ID;

  var ApiBridge = (() => {

    function privateRequest(options) {
      return client.authenticate().then((requestWrapper) => {
        return requestWrapper(options);
      });
    }

    return {
      getLastUnansweredReview: function ({stars, businessUnitId}) {
        var params = {
          orderBy: 'createdat.desc',
          responded: false
        };
        if (stars) {
          params.stars = stars;
        }
        businessUnitId = businessUnitId || BUSINESS_UNIT_ID;
        return privateRequest({
          method: 'GET',
          uri: `/v1/private/business-units/${businessUnitId}/reviews`,
          qs: params
        }).then((data) => {
          if (data.reviews.length > 0) {
            return data.reviews[0];
          }

          return null;
        });
      },

      replyToReview: function ({reviewId, message}) {
        return privateRequest({
          method: 'POST',
          uri: `/v1/private/reviews/${reviewId}/reply`,
          form: {
            message: message
          }
        });
      }
    };
  })();

  return ApiBridge;
};
