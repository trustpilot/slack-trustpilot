/*
 Storage layer for MongoDB. To use this, point the environment variable
 STORAGE_MIDDLEWARE_SOURCE to "mongo-storage.js" (this file), and MONGO_URI to
 the URI for your Mongo cluster.
*/
module.exports = require('botkit-storage-mongo')({ mongoUri: process.env.MONGO_URI });