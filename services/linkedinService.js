const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
// The frontend URL or backend URL used for the callback
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/callback';

exports.getAuthUrl = (userId) => {
  const scope = encodeURIComponent('openid profile email w_member_social');
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${userId}&scope=${scope}`;
};

exports.exchangeCodeForToken = async (code) => {
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('client_id', LINKEDIN_CLIENT_ID);
  params.append('client_secret', LINKEDIN_CLIENT_SECRET);
  params.append('redirect_uri', REDIRECT_URI);

  try {
    const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data; // { access_token, expires_in }
  } catch (error) {
    console.error('LinkedIn token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange code for token');
  }
};

exports.getUserProfile = async (accessToken) => {
  try {
    const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    // response.data.sub is the URN ID
    return response.data; 
  } catch (error) {
    console.error('LinkedIn user profile fetch failed:', error.response?.data || error.message);
    throw new Error('Failed to fetch LinkedIn profile');
  }
};

exports.publishPost = async (accessToken, personUrnId, content, imageUrl) => {
  try {
    let shareMediaCategory = 'NONE';
    let media = [];

    if (imageUrl) {
      // 1. Register Upload
      const registerResponse = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: `urn:li:person:${personUrnId}`,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      }, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });

      const uploadMechanism = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'];
      const uploadUrl = uploadMechanism.uploadUrl;
      const assetUrn = registerResponse.data.value.asset;

      // 2. Upload the binary
      const filePath = path.join(__dirname, '..', imageUrl); 
      const fileBinary = fs.readFileSync(filePath);

      await axios.put(uploadUrl, fileBinary, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        }
      });

      shareMediaCategory = 'IMAGE';
      media = [{
        status: 'READY',
        description: { text: 'Attached Image' },
        media: assetUrn,
        title: { text: 'Attached Image' }
      }];
    }

    const payload = {
      author: `urn:li:person:${personUrnId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content
          },
          shareMediaCategory,
          ...(shareMediaCategory === 'IMAGE' ? { media } : {})
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
    return response.data;
  } catch (error) {
    const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('LinkedIn publish failed:', errorDetails);
    
    // If the error is simply because the post is a duplicate (often happens during testing),
    // treat it as a success so the scheduler/UI doesn't get stuck in a failed state.
    if (errorDetails.includes('DUPLICATE_POST') || errorDetails.includes('Duplicate post')) {
      console.log('Duplicate post detected. Treating as successful publish to bypass error.');
      return { id: 'duplicate_bypass', duplicate: true };
    }
    
    throw new Error(`Failed to publish post to LinkedIn. Details: ${errorDetails}`);
  }
};
