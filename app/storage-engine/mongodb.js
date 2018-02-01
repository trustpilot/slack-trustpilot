/*
 Storage engine for MongoDB.

 To use this, point the environment variable MONGO_URI to the URI for your Mongo cluster.
 Also make sure that the configuration variable BOTKIT_STORAGE_TYPE has the value 'mongodb'
*/
module.exports = require('botkit-storage-mongo')({
  mongoUri: process.env.MONGO_URI,
});
