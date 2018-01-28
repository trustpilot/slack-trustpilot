module.exports = function (slackapp) {
  // Custom endpoint for External Webhooks from Trustpilot
  slackapp.webserver.post('/incoming-webhooks/:teamId', (req, res) => {
    const events = req.body.events;

    events.filter((e) => {
      return e.eventName === 'service-review-created';
    }).forEach((e) => {
      e.eventData.consumer.displayName = e.eventData.consumer.name; // Massaging into expected format
      slackapp.postNewReview(e.eventData, req.params.teamId);
    });

    res.sendStatus(200);
  });
};
