module.exports = function(slackapp, config) {
  /*
  As of Botkit 0.7.0, we can't guarantee that our OAuth callback will have the last write on the team
  and set the businessUnitId. Because of callback hell in the /oauth handler, the following line might
  have the last say and blow away our changes (depending on storage engine used, but that's a detail)
  https://github.com/howdyai/botkit/blob/c21ec51cff18aa3b8617d4225de48e806ecf3c72/lib/SlackBot.js#L734
  So we use the create/update_team handlers to dirtily mutate the team object before that last write.
  */
  function dirtilyUpdateTeamWithBusinessUnitId(team) {
    const setOfUnits = new Set(team.businessUnits);
    setOfUnits.add(config.BUSINESS_UNIT_ID);
    team.businessUnits = [...setOfUnits.values()];
  }

  slackapp.on('create_team', (bot, team) => dirtilyUpdateTeamWithBusinessUnitId(team));
  slackapp.on('update_team', (bot, team) => dirtilyUpdateTeamWithBusinessUnitId(team));
};
