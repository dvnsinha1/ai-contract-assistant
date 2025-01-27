import express from 'express';
import type { Request, Response } from 'express';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parsePDF } from './utils/pdfParser.js';
import corsMiddleware from './cors-config.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Enable CORS for all routes
app.use(corsMiddleware);

// Handle preflight requests
app.options('*', corsMiddleware);

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

// DocuSign auth URL endpoint
app.get('/api/auth/docusign/url', (_req: Request, res: Response) => {
  try {
    if (!CLIENT_ID) {
      throw new Error('DocuSign client ID not configured');
    }

    // Construct the authorization URL
    const authUrl = new URL(`${DOCUSIGN_AUTH_SERVER}/oauth/auth`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);

    console.log('Generated DocuSign auth URL');
    res.json({ url: authUrl.toString() });
  } catch (error: any) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      details: error.message 
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
    const NUM_ANALYSES = parseInt(process.env.NUM_ANALYSES || '5');
    
    console.log('\n--- Starting contract analysis ---');
    console.log('Contract content length:', contractContent?.length || 0, 'characters');
    console.log(`Will perform ${NUM_ANALYSES} analyses for better accuracy`);
    console.log('Using model:', process.env.VITE_GEMINI_MODEL_ANALYSIS);

    if (!contractContent || !contractContent.trim()) {
      throw new Error('Contract content is required');
    }

    // Helper functions for parsing responses
    const extractBulletPoints = (section: string): string[] => {
      return section
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.trim().replace(/^-\s*/, ''))
        .filter(Boolean);
    };

    // Extract important dates and their context
    const extractDates = (text: string): Array<{ date: string; context: string; type: string }> => {
      const datePatterns = [
        // Standard date formats with named capture groups
        {
          pattern: /\b(?<date>\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g,
          type: 'standard'
        },
        {
          pattern: /\b(?<date>\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/g,
          type: 'standard'
        },
        // Month names
        {
          pattern: /\b(?<date>(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g,
          type: 'standard'
        },
        // Relative dates with context
        {
          pattern: /\b(?<date>within\s+\d+\s+(?:days?|weeks?|months?|years?))\b/g,
          type: 'relative'
        },
        {
          pattern: /\b(?<date>after\s+\d+\s+(?:days?|weeks?|months?|years?))\b/g,
          type: 'relative'
        },
        // Additional date formats
        {
          pattern: /\b(?<date>next\s+(?:week|month|year))\b/g,
          type: 'relative'
        },
        {
          pattern: /\b(?<date>(?:end|beginning)\s+of\s+(?:the\s+)?(?:week|month|year))\b/g,
          type: 'relative'
        }
      ];

      const importantDates: Array<{ date: string; context: string; type: string }> = [];
      
      // Get surrounding context with complete sentence extraction
      const getContext = (fullText: string, matchIndex: number, matchLength: number): string => {
        // Find the start of the sentence (look for previous period or start of text)
        let sentenceStart = matchIndex;
        while (sentenceStart > 0 && !".!?\n".includes(fullText[sentenceStart - 1])) {
          sentenceStart--;
        }

        // Find the end of the sentence (look for next period or end of text)
        let sentenceEnd = matchIndex + matchLength;
        while (sentenceEnd < fullText.length && !".!?\n".includes(fullText[sentenceEnd])) {
          sentenceEnd++;
        }

        // Get the complete sentence
        const sentence = fullText.slice(sentenceStart, sentenceEnd + 1).trim();

        // If the sentence contains a clause reference, get the entire clause
        const clauseMatch = sentence.match(/\(Clause\s+\d+(?:\.\d+)*\)/i);
        if (clauseMatch) {
          // Look for the clause header
          const clauseStart = fullText.lastIndexOf('\n', sentenceStart);
          const clauseEnd = fullText.indexOf('\n', sentenceEnd);
          if (clauseStart !== -1 && clauseEnd !== -1) {
            return fullText.slice(clauseStart, clauseEnd).trim();
          }
        }

        return sentence;
      };

      // Keywords that indicate important dates
      const importantKeywords = [
        'deadline', 'due', 'expire', 'renewal', 'termination', 'payment',
        'delivery', 'review', 'start', 'end', 'effective', 'completion',
        'milestone', 'schedule', 'duration', 'period', 'term', 'report',
        'submit', 'commence', 'initiate', 'conclude', 'finalize'
      ];

      // Search for dates in the text
      datePatterns.forEach(({ pattern, type }) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const context = getContext(text, match.index, match[0].length);
          const contextLower = context.toLowerCase();
          
          // Check if context contains any important keywords
          if (importantKeywords.some(keyword => contextLower.includes(keyword))) {
            // Extract the specific event type from context
            const eventType = importantKeywords.find(keyword => contextLower.includes(keyword)) || 'general';
            
            // Clean up the context
            const cleanContext = context
              .replace(/\s+/g, ' ')  // Normalize whitespace
              .replace(/\(Clause\s+\d+(?:\.\d+)*\)/i, '')  // Remove clause references
              .trim();

            importantDates.push({
              date: match.groups?.date || match[0],
              context: cleanContext,
              type: eventType
            });
          }
        }
      });

      // Remove duplicates while preserving the most informative context
      const uniqueDates = importantDates.reduce((acc, current) => {
        const existing = acc.find(item => item.date === current.date);
        if (!existing) {
          acc.push(current);
        } else if (current.context.length > existing.context.length) {
          // Replace if new context is more informative
          const index = acc.indexOf(existing);
          acc[index] = current;
        }
        return acc;
      }, [] as Array<{ date: string; context: string; type: string }>);

      // Sort dates by type (standard dates first, then relative dates)
      return uniqueDates.sort((a, b) => {
        if (a.type === 'standard' && b.type !== 'standard') return -1;
        if (a.type !== 'standard' && b.type === 'standard') return 1;
        return 0;
      });
    };

    // Risk score extraction and validation function
    const extractRiskScore = (text: string): { score: number; breakdown: any } => {
      // Initialize score categories
      const categories = {
          legal: 0,
          financial: 0,
          operational: 0,
          reputational: 0
      };
      
      // Parse the text to extract category-specific scores
      const legalMatch = text.match(/legal risks?.*?(\d+)/i);
      const financialMatch = text.match(/financial risks?.*?(\d+)/i);
      const operationalMatch = text.match(/operational risks?.*?(\d+)/i);
      const reputationalMatch = text.match(/reputational.*?risks?.*?(\d+)/i);

      // Assign scores with validation (0-20 range per category)
      categories.legal = legalMatch ? Math.min(20, Math.max(0, parseInt(legalMatch[1]))) : 5;
      categories.financial = financialMatch ? Math.min(20, Math.max(0, parseInt(financialMatch[1]))) : 5;
      categories.operational = operationalMatch ? Math.min(20, Math.max(0, parseInt(operationalMatch[1]))) : 5;
      categories.reputational = reputationalMatch ? Math.min(20, Math.max(0, parseInt(reputationalMatch[1]))) : 5;

      // Calculate total score (sum of all categories)
      const totalScore = Object.values(categories).reduce((sum, score) => sum + score, 0);
      
      // Add score validation based on risk indicators
      const hasHighRiskIndicators = text.toLowerCase().match(/(major concern|serious issue|critical risk|severe)/g);
      const numHighRiskIndicators = hasHighRiskIndicators ? hasHighRiskIndicators.length : 0;
      
      // Adjust score based on risk indicators
      let adjustedScore = totalScore;
      if (adjustedScore > 60 && numHighRiskIndicators < 2) {
          adjustedScore = Math.min(60, adjustedScore);
      }

      console.log('Risk Score Breakdown:', {
          categories,
          totalScore,
          numHighRiskIndicators,
          adjustedScore,
          textAnalyzed: text.substring(0, 200) + '...' // Log first 200 chars for context
      });

      return {
          score: adjustedScore,
          breakdown: {
              ...categories,
              highRiskIndicators: numHighRiskIndicators
          }
      };
    };

    // Chunk the contract content for large documents
    const chunks = chunkText(contractContent);
    console.log(`Split contract into ${chunks.length} chunks for analysis`);

    // Run multiple analyses
    console.log('\nRunning multiple analyses...');
    const analyses = await Promise.all(Array(NUM_ANALYSES).fill(0).map(async (_, index) => {
      console.log(`\nStarting analysis run ${index + 1}/${NUM_ANALYSES}`);
      
      // First, analyze each chunk to extract key information
      const chunkAnalyses = await Promise.all(chunks.map(async (chunk, chunkIndex) => {
        console.log(`Analyzing chunk ${chunkIndex + 1}/${chunks.length} in run ${index + 1}`);
        
        const chunkPrompt = `
          You are an expert contract analyst. Analyze this portion of a contract and extract key information.
          Focus on identifying:
          1. Important terms and definitions
          2. Obligations and requirements
          3. Potential risks and issues
          4. Notable clauses or provisions

          Contract portion to analyze:
          ${chunk}

          Provide your findings in this format:
          # Key Points
          - [List key points found in this section]

          # Risks
          - [List any risks or issues identified]

          # Important Clauses
          - [List important clauses or provisions]
        `;

        const model = await initializeGeminiModel('analysis');
        const chunkResult = await model.generateContent(chunkPrompt);
        return chunkResult.response.text();
      }));

      // Then, synthesize the chunk analyses into a complete analysis
      const synthesisPrompt = `
        You are an expert contract analyst with extensive experience in legal document review and risk assessment.
        Synthesize the following analyses of different parts of a contract into a complete analysis.

        Previous analyses:
        ${chunkAnalyses.join('\n\n---\n\n')}

        Provide a complete analysis in this EXACT format:

        # Summary
        [Provide a comprehensive summary of the contract's purpose, parties involved, main obligations, and key provisions]

        # Risk Score and Explanation
        Risk Score: [NUMBER between 0-100]
        Important: Score should be assigned conservatively. Most standard contracts should fall in the low to moderate range (20-50).
        Only assign high scores (>60) if there are serious, multiple, and clear risks present.

        Risk Assessment Guidelines:
        1. Legal Risks (0-20 points):
           - Standard legal terms: 0-5 points
           - Minor deviations from standard terms: 5-10 points
           - Major legal concerns: 10-20 points

        2. Financial Risks (0-20 points):
           - Standard payment terms: 0-5 points
           - Unclear financial obligations: 5-10 points
           - High financial exposure: 10-20 points

        3. Operational Risks (0-20 points):
           - Clear deliverables and timelines: 0-5 points
           - Some ambiguous requirements: 5-10 points
           - Significant operational challenges: 10-20 points

        4. Reputational & Security Risks (0-20 points):
           - Standard confidentiality terms: 0-5 points
           - Moderate exposure: 5-10 points
           - High public/security exposure: 10-20 points

        Final Score Calibration:
        - 0-20: Very Low Risk (Standard contract with clear terms)
        - 21-40: Low Risk (Minor concerns, easily addressed)
        - 41-60: Moderate Risk (Several issues need attention)
        - 61-80: High Risk (Major concerns present)
        - 81-100: Critical Risk (Reserved for contracts with severe multiple issues)

        Explanation:
        [Provide detailed breakdown using the above criteria. Be conservative in scoring. Justify any score above 60 with specific, serious issues]

        # Key Terms
        [List all significant terms with their implications]
        - [Term with explanation of its importance and impact]
        - [Continue for all key terms]

        # Potential Issues
        [List ALL risks and concerns, no matter how small]
        - [Issue with detailed explanation of the risk]
        - [Include potential consequences and likelihood]
        - [Continue for all identified issues]

        # Recommendations
        [Provide specific, actionable recommendations]
        - [Recommendation with clear steps for implementation]
        - [Address each identified issue]
        - [Include priority level for each recommendation]

        IMPORTANT:
        - Ensure all key information from each section is included
        - Maintain consistency across the analysis
        - Be thorough but avoid redundancy
        - Prioritize the most significant findings
        - Provide clear justification for the risk score
      `;

      const model = await initializeGeminiModel('analysis');
      const result = await model.generateContent(synthesisPrompt);
      const response = await result.response;
      const text = response.text();

      const sections = text.split('#').filter(Boolean).map((s: string) => s.trim());
      
      const riskSection = sections.find((s: string) => s.toLowerCase().startsWith('risk score')) || '';
      
      return {
        summary: sections.find((s: string) => s.toLowerCase().startsWith('summary'))?.replace(/^summary/i, '').trim() || '',
        riskScore: extractRiskScore(riskSection).score,
        riskExplanation: riskSection.replace(/^risk score and explanation/i, '').trim() || '',
        keyTerms: extractBulletPoints(sections.find((s: string) => s.toLowerCase().startsWith('key terms')) || ''),
        potentialIssues: extractBulletPoints(sections.find((s: string) => s.toLowerCase().startsWith('potential issues')) || ''),
        recommendations: extractBulletPoints(sections.find((s: string) => s.toLowerCase().startsWith('recommendations')) || ''),
        importantDates: extractDates(sections.find((s: string) => s.toLowerCase().startsWith('important dates')) || '')
      };
    }));

    // Aggregate results
    console.log('\nAggregating results from multiple analyses...');
    
    // Combine all unique items
    const uniqueKeyTerms = new Set<string>();
    const uniqueIssues = new Set<string>();
    const uniqueRecommendations = new Set<string>();
    
    analyses.forEach(analysis => {
      analysis.keyTerms.forEach(term => uniqueKeyTerms.add(term));
      analysis.potentialIssues.forEach(issue => uniqueIssues.add(issue));
      analysis.recommendations.forEach(rec => uniqueRecommendations.add(rec));
    });

    // Calculate risk score using median and additional validation
    const scores = analyses.map(analysis => {
      // Extract risk score directly from the analysis text
      const riskMatch = analysis.riskExplanation.match(/Risk Score:\s*(\d+)/i);
      const score = riskMatch ? parseInt(riskMatch[1]) : 0;
      
      // Get the breakdown from risk explanation
      const riskAnalysis = extractRiskScore(analysis.riskExplanation);
      
      // Use the explicitly stated score if available, otherwise use calculated score
      return {
        score: score || riskAnalysis.score,
        breakdown: riskAnalysis.breakdown
      };
    }).sort((a, b) => a.score - b.score);

    // Calculate final score using median
    const medianIndex = Math.floor(scores.length / 2);
    const finalRiskAnalysis = scores.length % 2 === 0
        ? {
            score: Math.round((scores[medianIndex - 1].score + scores[medianIndex].score) / 2),
            breakdown: scores[medianIndex].breakdown
        }
        : scores[medianIndex];

    console.log('Final Risk Analysis:', finalRiskAnalysis);

    // Additional validation for consensus
    const highScoreThreshold = 60;
    if (finalRiskAnalysis.score > highScoreThreshold) {
        const highScores = scores.filter(s => s.score > highScoreThreshold);
        if (highScores.length < scores.length / 2) {
            const adjustedScore = Math.min(highScoreThreshold, finalRiskAnalysis.score);
            console.log(`Adjusting final risk score from ${finalRiskAnalysis.score} to ${adjustedScore} due to insufficient consensus on high risk`);
            finalRiskAnalysis.score = adjustedScore;
        }
    }

    // Use the most detailed summary and risk explanation
    const bestSummary = analyses.reduce((best, current) => 
      current.summary.length > best.length ? current.summary : best
    , '');

    const bestRiskExplanation = analyses.reduce((best, current) => {
      // Remove any existing risk score from the explanation to avoid duplication
      const cleanExplanation = current.riskExplanation.replace(/Risk Score:.*?\n/, '').trim();
      return cleanExplanation.length > best.length ? cleanExplanation : best;
    }, '');

    const aggregatedAnalysis = {
      summary: bestSummary,
      riskScore: finalRiskAnalysis.score,
      riskBreakdown: finalRiskAnalysis.breakdown,
      riskExplanation: `Risk Score: ${finalRiskAnalysis.score}\n${bestRiskExplanation}`,
      keyTerms: Array.from(uniqueKeyTerms),
      potentialIssues: Array.from(uniqueIssues),
      recommendations: Array.from(uniqueRecommendations),
      importantDates: extractDates(analyses.map(a => 
        `${a.summary}\n${a.riskExplanation}\n${a.keyTerms.join('\n')}\n${a.potentialIssues.join('\n')}\n${a.recommendations.join('\n')}`
      ).join('\n')).map(dateInfo => ({
        ...dateInfo,
        context: dateInfo.context.replace(/\s+/g, ' ').trim(),
        formattedDate: dateInfo.date,
        eventType: dateInfo.type
      }))
    };

    console.log('\nAggregated analysis results:');
    console.log('- Summary length:', aggregatedAnalysis.summary.length, 'characters');
    console.log('- Risk score:', aggregatedAnalysis.riskScore);
    console.log('- Risk explanation length:', aggregatedAnalysis.riskExplanation.length, 'characters');
    console.log('- Unique key terms:', aggregatedAnalysis.keyTerms.length);
    console.log('- Unique potential issues:', aggregatedAnalysis.potentialIssues.length);
    console.log('- Unique recommendations:', aggregatedAnalysis.recommendations.length);
    console.log('- Important dates found:', aggregatedAnalysis.importantDates.length);

    res.json(aggregatedAnalysis);
  } catch (error: any) {
    console.error('\nAnalysis error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to analyze contract',
      details: error.message
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