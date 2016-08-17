const request_promise = require('request-promise');
const config = require('config.json');

const API_KEY            = config['API_KEY'];
const API_SECRET         = config['API_SECRET'];
const API_HOST           = config['API_HOST'];
const BUSINESS_USER_NAME = config['BUSINESS_USER_NAME'];
const BUSINESS_USER_PASS = config['BUSINESS_USER_PASS'];
const BUSINESS_UNIT_ID   = config['BUSINESS_UNIT_ID'];

function autoParse(body, response, resolveWithFullResponse) {
    if (response.headers['content-type']) {
        if (response.headers['content-type'].indexOf('application/json') == 0) {
            return JSON.parse(body);
        } else if (response.headers['content-type'].indexOf('text/html') == 0) {
            return $.load(body);
        }
    } else {
        return body;
    }
}

var ApiBridge = (function() {
    
    var baseRequest = request_promise.defaults({
        baseUrl: API_HOST,
        transform: autoParse
    });
    
    var requestWithApiKey = baseRequest.defaults({
        headers: {
            'apikey': API_KEY
        }
    });
    
    var tokenPromise = requestWithApiKey({
        method: 'GET',
        uri : '/v1/oauth/oauth-business-users-for-applications/accesstoken',
        auth : {
            'user' : API_KEY,
            'pass' : API_SECRET
        },
        form : {
            'grant_type': 'password',
            'username': BUSINESS_USER_NAME,
            'password': BUSINESS_USER_PASS
        }
    });
    
    function publicRequest(options) {
        return requestWithApiKey(options);
    }
    
    function privateRequest(options) {
        return tokenPromise.then(function(data) {
            options.auth = {
                bearer: data.access_token
            };
            return requestWithApiKey(options);
        });
    }
    
    return {
        getLastUnansweredReview : function(stars) {
            var params = {
                orderBy: 'createdat.desc',
                responded: false
            };
            if (stars) {
                params.stars = stars;
            }
            return privateRequest({
                method: 'GET',
                uri: `/v1/private/business-units/${BUSINESS_UNIT_ID}/reviews`,
                qs: params
            });
        },
        
        replyToReview : function(reviewId, message) {
            return privateRequest({
                method: 'POST',
                uri: `/v1/private/reviews/${reviewId}/reply`,
                form: {
                    message : message
                }
            });
        }
    };
})();

module.exports = ApiBridge;