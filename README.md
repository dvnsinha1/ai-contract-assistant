# AI Contract Assistant

An AI-powered contract analysis tool that helps users understand and analyze DocuSign contracts using Google's Gemini AI.

## Features

- 🔍 Chrome Extension for easy contract capture
- 📄 DocuSign integration for secure contract access
- 🤖 AI-powered contract analysis
- 💡 Interactive Q&A with contract context
- 🔐 Secure authentication flow
- 📊 Risk assessment and scoring

## Project Structure

```
ai-contract-assistant/
├── src/               # Frontend React application
├── backend/           # Backend Express server
├── extension/         # Chrome extension
├── public/           # Static assets
└── ...configuration files
```

## Prerequisites

- Node.js 18+ and npm
- Google Cloud account with Gemini API access
- DocuSign Developer account
- Vercel account

## Environment Variables

### Backend (.env)
```
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_DOCUSIGN_CLIENT_ID=your_docusign_client_id
VITE_DOCUSIGN_CLIENT_SECRET=your_docusign_client_secret
DOCUSIGN_AUTH_SERVER=https://account-d.docusign.com
VITE_DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_SCOPES=signature impersonation
CLIENT_URL=https://your-frontend-url.vercel.app
```

### Frontend (.env)
```
VITE_API_URL=https://your-backend-url.vercel.app
```

## Deployment Guide

### Backend Deployment (Vercel)

1. Fork or clone the repository
2. Create a new project in Vercel Dashboard
3. Configure the project:
   - Root Directory: `backend`
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. Add Environment Variables in Vercel Dashboard:
   - Copy all variables from backend `.env`
   - Add `CLIENT_URL` pointing to your frontend URL

5. Deploy:
   ```bash
   cd backend
   vercel
   ```

### Frontend Deployment (Vercel)

1. Create a new project in Vercel Dashboard
2. Configure the project:
   - Root Directory: `./` (root directory)
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. Add Environment Variables:
   - `VITE_API_URL`: Your backend Vercel URL

4. Deploy:
   ```bash
   vercel
   ```

### Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` directory
5. Update the backend URL in `popup.js` to your deployed backend URL

## Development Setup

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
npm install
npm run dev
```

### Extension
1. Update `popup.js` with local backend URL
2. Load unpacked extension in Chrome

## API Endpoints

### Backend

- `POST /api/contract/url`: Submit DocuSign contract URL
- `GET /api/auth/docusign/url`: Get DocuSign OAuth URL
- `POST /api/auth/docusign/token`: Exchange OAuth code for token
- `POST /api/fetch-contract`: Fetch contract from DocuSign
- `POST /api/analyze-contract`: Analyze contract with AI
- `POST /api/chat`: Chat with AI about contract

## Troubleshooting

### Common Issues

1. CORS Errors
   - Verify CORS configuration in backend
   - Check frontend URL in backend environment variables
   - Ensure proper credentials handling in requests

2. Vercel Timeouts
   - Backend uses chunked processing for large contracts
   - Timeout protection implemented for AI analysis
   - Partial results returned if full analysis exceeds time limit

3. DocuSign Authentication
   - Verify DocuSign credentials in environment variables
   - Check redirect URI configuration
   - Ensure proper scopes are set

### Getting Help

For issues and support:
1. Check the troubleshooting guide above
2. Review Vercel deployment logs
3. Check browser console for errors
4. Verify environment variables are set correctly

## License

MIT License - See LICENSE file for details 