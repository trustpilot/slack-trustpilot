var localtunnel = require('localtunnel');

module.exports = function (slackapp, port) {
    if (process.env.ENABLE_LOCAL_TUNNEL) {
        localtunnel(port, (err, tunnel) => {
            if (err) {
                throw err;
            }
            console.log('Tunnel started at', tunnel.url);

            tunnel.on('close', () => {
                console.error('Your tunnel was closed.');
                process.exit();
            });
        });
    }

    // Custom endpoint for External Webhooks from Trustpilot
    slackapp.webserver.post('/incoming-webhooks/:teamId', (req, res) => {
        var events = req.body.events;
        events.filter((e) => {
            return e.eventName === 'service review created';
        }).forEach((e) => {
            e.eventData.consumer.displayName = e.eventData.consumer.name; // Massaging into expected format
            slackapp.postNewReview(e.eventData, req.params.teamId);
        });
        res.sendStatus(200);
    });
};