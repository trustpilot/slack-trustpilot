/*
 Storage engine for DynamoDB.

 To use this, make sure that the following environment variables are set:
 - BOTKIT_STORAGE_TYPE = dynamodb
 - DYNAMO_TABLE = <the name of your table>
 - AWS_DEFAULT_REGION
*/
const aws = require('aws-sdk');
const { promisify } = require('util');

const createStorage = (db, table, type) => {
  return {
    get: async (id, cb) => {
      try {
        const res = await db.getAsync({ TableName: table, Key: { type, id } });
        return cb(null, res.Item);
      } catch (e) {
        // no result found
        return cb(`No result found for ${id}: ${e.message}`, null);
      }
    },

    save: async (data, cb) => {
      try {
        const res = await db.putAsync({ TableName: table, Item: { type, ...data } });
        return cb(null, res);
      } catch (e) {
        return cb(e, null);
      }
    },
  };
};

const getStorage = () => {
  const db = new aws.DynamoDB.DocumentClient({ region: process.env.AWS_DEFAULT_REGION });
  db.getAsync = promisify(db.get);
  db.putAsync = promisify(db.put);

  const storage = {};
  ['teams', 'channels', 'users'].forEach((type) => {
    storage[type] = createStorage(db, process.env.DYNAMO_TABLE || 'botkit', type);
  });

  return storage;
};

module.exports = getStorage();
