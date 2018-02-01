/*
 Storage engine for DynamoDB.

 To use this, make sure that the following environment variables are set:
 - BOTKIT_STORAGE_TYPE = dynamodb
 - DYNAMO_TABLE = <the name of your table>
 - AWS_DEFAULT_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY: your usual AWS credentials
*/
module.exports = require('botkit-storage-dynamodb')({
  dynamoTable: process.env.DYNAMO_TABLE,
  dynamoRegion: process.env.AWS_DEFAULT_REGION,
  dynamoAccessKey: process.env.AWS_ACCESS_KEY_ID,
  dynamoAccessSecret: process.env.AWS_SECRET_ACCESS_KEY,
});
