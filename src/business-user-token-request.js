module.exports = function (config) {
    return {
        method: "GET",
        uri: "/v1/oauth/oauth-business-users-for-applications/accesstoken",
        auth: {
            "user": config.API_KEY,
            "pass": config.API_SECRET
        },
        form: {
            "grant_type": "password",
            "username": config.BUSINESS_USER_NAME,
            "password": config.BUSINESS_USER_PASS
        }
    };
};