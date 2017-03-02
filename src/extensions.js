var localtunnel = require("localtunnel");

module.exports = function (slackapp, port) {
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

    // Custom endpoint for External Webhooks from Trustpilot
    slackapp.webserver.post("/incoming-webhooks", function (req, res) {
        var events = req.body.events;
        events.filter(function (e) {
            return e.eventName === "service review created";
        }).forEach(function (e) {
            e.eventData.consumer.displayName = e.eventData.consumer.name; // Massaging into expected format
            slackapp.postNewReview(e.eventData);
        });
        res.sendStatus(200);
    });
};