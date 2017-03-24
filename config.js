module.exports = {
  'SLACK_CLIENT_ID': process.env.SLACK_CLIENT_ID || 'Paste_your_Slack_client_ID_here',
  'SLACK_SECRET': process.env.SLACK_SECRET || 'Paste_your_Slack_secret_here',
  'VERIFICATION_TOKEN': process.env.VERIFICATION_TOKEN || 'Paste_your_Slack_verification_token_here',
  'API_KEY': process.env.API_KEY || 'Paste_your_Trustpilot_API_key_here',
  'API_SECRET': process.env.API_SECRET || 'Paste_your_Trustpilot_API_secret_here',
  'API_HOST': process.env.API_HOST || 'https://api.trustpilot.com',
  'BUSINESS_USER_NAME': process.env.BUSINESS_USER_NAME || 'Enter_your_Trustpilot_business_user_login_here',
  'BUSINESS_USER_PASS': process.env.BUSINESS_USER_PASS || 'Enter_your_Trustpilot_business_user_password_here',
  'BUSINESS_UNIT_ID': process.env.BUSINESS_UNIT_ID || 'Enter_your_Trustpilot_business_unit_ID_here'
};
