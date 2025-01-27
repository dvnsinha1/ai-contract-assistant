import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parsePDF } from '../utils/pdfParser.js';

// Load environment variables
dotenv.config();

export const app = express();

// DocuSign OAuth configuration
const DOCUSIGN_AUTH_SERVER = process.env.DOCUSIGN_AUTH_SERVER || 'https://account-d.docusign.com';
const DOCUSIGN_TOKEN_URL = `${DOCUSIGN_AUTH_SERVER}/oauth/token`;
const DOCUSIGN_BASE_PATH = process.env.VITE_DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi';
const CLIENT_ID = process.env.VITE_DOCUSIGN_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_DOCUSIGN_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.CLIENT_URL}/auth/callback`;
const SCOPES = (process.env.DOCUSIGN_SCOPES || 'signature impersonation').split(' ');

// Copy all your existing routes and middleware here, but remove the app.listen part
// ... (copy all the routes from index.ts) 