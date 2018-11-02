module.exports = (slackapp) => {
  slackapp.webserver.post('/incoming-webhooks/:teamId', (req, res) => {
    const events = req.body.events;
    if (!events) {
      slackapp.log('Bad incoming webhook request', req);
      res.sendStatus(400);
    } else {
      const {
        params: { teamId },
        query: { businessUnitId },
      } = req;
      events
        .filter((e) => {
          return e.eventName === 'service-review-created';
        })
        .forEach((e) => {
          e.eventData.consumer.displayName = e.eventData.consumer.name; // Massaging into expected format
          slackapp.log(`Posting new review for team ${teamId}, business unit ${businessUnitId}`);
          slackapp.trigger('trustpilot_review_received', [
            {
              review: e.eventData,
              teamId,
              businessUnitId,
            },
          ]);
        });
      res.sendStatus(200);
    }
  });
};
