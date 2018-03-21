module.exports = {
  // Minimal configuration needed
  'SLACK_CLIENT_ID': process.env.SLACK_CLIENT_ID || 'YOUR_SLACK_CLIENT_ID',
  'SLACK_SECRET': process.env.SLACK_SECRET || 'YOUR_SLACK_SECRET',
  'VERIFICATION_TOKEN': process.env.VERIFICATION_TOKEN || 'YOUR_VERIFICATION_TOKEN',
  'API_KEY': process.env.API_KEY || 'YOUR_TRUSTPILOT_API_KEY',
  'API_SECRET': process.env.API_SECRET || 'YOUR_TRUSTPILOT_API_SECRET',
  'BUSINESS_USER_NAME': process.env.BUSINESS_USER_NAME || 'YOUR_TRUSTPILOT_BUSINESS_USER_NAME',
  'BUSINESS_USER_PASS': process.env.BUSINESS_USER_PASS || 'YOUR_TRUSTPILOT_BUSINESS_USER_PASS',
  'BUSINESS_UNIT_ID': process.env.BUSINESS_UNIT_ID || 'YOUR_TRUSTPILOT_BUSINESS_UNIT_ID',

  // Extra configuration (storage etc.)
  'BOTKIT_STORAGE_TYPE': process.env.BOTKIT_STORAGE_TYPE || 'file',
  'PORT': process.env.PORT || '7142',
  'API_HOST': process.env.API_HOST || 'https://api.trustpilot.com',
  'ENABLE_LOCAL_TUNNEL': process.env.ENABLE_LOCAL_TUNNEL,
};
