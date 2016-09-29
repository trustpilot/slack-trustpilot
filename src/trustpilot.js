"use strict";

const requestPromise = require("request-promise");
const bluebird = require("bluebird");

function autoParse(body, response) {
    if (response.headers["content-type"] && response.headers["content-type"].indexOf("application/json") === 0) {
        return JSON.parse(body);
    } else {
        return body;
    }
}

module.exports = function(config) {
    const API_KEY            = config.API_KEY;
    const API_SECRET         = config.API_SECRET;
    const API_TOKEN          = config.API_TOKEN;
    const API_HOST           = config.API_HOST;
    const BUSINESS_USER_NAME = config.BUSINESS_USER_NAME;
    const BUSINESS_USER_PASS = config.BUSINESS_USER_PASS;
    const BUSINESS_UNIT_ID   = config.BUSINESS_UNIT_ID;

    var ApiBridge = (function() {

        var baseRequest = requestPromise.defaults({
            baseUrl: API_HOST,
            transform: autoParse
        });

        var requestWithApiKey = baseRequest.defaults({
            headers: {
                "apikey": API_KEY
            }
        });

        var getSystemTokenPromise = function() {
            return requestWithApiKey({
                method: "POST",
                uri : config.SYSTEM_OAUTH_ENDPOINT,
                auth : {
                    "user" : API_KEY,
                    "pass" : API_SECRET
                },
                form : {
                    "grant_type": "client_credentials"
                }
            });
        };

        var getBusinessUserTokenPromise = function() {
            return requestWithApiKey({
                method: "GET",
                uri : "/v1/oauth/oauth-business-users-for-applications/accesstoken",
                auth : {
                    "user" : API_KEY,
                    "pass" : API_SECRET
                },
                form : {
                    "grant_type": "password",
                    "username": BUSINESS_USER_NAME,
                    "password": BUSINESS_USER_PASS
                }
            });
        };

        var tokenPromise;

        if (config.MULTI_TEAM) {
            tokenPromise = getSystemTokenPromise();
        } else {
            tokenPromise = getBusinessUserTokenPromise();
        }

        tokenPromise = tokenPromise.then(function(data) {
            return data.access_token;
        }).catch(function() {
            console.error("Something went wrong when setting up access to the Trustpilot APIs. Please check your API key and secret.");
        });

        function publicRequest(options) {
            return requestWithApiKey(options);
        }

        function privateRequest(options) {
            return tokenPromise.then(function(token) {
                options.auth = {
                    bearer: token
                };
                return requestWithApiKey(options);
            });
        }

        return {
            getLastUnansweredReview : function(stars, businessUnitId) {
                var params = {
                    orderBy: "createdat.desc",
                    responded: false
                };
                if (stars) {
                    params.stars = stars;
                }
                businessUnitId = businessUnitId || BUSINESS_UNIT_ID;
                return privateRequest({
                    method: "GET",
                    uri: `/v1/private/business-units/${businessUnitId}/reviews`,
                    qs: params
                });
            },

            replyToReview : function(reviewId, message) {
                return privateRequest({
                    method: "POST",
                    uri: `/v1/private/reviews/${reviewId}/reply`,
                    form: {
                        message : message
                    }
                });
            }
        };
    })();

    return ApiBridge;
};