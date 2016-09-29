const bluebird = require("bluebird");

/* This App can run for one or many teams, so we do a bit of dependency injection
   to provide the correct Business Unit ID.
 */

module.exports = function(config) {
    if (!config.MULTI_TEAM) {
        return {
            getTeamBusinessUnitId : function() {
                return bluebird.resolve(config.BUSINESS_UNIT_ID);
            }
        };
    } else {
        var mongoClient = bluebird.promisifyAll(require("mongodb").MongoClient);
        var connection = mongoClient.connectAsync(config.MONGO_URL);
        return {
            getTeamBusinessUnitId : function(slackTeamName) {
                return connection.then(function(db) {
                    var collection = db.collection("teams");
                    bluebird.promisifyAll(collection);

                    return collection.findOneAsync({ id : slackTeamName }).then(function(item) {
                        return item.businessUnitId;
                    });
                });
            }
        };
    }
};