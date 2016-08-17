var localtunnel = require("localtunnel");

module.exports = function (port) {
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
};