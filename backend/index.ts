import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parsePDF } from './utils/pdfParser.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Enable CORS for all routes with proper configuration
app.use(cors({
  origin: ['https://ai-contract-assistant.vercel.app', 'http://localhost:5173', 'chrome-extension://*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Add endpoint to receive URLs from Chrome extension
app.post('/api/contract/url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate if it's a DocuSign URL
    if (!url.includes('docusign.com') && !url.includes('docusign.net')) {
      return res.status(400).json({ error: 'Invalid DocuSign URL' });
    }

    console.log('Received contract URL:', url);
    
    // Send response without manual CORS headers
    res.status(200).json({ 
      message: 'URL received successfully',
      url,
      redirect: true
    });
  } catch (error: any) {
    console.error('Error processing URL:', error);
    res.status(500).json({ 
      error: 'Failed to process URL',
      details: error.message 
    });
  }
});

// DocuSign OAuth configuration
const DOCUSIGN_AUTH_SERVER = process.env.DOCUSIGN_AUTH_SERVER || 'https://account-d.docusign.com';
const DOCUSIGN_TOKEN_URL = `${DOCUSIGN_AUTH_SERVER}/oauth/token`;
const DOCUSIGN_BASE_PATH = process.env.VITE_DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi';
const CLIENT_ID = process.env.VITE_DOCUSIGN_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_DOCUSIGN_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.CLIENT_URL}/auth/callback`;
const SCOPES = (process.env.DOCUSIGN_SCOPES || 'signature impersonation').split(' ');

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// Add basic health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Helper function to chunk text
const chunkText = (text: string, maxChunkSize: number = parseInt(process.env.MAX_CHUNK_SIZE || '4000')): string[] => {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

// Helper function to initialize Gemini model
const initializeGeminiModel = async (modelType: 'chat' | 'analysis') => {
  if (!process.env.VITE_GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
  const modelName = modelType === 'chat' 
    ? (process.env.VITE_GEMINI_MODEL_CHAT || 'gemini-pro')
    : (process.env.VITE_GEMINI_MODEL_ANALYSIS || 'gemini-pro');
  
  return genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      maxOutputTokens: parseInt(process.env.VITE_GEMINI_MAX_TOKENS || '8192'),
      temperature: parseFloat(process.env.VITE_GEMINI_TEMPERATURE || '0.7'),
    }
  });
};

// Chat endpoint for contract assistant
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { context, question } = req.body;
    
    if (!process.env.VITE_GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    console.log('\n--- Starting chat response generation ---');
    console.log('Question:', question);
    console.log('Using model:', process.env.VITE_GEMINI_MODEL_CHAT);

    // Initialize Gemini AI for chat
    const model = await initializeGeminiModel('chat');

    // Parse the context
    const contextObj = {
      summary: context.match(/Summary:\s*([\s\S]*?)(?=Risk Score:|$)/)?.[1]?.trim() || '',
      riskScore: context.match(/Risk Score:\s*(\d+)%/)?.[1] || '0',
      keyTerms: context.match(/Key Terms:\s*([\s\S]*?)(?=Potential Issues:|$)/)?.[1]?.trim() || '',
      potentialIssues: context.match(/Potential Issues:\s*([\s\S]*?)(?=Recommendations:|$)/)?.[1]?.trim() || '',
      recommendations: context.match(/Recommendations:\s*([\s\S]*?)(?=$)/)?.[1]?.trim() || ''
    };

    // Create a focused prompt based on the question type
    let focusedPrompt = '';
    const questionLower = question.toLowerCase();

    if (questionLower.includes('risk') || questionLower.includes('score')) {
      focusedPrompt = `
        Focus on the risk assessment aspects:
        Risk Score: ${contextObj.riskScore}%
        Key Issues: ${contextObj.potentialIssues}
      `;
    } else if (questionLower.includes('recommend') || questionLower.includes('suggest')) {
      focusedPrompt = `
        Focus on recommendations and improvements:
        Recommendations: ${contextObj.recommendations}
        Related Issues: ${contextObj.potentialIssues}
      `;
    } else if (questionLower.includes('term') || questionLower.includes('clause')) {
      focusedPrompt = `
        Focus on contract terms and clauses:
        Key Terms: ${contextObj.keyTerms}
        Summary: ${contextObj.summary}
      `;
    } else if (questionLower.includes('issue') || questionLower.includes('problem')) {
      focusedPrompt = `
        Focus on potential issues and risks:
        Potential Issues: ${contextObj.potentialIssues}
        Risk Score: ${contextObj.riskScore}%
      `;
    } else {
      // For general questions, use the full context but in a structured way
      focusedPrompt = `
        Contract Overview:
        ${contextObj.summary}

        Risk Assessment:
        - Score: ${contextObj.riskScore}%
        - Key Issues: ${contextObj.potentialIssues}

        Important Terms:
        ${contextObj.keyTerms}

        Recommendations:
        ${contextObj.recommendations}
      `;
    }

    const prompt = `
      You are an expert contract analyst assistant. Your task is to answer the user's question about a contract that has been analyzed.
      
      CONTEXT:
      ${focusedPrompt}

      USER QUESTION:
      ${question}

      GUIDELINES:
      1. Be concise but thorough in your response
      2. Focus on the most relevant information for the specific question
      3. If you're unsure about something, say so rather than making assumptions
      4. Provide specific references to the contract analysis when applicable
      5. If the question cannot be answered with the given context, explain why
      6. Keep your response clear and easy to understand
      7. If appropriate, suggest follow-up questions the user might want to ask

      Please provide a clear, direct answer to the user's question.
    `;

    console.log('Generating response with Gemini...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('Generated response length:', text.length);
    res.json({ response: text });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to generate response',
      details: error.message 
    });
  }
});

// Get DocuSign OAuth URL
app.get('/api/auth/docusign/url', (_req: Request, res: Response) => {
  try {
    if (!CLIENT_ID) {
      throw new Error('DocuSign Client ID not configured');
    }

    const authUrl = new URL(`${DOCUSIGN_AUTH_SERVER}/oauth/auth`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('prompt', 'login');
    
    console.log('Generated auth URL:', authUrl.toString());
    res.json({ url: authUrl.toString() });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DocuSign OAuth token endpoint
app.post('/api/auth/docusign/token', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('DocuSign credentials not configured');
    }

    console.log('Exchanging code for token...');
    
    // Basic auth for token request
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    // Exchange authorization code for access token
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    });

    const response = await axios.post<TokenResponse>(
      DOCUSIGN_TOKEN_URL,
      params.toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // Get user info to get their account ID
    const userInfoResponse = await axios.get(
      `${DOCUSIGN_AUTH_SERVER}/oauth/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${response.data.access_token}`,
        },
      }
    );

    // Get the default account
    const accounts = userInfoResponse.data.accounts;
    const defaultAccount = accounts.find((acc: any) => acc.is_default) || accounts[0];

    if (!defaultAccount) {
      throw new Error('No DocuSign account found');
    }

    // Add the account ID to the response
    const tokenResponse = {
      ...response.data,
      account_id: defaultAccount.account_id
    };

    console.log('Token exchange successful');
    res.json(tokenResponse);
  } catch (error: any) {
    console.error('Token exchange error:', error.response?.data || error);
    res.status(500).json({ 
      error: 'Failed to exchange token',
      details: error.response?.data || error.message
    });
  }
});

// Fetch contract from DocuSign
app.post('/api/fetch-contract', async (req: Request, res: Response) => {
  try {
    const { docusignUrl } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    console.log('\n--- Starting contract fetch ---');
    console.log('Fetching contract from URL:', docusignUrl);
    console.log('Token present:', !!token);

    if (!docusignUrl) {
      return res.status(400).json({ error: 'DocuSign URL is required' });
    }

    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Extract envelope ID from URL - handle both formats
    const envelopeMatch = docusignUrl.match(/envelopes\/([a-zA-Z0-9-]+)/);
    const detailsMatch = docusignUrl.match(/documents\/details\/([a-zA-Z0-9-]+)/);
    const envelopeId = envelopeMatch?.[1] || detailsMatch?.[1];

    console.log('Extracted envelope ID:', envelopeId);

    if (!envelopeId) {
      return res.status(400).json({ 
        error: 'Invalid DocuSign URL. URL must contain either an envelope ID or document details ID.' 
      });
    }

    // Get user info to get their account ID
    const userInfoResponse = await axios.get(
      `${DOCUSIGN_AUTH_SERVER}/oauth/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    // Get the default account
    const accounts = userInfoResponse.data.accounts;
    const defaultAccount = accounts.find((acc: any) => acc.is_default) || accounts[0];

    if (!defaultAccount) {
      return res.status(500).json({ error: 'No DocuSign account found' });
    }

    const accountId = defaultAccount.account_id;
    console.log('Using DocuSign Account ID:', accountId);

    // Get the document list first
    const documentListUrl = `${DOCUSIGN_BASE_PATH}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents`;
    console.log('\nFetching document list from:', documentListUrl);

    const documentListResponse = await axios.get(
      documentListUrl,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    ).catch((error: any) => {
      console.error('\nDocuSign API error:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Error headers:', error.response?.headers);
      if (error.response?.status === 401) {
        throw new Error('DocuSign authentication failed. Please sign in again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Contract not found. Please check the URL and try again.');
      }
      throw new Error(`Failed to fetch document list: ${error.response?.data?.message || error.message}`);
    });

    console.log('\nDocument list response:', JSON.stringify(documentListResponse.data, null, 2));

    const documents = documentListResponse.data.envelopeDocuments;
    if (!documents || documents.length === 0) {
      throw new Error('No documents found in the envelope');
    }

    console.log(`Found ${documents.length} documents in envelope`);

    // Get the combined document
    const documentUrl = `${DOCUSIGN_BASE_PATH}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`;
    console.log('\nFetching combined document from:', documentUrl);

    const response = await axios.get(
      documentUrl,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/pdf',
        },
        responseType: 'arraybuffer',
      }
    ).catch((error: any) => {
      console.error('\nDocuSign API error:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Error headers:', error.response?.headers);
      if (error.response?.status === 401) {
        throw new Error('DocuSign authentication failed. Please sign in again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Contract not found. Please check the URL and try again.');
      }
      throw new Error('Failed to fetch contract from DocuSign API');
    });

    console.log('\nReceived PDF document, size:', response.data.length, 'bytes');

    // Convert PDF to text using our custom parser
    console.log('Converting PDF to text...');
    const content = await parsePDF(Buffer.from(response.data));
    
    if (!content || !content.trim()) {
      console.error('No text content extracted from PDF');
      throw new Error('Failed to extract text from the PDF');
    }

    console.log('\nSuccessfully extracted text from PDF');
    console.log('Text length:', content.length, 'characters');
    console.log('First 200 characters:', content.substring(0, 200));

    res.json({ content });
  } catch (error: any) {
    console.error('\nContract fetch error:', error);
    console.error('Error stack:', error.stack);
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch contract';
    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.response?.data
    });
  }
});

// Analyze contract with Gemini
app.post('/api/analyze-contract', async (req: Request, res: Response) => {
  try {
    const { contractContent } = req.body;
    const MAX_CHUNK_SIZE = 2000; // Smaller chunk size for faster processing
    const NUM_ANALYSES = 3; // Reduced number of analyses for faster processing
    
    console.log('\n--- Starting contract analysis ---');
    console.log('Contract content length:', contractContent?.length || 0, 'characters');

    if (!contractContent || !contractContent.trim()) {
      throw new Error('Contract content is required');
    }

    // Split into smaller chunks
    const chunks = chunkText(contractContent, MAX_CHUNK_SIZE);
    console.log(`Split contract into ${chunks.length} chunks for analysis`);

    // Process only essential parts if content is too large
    const processableChunks = chunks.length > 5 ? 
      [chunks[0], chunks[Math.floor(chunks.length/2)], chunks[chunks.length-1]] : 
      chunks;

    // Run analyses with timeout protection
    const analysisTimeout = 8000; // 8 seconds timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Analysis timeout')), analysisTimeout)
    );

    const analyzeChunk = async (chunk: string) => {
      const model = await initializeGeminiModel('analysis');
      const prompt = `
        Analyze this contract section concisely. Focus on:
        1. Key terms and risks
        2. Main obligations
        3. Critical issues

        Contract section:
          ${chunk}

        Format:
        SUMMARY: [Brief summary]
        RISK LEVEL: [Low/Medium/High]
        KEY POINTS:
        - [Point 1]
        - [Point 2]
        ISSUES:
        - [Issue 1]
        - [Issue 2]
      `;

      const result = await model.generateContent(prompt);
      return result.response.text();
    };

    // Analyze chunks with timeout protection
    const chunkAnalyses = await Promise.all(
      processableChunks.map(chunk => 
        Promise.race([analyzeChunk(chunk), timeoutPromise])
          .catch(error => {
            console.warn('Chunk analysis timeout:', error);
            return 'Analysis timeout - Partial results';
          })
      )
    );

    // Quick synthesis of results
      const synthesisPrompt = `
      Synthesize these contract analysis results briefly:
      ${chunkAnalyses.join('\n---\n')}

      Provide:
      1. One paragraph summary
      2. Risk score (0-100)
      3. 3-5 key points
      4. 2-3 main issues
      5. 2-3 recommendations
      `;

      const model = await initializeGeminiModel('analysis');
    const synthesisResult = await Promise.race([
      model.generateContent(synthesisPrompt),
      timeoutPromise
    ]) as { response: { text: () => string } };

    const analysis = synthesisResult.response.text();

    // Parse results
    const summary = analysis.match(/summary:?(.*?)(?=risk score:|$)/is)?.[1]?.trim() || 'Summary not available';
    const riskScore = parseInt(analysis.match(/risk score:?\s*(\d+)/i)?.[1] || '50');
    const keyPoints = analysis.match(/key points?:?(.*?)(?=issues:|$)/is)?.[1]?.trim().split('\n').filter(Boolean) || [];
    const issues = analysis.match(/issues:?(.*?)(?=recommendations:|$)/is)?.[1]?.trim().split('\n').filter(Boolean) || [];
    const recommendations = analysis.match(/recommendations:?(.*?)$/is)?.[1]?.trim().split('\n').filter(Boolean) || [];

    const result = {
      summary,
      riskScore: Math.min(100, Math.max(0, riskScore)), // Ensure score is 0-100
      keyTerms: keyPoints.map((p: string) => p.replace(/^-\s*/, '')),
      potentialIssues: issues.map((i: string) => i.replace(/^-\s*/, '')),
      recommendations: recommendations.map((r: string) => r.replace(/^-\s*/, '')),
      isPartialAnalysis: chunks.length > processableChunks.length
    };

    res.json(result);
  } catch (error: any) {
    console.error('\nAnalysis error:', error);
    // Send partial results if available
    res.status(200).json({
      summary: 'Analysis partially completed due to timeout',
      riskScore: 50,
      keyTerms: ['Analysis interrupted - Please try with a shorter contract'],
      potentialIssues: ['Unable to complete full analysis'],
      recommendations: ['Consider breaking down the contract into smaller sections'],
      isPartialAnalysis: true,
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Environment:', {
    CLIENT_ID: CLIENT_ID ? 'Set' : 'Not set',
    CLIENT_SECRET: CLIENT_SECRET ? 'Set' : 'Not set',
    REDIRECT_URI
  });
}); 