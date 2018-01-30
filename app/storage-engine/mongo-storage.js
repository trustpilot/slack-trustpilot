/*
 Storage engine for MongoDB.

 To use this, point the environment variable MONGO_URI to the URI for your Mongo cluster.
 Then, edit the storage-engine/index.js file so that it has the following code:

 module.exports = require('./mongo-storage');
*/
module.exports = require('botkit-storage-mongo')({
  mongoUri: process.env.MONGO_URI,
});
