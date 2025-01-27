import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://ai-contract-assistant.vercel.app',
        'https://www.ai-contract-assistant.vercel.app',
        'https://ai-contract-assistant-backend.vercel.app'
      ]
    : ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

export default cors(corsOptions);