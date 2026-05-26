"use client"

const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
const scopes = [
  'app_mentions:read',
  'channels:read',
  'chat:write',
  'commands',
  'files:read',
  'files:write',
  'users:read',
  'groups:read',
];
const redirectUri = process.env.NEXT_PUBLIC_SLACK_REDIRECT_URL;

const Login = () => {
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes.join(',')}&redirect_uri=${encodeURIComponent(redirectUri + "/api/slack/oauth/callback")}`;

  return (
      <a href={slackAuthUrl} className="m-5">
        <button className="py-1 px-2 rounded-sm border-1 border-gray-50 hover:bg-gray-700">Add to Slack</button>
      </a>
  );
};

export default Login;
