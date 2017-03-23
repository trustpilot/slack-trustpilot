'use strict';

const requestPromise = require('request-promise');

module.exports = function (config, tokenRequest) {
  const API_KEY = config.API_KEY;
  const API_HOST = config.API_HOST;
  const BUSINESS_UNIT_ID = config.BUSINESS_UNIT_ID;

  var baseRequest = requestPromise.defaults({
    baseUrl: API_HOST,
    json: true
  });

  var requestWithApiKey = baseRequest.defaults({
    headers: {
      'apikey': API_KEY
    }
  });

  var ApiBridge = (() => {
    var authorization;

    function isAuthValid() {
      if (!authorization) {
        return false;
      }
      var shouldExpireBy = parseInt(authorization.issued_at) + parseInt(authorization.expires_in);
      var now = new Date().getTime();

      if (now > (shouldExpireBy - 3600)) {
        return false;
      }

      return true;
    }

    function getFreshToken() {
      if (isAuthValid()) {
        return global.Promise.resolve(authorization);
      } else {
        return requestWithApiKey(tokenRequest).then((data) => {
          authorization = data;
          return authorization;
        }).catch(() => {
          console.error('Something went wrong when setting up access to the Trustpilot APIs. Please check your API key and secret.');
        });
      }
    }

    function privateRequest(options) {
      return getFreshToken().then((data) => {
        options.auth = {
          bearer: data.access_token
        };

        return requestWithApiKey(options);
      });
    }

    return {
      getLastUnansweredReview: function (stars, businessUnitId) {
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

      replyToReview: function (reviewId, message) {
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
