# AI Contract Assistant

<div align="center">
  <img src="public/logo.svg" alt="AI Contract Assistant Logo" width="120" />
  
  A modern AI-powered contract analysis and management platform
</div>

## Overview

AI Contract Assistant is a modern web application that helps users analyze, understand, and manage contracts using artificial intelligence. The application provides smart contract analysis, key term extraction, and intelligent recommendations to streamline your contract management workflow.

## Features

- 📄 **Contract Analysis**: Upload and analyze contracts using advanced AI models
- 🔍 **Key Term Extraction**: Automatically identify and highlight important contract terms and clauses
- 💡 **Smart Recommendations**: Get AI-powered suggestions for contract improvements and risk assessment
- 📊 **Analytics Dashboard**: Visual overview of contract metrics, insights, and performance
- 🔐 **Enterprise Security**: End-to-end encryption and secure document processing
- 🔄 **Version Control**: Track changes and maintain contract history
- 📱 **Responsive Design**: Access from any device with a modern, intuitive interface

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **UI Framework**: Tailwind CSS + Modern component library
- **Backend**: Node.js with TypeScript
- **AI Integration**: Advanced language models for contract analysis
- **Authentication**: JWT-based secure user authentication
- **Database**: PostgreSQL for reliable data storage
- **Cloud Infrastructure**: AWS/Azure for scalable hosting

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL (v13 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-contract-assistant.git
cd ai-contract-assistant
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Configure environment:
```bash
cp .env.example .env
```
Edit `.env` with your configuration:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT authentication
- `AI_API_KEY`: Your AI service API key

4. Start development server:
```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`

## Development

### Project Structure
```
ai-contract-assistant/
├── src/
│   ├── components/    # React components
│   ├── pages/        # Page components
│   ├── services/     # Business logic
│   ├── utils/        # Helper functions
│   └── types/        # TypeScript definitions
├── public/           # Static assets
└── tests/           # Test files
```

### Running Tests
```bash
npm run test
# or
yarn test
```

## Deployment

### Vercel Deployment

You can deploy this project on Vercel either through the UI or CLI.

#### Option 1: UI Deployment (Recommended)

1. Push your code to GitHub if you haven't already

2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Choose "Import Git Repository"
   - Select your AI Contract Assistant repository
   - Vercel will auto-detect project settings

3. Configure Project:
   - Framework Preset: Select "Other"
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. Environment Variables:
   - Click "Environment Variables" section
   - Add all variables from your `.env` file:
     - `DATABASE_URL`
     - `JWT_SECRET`
     - `AI_API_KEY`
     - Any other required variables

5. Click "Deploy"
   - Vercel will build and deploy your application
   - You'll get a production URL like `https://your-project.vercel.app`

6. Custom Domain (Optional):
   - Go to Project Settings > Domains
   - Add your custom domain and follow DNS configuration instructions

#### Option 2: CLI Deployment

1. Install Vercel CLI:
```bash
npm install -g vercel
# or
yarn global add vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Configure Vercel:
Create a `vercel.json` in the root directory:
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "builds": [
    { "src": "frontend/**", "use": "@vercel/static" },
    { "src": "api/**", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)", "dest": "/frontend/$1" }
  ]
}
```

4. Deploy:
```bash
vercel
```

5. Set environment variables in Vercel:
   - Go to your Vercel project dashboard
   - Navigate to Settings > Environment Variables
   - Add all required variables from your `.env` file

The application will be deployed with automatic CI/CD on every push to the main branch.

Production URL: [https://ai-contract-assistant.vercel.app](https://ai-contract-assistant.vercel.app)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


---
For support, please open an issue in the GitHub repository or contact the development team. 