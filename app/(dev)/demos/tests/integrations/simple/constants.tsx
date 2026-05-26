import { Integration } from './types';
import { 
  FaGoogle, FaSlack, FaGithub, FaDropbox, FaMicrosoft, 
  FaTrello, FaJira, FaMailchimp, 
  FaHubspot, FaIntercom, FaStripe, FaPaypal, FaAws,
  FaTwitter, FaFacebook, FaLinkedin, FaInstagram, FaYoutube,
  FaShopify, FaWordpress, FaWix, FaSquarespace, 
  FaEvernote, FaDiscord
} from 'react-icons/fa';
import { 
  SiNotion, SiBox, SiAirtable, SiSalesforce, SiZapier, 
   SiClickup, SiLinear, SiTwilio, 
  SiMailgun, SiPostman,  SiMixpanel,
  SiGoogleanalytics, SiGoogleads, SiGooglecloud, 
  SiDigitalocean, SiHeroku, SiNetlify, SiVercel, SiFirebase,
  SiRedis, SiMongodb, SiPostgresql, SiMysql, SiElasticsearch,
  SiFigma
} from 'react-icons/si';
import { CgMonday } from "react-icons/cg";
import { BiLogoZoom } from "react-icons/bi";
import { SiAsana } from "react-icons/si";
import { SiBrevo } from "react-icons/si";
import { SiQuickbooks } from "react-icons/si";
import { SiXero } from "react-icons/si";
import { VscAzure } from "react-icons/vsc";
import { GiAmplitude } from "react-icons/gi";
import { MdOutlineSegment } from "react-icons/md";
import { MdAttachMoney } from "react-icons/md";

export const CATEGORIES = {
  PRODUCTIVITY: 'Productivity',
  COMMUNICATION: 'Communication',
  DEVELOPMENT: 'Development',
  STORAGE: 'Storage',
  MARKETING: 'Marketing & Sales',
  PAYMENTS: 'Payments & Finance',
  ANALYTICS: 'Analytics & Data',
  SOCIAL: 'Social Media',
  CMS: 'Content Management',
  CLOUD: 'Cloud Services',
  DATABASE: 'Databases'
};

export const INTEGRATIONS: Integration[] = [
  // Productivity
  { id: 'google-workspace', name: 'Google Workspace', icon: FaGoogle, description: 'Connect your Google account for Docs, Sheets, and more', category: CATEGORIES.PRODUCTIVITY },
  { id: 'microsoft-365', name: 'Microsoft 365', icon: FaMicrosoft, description: 'Connect Office, OneDrive, and other Microsoft services', category: CATEGORIES.PRODUCTIVITY },
  { id: 'notion', name: 'Notion', icon: SiNotion, description: 'Connect your Notion workspace', category: CATEGORIES.PRODUCTIVITY },
  { id: 'airtable', name: 'Airtable', icon: SiAirtable, description: 'Connect your Airtable bases', category: CATEGORIES.PRODUCTIVITY },
  { id: 'evernote', name: 'Evernote', icon: FaEvernote, description: 'Connect your Evernote account', category: CATEGORIES.PRODUCTIVITY },
  { id: 'monday', name: 'Monday.com', icon: CgMonday, description: 'Connect your Monday.com workspace', category: CATEGORIES.PRODUCTIVITY },
  { id: 'clickup', name: 'ClickUp', icon: SiClickup, description: 'Connect your ClickUp workspace', category: CATEGORIES.PRODUCTIVITY },
  
  // Communication
  { id: 'slack', name: 'Slack', icon: FaSlack, description: 'Connect your Slack workspace', category: CATEGORIES.COMMUNICATION },
  { id: 'zoom', name: 'Zoom', icon: BiLogoZoom, description: 'Connect your Zoom account for meetings', category: CATEGORIES.COMMUNICATION },
  { id: 'intercom', name: 'Intercom', icon: FaIntercom, description: 'Connect your Intercom for customer messaging', category: CATEGORIES.COMMUNICATION },
  { id: 'discord', name: 'Discord', icon: FaDiscord, description: 'Connect your Discord server', category: CATEGORIES.COMMUNICATION },
  { id: 'twilio', name: 'Twilio', icon: SiTwilio, description: 'Connect your Twilio account for SMS and voice', category: CATEGORIES.COMMUNICATION },
  
  // Development
  { id: 'github', name: 'GitHub', icon: FaGithub, description: 'Connect your GitHub repositories', category: CATEGORIES.DEVELOPMENT },
  { id: 'jira', name: 'Jira', icon: FaJira, description: 'Connect your Jira projects', category: CATEGORIES.DEVELOPMENT },
  { id: 'trello', name: 'Trello', icon: FaTrello, description: 'Connect your Trello boards', category: CATEGORIES.DEVELOPMENT },
  { id: 'asana', name: 'Asana', icon: SiAsana, description: 'Connect your Asana projects', category: CATEGORIES.DEVELOPMENT },
  { id: 'linear', name: 'Linear', icon: SiLinear, description: 'Connect your Linear teams', category: CATEGORIES.DEVELOPMENT },
  { id: 'postman', name: 'Postman', icon: SiPostman, description: 'Connect your Postman workspaces', category: CATEGORIES.DEVELOPMENT },
  
  // Storage
  { id: 'dropbox', name: 'Dropbox', icon: FaDropbox, description: 'Connect your Dropbox account', category: CATEGORIES.STORAGE },
  { id: 'box', name: 'Box', icon: SiBox, description: 'Connect your Box account', category: CATEGORIES.STORAGE },
  { id: 'aws-s3', name: 'AWS S3', icon: FaAws, description: 'Connect your AWS S3 buckets', category: CATEGORIES.STORAGE },
  
  // Marketing & Sales
  { id: 'salesforce', name: 'Salesforce', icon: SiSalesforce, description: 'Connect your Salesforce account', category: CATEGORIES.MARKETING },
  { id: 'hubspot', name: 'HubSpot', icon: FaHubspot, description: 'Connect your HubSpot account', category: CATEGORIES.MARKETING },
  { id: 'mailchimp', name: 'Mailchimp', icon: FaMailchimp, description: 'Connect your Mailchimp account', category: CATEGORIES.MARKETING },
  { id: 'sendinblue', name: 'Sendinblue', icon: SiBrevo, description: 'Connect your Sendinblue (Brevo) account', category: CATEGORIES.MARKETING },
  { id: 'mailgun', name: 'Mailgun', icon: SiMailgun, description: 'Connect your Mailgun account', category: CATEGORIES.MARKETING },
  { id: 'segment', name: 'Segment', icon: MdOutlineSegment, description: 'Connect your Segment account', category: CATEGORIES.MARKETING },
  
  // Payments & Finance
  { id: 'stripe', name: 'Stripe', icon: FaStripe, description: 'Connect your Stripe account', category: CATEGORIES.PAYMENTS },
  { id: 'paypal', name: 'PayPal', icon: FaPaypal, description: 'Connect your PayPal account', category: CATEGORIES.PAYMENTS },
  { id: 'quickbooks', name: 'QuickBooks', icon: SiQuickbooks, description: 'Connect your QuickBooks account', category: CATEGORIES.PAYMENTS },
  { id: 'xero', name: 'Xero', icon: SiXero, description: 'Connect your Xero account', category: CATEGORIES.PAYMENTS },
  { id: 'freshbooks', name: 'FreshBooks', icon: MdAttachMoney, description: 'Connect your FreshBooks account', category: CATEGORIES.PAYMENTS },
  
  // Analytics & Data
  { id: 'google-analytics', name: 'Google Analytics', icon: SiGoogleanalytics, description: 'Connect your Google Analytics account', category: CATEGORIES.ANALYTICS },
  { id: 'amplitude', name: 'Amplitude', icon: GiAmplitude, description: 'Connect your Amplitude account', category: CATEGORIES.ANALYTICS },
  { id: 'mixpanel', name: 'Mixpanel', icon: SiMixpanel, description: 'Connect your Mixpanel account', category: CATEGORIES.ANALYTICS },
  { id: 'google-ads', name: 'Google Ads', icon: SiGoogleads, description: 'Connect your Google Ads account', category: CATEGORIES.ANALYTICS },
  
  // Social Media
  { id: 'twitter', name: 'Twitter', icon: FaTwitter, description: 'Connect your Twitter account', category: CATEGORIES.SOCIAL },
  { id: 'facebook', name: 'Facebook', icon: FaFacebook, description: 'Connect your Facebook pages', category: CATEGORIES.SOCIAL },
  { id: 'instagram', name: 'Instagram', icon: FaInstagram, description: 'Connect your Instagram account', category: CATEGORIES.SOCIAL },
  { id: 'linkedin', name: 'LinkedIn', icon: FaLinkedin, description: 'Connect your LinkedIn account', category: CATEGORIES.SOCIAL },
  { id: 'youtube', name: 'YouTube', icon: FaYoutube, description: 'Connect your YouTube channel', category: CATEGORIES.SOCIAL },
  
  // Content Management
  { id: 'wordpress', name: 'WordPress', icon: FaWordpress, description: 'Connect your WordPress site', category: CATEGORIES.CMS },
  { id: 'shopify', name: 'Shopify', icon: FaShopify, description: 'Connect your Shopify store', category: CATEGORIES.CMS },
  { id: 'wix', name: 'Wix', icon: FaWix, description: 'Connect your Wix site', category: CATEGORIES.CMS },
  { id: 'squarespace', name: 'Squarespace', icon: FaSquarespace, description: 'Connect your Squarespace site', category: CATEGORIES.CMS },
  { id: 'adobe', name: 'Adobe Creative Cloud', icon: SiFigma , description: 'Connect your Adobe Creative Cloud', category: CATEGORIES.CMS },
  
  // Cloud Services
  { id: 'aws', name: 'Amazon Web Services', icon: FaAws, description: 'Connect your AWS account', category: CATEGORIES.CLOUD },
  { id: 'google-cloud', name: 'Google Cloud', icon: SiGooglecloud, description: 'Connect your Google Cloud account', category: CATEGORIES.CLOUD },
  { id: 'azure', name: 'Microsoft Azure', icon: VscAzure, description: 'Connect your Azure account', category: CATEGORIES.CLOUD },
  { id: 'digitalocean', name: 'DigitalOcean', icon: SiDigitalocean, description: 'Connect your DigitalOcean account', category: CATEGORIES.CLOUD },
  { id: 'heroku', name: 'Heroku', icon: SiHeroku, description: 'Connect your Heroku account', category: CATEGORIES.CLOUD },
  { id: 'netlify', name: 'Netlify', icon: SiNetlify, description: 'Connect your Netlify account', category: CATEGORIES.CLOUD },
  { id: 'vercel', name: 'Vercel', icon: SiVercel, description: 'Connect your Vercel account', category: CATEGORIES.CLOUD },
  { id: 'firebase', name: 'Firebase', icon: SiFirebase, description: 'Connect your Firebase account', category: CATEGORIES.CLOUD },
  
  // Databases
  { id: 'mongodb', name: 'MongoDB', icon: SiMongodb, description: 'Connect your MongoDB databases', category: CATEGORIES.DATABASE },
  { id: 'postgresql', name: 'PostgreSQL', icon: SiPostgresql, description: 'Connect your PostgreSQL databases', category: CATEGORIES.DATABASE },
  { id: 'mysql', name: 'MySQL', icon: SiMysql, description: 'Connect your MySQL databases', category: CATEGORIES.DATABASE },
  { id: 'redis', name: 'Redis', icon: SiRedis, description: 'Connect your Redis databases', category: CATEGORIES.DATABASE },
  { id: 'elasticsearch', name: 'Elasticsearch', icon: SiElasticsearch, description: 'Connect your Elasticsearch clusters', category: CATEGORIES.DATABASE },
  
  // Automation
  { id: 'zapier', name: 'Zapier', icon: SiZapier, description: 'Connect your Zapier account', category: 'Automation' },
];