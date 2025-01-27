import { GoogleGenerativeAI } from '@google/generative-ai';
import docusign from 'docusign-esign';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

// Initialize DocuSign
const docusignClient = new docusign.ApiClient();
docusignClient.setBasePath(import.meta.env.VITE_DOCUSIGN_BASE_PATH);
docusignClient.addDefaultHeader('Authorization', `Bearer ${import.meta.env.VITE_DOCUSIGN_ACCESS_TOKEN}`);

export async function fetchContractFromDocuSign(docusignUrl: string) {
  try {
    // Extract envelope ID from DocuSign URL
    const envelopeId = extractEnvelopeId(docusignUrl);
    if (!envelopeId) {
      throw new Error('Invalid DocuSign URL');
    }

    const envelopesApi = new docusign.EnvelopesApi(docusignClient);
    const results = await envelopesApi.getDocument(
      import.meta.env.VITE_DOCUSIGN_ACCOUNT_ID,
      envelopeId,
      '1' // Assuming the contract is the first document
    );

    return results;
  } catch (error) {
    console.error('Error fetching from DocuSign:', error);
    throw new Error('Failed to fetch contract from DocuSign');
  }
}

export async function analyzeContractWithGemini(contractContent: string) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `
      Analyze the following contract and provide:
      1. A brief summary
      2. Risk score (0-100)
      3. Key terms
      4. Potential issues
      5. Recommendations
      
      Contract content:
      ${contractContent}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the AI response into structured data
    const analysis = parseAIResponse(text);

    return analysis;
  } catch (error) {
    console.error('Error analyzing with Gemini:', error);
    throw new Error('Failed to analyze contract');
  }
}

function extractEnvelopeId(url: string): string | null {
  // Extract envelope ID from DocuSign URL
  const match = url.match(/envelopes\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

function parseAIResponse(text: string) {
  // This is a simple parser - you might want to make it more robust
  const sections = text.split('\n\n');
  
  return {
    summary: sections[0]?.replace('Summary:', '').trim() || '',
    riskScore: parseInt(sections[1]?.match(/\d+/)?.[0] || '0'),
    keyTerms: sections[2]?.replace('Key Terms:', '')
      .split('\n')
      .map(term => term.trim())
      .filter(Boolean) || [],
    potentialIssues: sections[3]?.replace('Potential Issues:', '')
      .split('\n')
      .map(issue => issue.trim())
      .filter(Boolean) || [],
    recommendations: sections[4]?.replace('Recommendations:', '')
      .split('\n')
      .map(rec => rec.trim())
      .filter(Boolean) || []
  };
}

export type ContractAnalysis = {
  summary: string;
  riskScore: number;
  keyTerms: string[];
  potentialIssues: string[];
  recommendations: string[];
}; 