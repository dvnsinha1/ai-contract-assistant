import { Handler } from '@netlify/functions';
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import { app } from '../src/app';  // We'll create this next

// Initialize express app with middleware
const handler = express();
handler.use(cors({
  origin: ['https://ai-contract-assistant.vercel.app', 'http://localhost:5173', 'chrome-extension://*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

handler.use('/.netlify/functions/api', app);

// Export the serverless function handler
export const handler: Handler = serverless(handler); 