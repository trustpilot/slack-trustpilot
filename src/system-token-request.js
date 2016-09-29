module.exports = function (config) {
    return {
        method: "POST",
        uri: "/v1/oauth/system-users/token",
        auth: {
            "user": config.API_KEY,
            "pass": config.API_SECRET
        },
        form: {
            "grant_type": "client_credentials"
        }
    };
};