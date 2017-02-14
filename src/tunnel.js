var localtunnel = require("localtunnel");

module.exports = function (webserver, port) {
    if (process.env.ENABLE_LOCAL_TUNNEL) {
        localtunnel(port, function (err, tunnel) {
            if (err) {
                throw err;
            }
            console.log("Tunnel started at", tunnel.url);

            tunnel.on("close", function () {
                console.error("Your tunnel was closed.");
                process.exit();
            });
        });
    }
};