import React, { useState, useCallback } from 'react';
import { FileText, AlertTriangle, Loader, LogIn, Calendar, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ContractAnalysis {
  riskScore: number;
  keyTerms: string[];
  recommendations: string[];
  potentialIssues: string[];
  summary: string;
  riskExplanation?: string;
  importantDates?: Array<{
    date: string;
    context: string;
    type: string;
    formattedDate: string;
    eventType: string;
  }>;
}

const DOCUSIGN_AUTH_URL = import.meta.env.VITE_DOCUSIGN_AUTH_SERVER || 'https://account-d.docusign.com/oauth/auth';
const CLIENT_ID = import.meta.env.VITE_DOCUSIGN_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/auth/callback`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const validateDocuSignUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return (urlObj.hostname.includes('docusign.com') || urlObj.hostname.includes('docusign.net')) && 
           (url.includes('envelopes/') || url.includes('documents/details/'));
  } catch {
    return false;
  }
};

const formatBulletPoints = (items: string[]): string => {
  return items.map(item => `- ${item}`).join('\n');
};

const ContractAnalyzer: React.FC = () => {
  const [docusignUrl, setDocusignUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if we have an access token in session storage
  React.useEffect(() => {
    const token = sessionStorage.getItem('docusign_token');
    if (token) {
      setIsAuthenticated(true);
    }

    // Check if we're returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleAuthCode(code);
    }
  }, []);

  const initiateDocuSignAuth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/docusign/url`);
      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      setError('Failed to initiate DocuSign authentication');
    }
  };

  const handleAuthCode = async (code: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/docusign/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details?.error_description || 'Failed to get access token');
      }

      const data = await response.json();
      sessionStorage.setItem('docusign_token', data.access_token);
      setIsAuthenticated(true);

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    }
  };

  const analyzeContract = async () => {
    if (!docusignUrl.trim()) {
      setError('Please enter a valid DocuSign URL');
      return;
    }

    if (!validateDocuSignUrl(docusignUrl)) {
      setError('Please enter a valid DocuSign envelope URL (e.g., https://app.docusign.com/documents/details/envelopes/...)');
      return;
    }

    if (!isAuthenticated) {
      setError('Please authenticate with DocuSign first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const token = sessionStorage.getItem('docusign_token');
      
      // First, fetch the contract content from DocuSign
      const contractResponse = await fetch(`${API_BASE_URL}/api/fetch-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        credentials: 'include',
        mode: 'cors',
        body: JSON.stringify({ 
          docusignUrl: docusignUrl.trim()
        }),
      });

      if (!contractResponse.ok) {
        if (contractResponse.status === 401) {
          sessionStorage.removeItem('docusign_token');
          setIsAuthenticated(false);
          throw new Error('Authentication expired. Please sign in again.');
        }
        throw new Error('Failed to fetch contract from DocuSign');
      }

      const contractData = await contractResponse.json();

      // Then, analyze the contract using Gemini AI
      const analysisResponse = await fetch(`${API_BASE_URL}/api/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        mode: 'cors',
        body: JSON.stringify({ contractContent: contractData.content }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || 'Failed to analyze contract');
      }

      const analysisData = await analysisResponse.json();
      
      // Ensure risk score is valid
      if (typeof analysisData.riskScore !== 'number' || isNaN(analysisData.riskScore)) {
        throw new Error('Invalid risk score received from analysis');
      }
      
      setAnalysis(analysisData);
      
      // Emit event for ContractAssistant
      const event = new CustomEvent('contractAnalysisComplete', {
        detail: analysisData
      });
      window.dispatchEvent(event);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during analysis');
      console.error('Contract analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addToCalendar = (dateInfo: {
    date: string;
    context: string;
    type: string;
    formattedDate: string;
    eventType: string;
  }, calendarType: 'google' | 'outlook') => {
    // Format the date for Calendar URL
    let startDate = dateInfo.date;
    let endDate = dateInfo.date;
    
    // Parse standard dates first
    const parseStandardDate = (dateStr: string): Date | null => {
      // Try different date formats
      const formats = [
        // MM/DD/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        // YYYY/MM/DD
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
        // Month DD, YYYY
        /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/
      ];

      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          if (format === formats[0]) { // MM/DD/YYYY
            return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
          } else if (format === formats[1]) { // YYYY/MM/DD
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          } else { // Month DD, YYYY
            const months = {
              'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
              'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
            };
            return new Date(parseInt(match[3]), months[match[1] as keyof typeof months], parseInt(match[2]));
          }
        }
      }
      return null;
    };

    // Try to parse as standard date first
    const parsedDate = parseStandardDate(dateInfo.formattedDate);
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      startDate = parsedDate.toISOString().split('T')[0];
      // For deadlines and due dates, set end date to same day
      endDate = startDate;
    } else if (dateInfo.type === 'relative') {
      // Handle relative dates
      const now = new Date();
      const timeUnits: { [key: string]: number } = {
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
        years: 365 * 24 * 60 * 60 * 1000
      };

      if (dateInfo.date.includes('within')) {
        const match = dateInfo.date.match(/within\s+(\d+)\s+(days?|weeks?|months?|years?)/);
        if (match) {
          const [_, number, unit] = match;
          const multiplier = timeUnits[unit];
          if (multiplier) {
            endDate = new Date(now.getTime() + parseInt(number) * multiplier).toISOString().split('T')[0];
            startDate = now.toISOString().split('T')[0];
          }
        }
      } else if (dateInfo.date.includes('after')) {
        const match = dateInfo.date.match(/after\s+(\d+)\s+(days?|weeks?|months?|years?)/);
        if (match) {
          const [_, number, unit] = match;
          const multiplier = timeUnits[unit];
          if (multiplier) {
            startDate = new Date(now.getTime() + parseInt(number) * multiplier).toISOString().split('T')[0];
            endDate = startDate;
          }
        }
      } else if (dateInfo.date.includes('next')) {
        const now = new Date();
        if (dateInfo.date.includes('week')) {
          startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        } else if (dateInfo.date.includes('month')) {
          startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
        } else if (dateInfo.date.includes('year')) {
          startDate = new Date(now.getFullYear() + 1, 0, 1).toISOString().split('T')[0];
        }
        endDate = startDate;
      }
    }

    // Format event title based on event type
    let eventTitle = '';
    const eventType = dateInfo.eventType.toLowerCase();
    if (eventType.includes('deadline') || eventType.includes('due')) {
      eventTitle = `⚠️ Contract Deadline: ${dateInfo.eventType}`;
    } else if (eventType.includes('payment')) {
      eventTitle = `💰 Contract Payment: ${dateInfo.eventType}`;
    } else if (eventType.includes('review') || eventType.includes('renewal')) {
      eventTitle = `📋 Contract Review: ${dateInfo.eventType}`;
    } else if (eventType.includes('delivery')) {
      eventTitle = `📦 Contract Delivery: ${dateInfo.eventType}`;
    } else if (eventType.includes('start') || eventType.includes('begin')) {
      eventTitle = `🎯 Contract Start: ${dateInfo.eventType}`;
    } else if (eventType.includes('end') || eventType.includes('termination')) {
      eventTitle = `🔚 Contract End: ${dateInfo.eventType}`;
    } else {
      eventTitle = `📅 Contract Date: ${dateInfo.eventType}`;
    }

    // Create event description with formatted context
    const description = `Important Contract Date\n\n${dateInfo.context}\n\nDate Type: ${dateInfo.type}\nEvent Type: ${dateInfo.eventType}`;

    if (calendarType === 'google') {
      // Create Google Calendar URL
      const calendarUrl = new URL('https://calendar.google.com/calendar/render');
      calendarUrl.searchParams.append('action', 'TEMPLATE');
      calendarUrl.searchParams.append('text', eventTitle);
      calendarUrl.searchParams.append('dates', `${startDate.replace(/-/g, '')}/${endDate.replace(/-/g, '')}`);
      calendarUrl.searchParams.append('details', description);
      window.open(calendarUrl.toString(), '_blank');
    } else {
      // Create Outlook Calendar URL
      const outlookUrl = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
      outlookUrl.searchParams.append('subject', eventTitle);
      outlookUrl.searchParams.append('startdt', `${startDate}T00:00:00`);
      outlookUrl.searchParams.append('enddt', `${endDate}T23:59:59`);
      outlookUrl.searchParams.append('body', description);
      outlookUrl.searchParams.append('allday', 'true');
      window.open(outlookUrl.toString(), '_blank');
    }
  };

  const CalendarDropdown: React.FC<{ dateInfo: any }> = ({ dateInfo }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1"
          title="Add to Calendar"
        >
          <Calendar className="w-6 h-6" />
          <ChevronDown className="w-4 h-4" />
        </button>
        
        {isOpen && (
          <div className="absolute left-0 mt-1 bg-white rounded-lg shadow-lg border border-purple-100 py-1 min-w-[160px] z-10">
            <button
              onClick={() => {
                addToCalendar(dateInfo, 'google');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center gap-2"
            >
              <span className="text-lg">📅</span> Google Calendar
            </button>
            <button
              onClick={() => {
                addToCalendar(dateInfo, 'outlook');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center gap-2"
            >
              <span className="text-lg">📅</span> Outlook Calendar
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!analysis) return null;

    // Ensure risk score is valid
    const riskScore = typeof analysis.riskScore === 'number' && !isNaN(analysis.riskScore) ? analysis.riskScore : null;
    if (riskScore === null) {
      setError('Invalid risk score received from analysis');
      return null;
    }

    const riskLevel = riskScore < 30 ? 'Low' : riskScore < 60 ? 'Moderate' : 'High';

    return (
      <div className="space-y-4 mt-6">
        <div className="bg-indigo-50 p-4 rounded-lg">
          <h3 className="font-medium text-indigo-900 mb-2"># Summary</h3>
          <div className="text-sm text-indigo-800 prose prose-indigo max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {analysis.summary}
            </ReactMarkdown>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="font-medium text-yellow-900 mb-2"># Risk Score</h3>
            <div className="text-2xl font-bold text-yellow-800">
              {riskScore}/100 ({riskLevel} Risk)
            </div>
            {analysis.riskExplanation && (
              <div className="mt-2 text-sm text-yellow-800 prose prose-yellow max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {analysis.riskExplanation.replace(/Risk Score:.*?\)/, '').trim()}
                </ReactMarkdown>
              </div>
            )}
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-medium text-green-900 mb-2"># Key Terms</h3>
            <div className="text-sm text-green-800 prose prose-green max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {formatBulletPoints(analysis.keyTerms)}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg">
          <h3 className="font-medium text-orange-900 mb-2"># Potential Issues</h3>
          <div className="text-sm text-orange-800 prose prose-orange max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {formatBulletPoints(analysis.potentialIssues)}
            </ReactMarkdown>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2"># Recommendations</h3>
          <div className="text-sm text-blue-800 prose prose-blue max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {formatBulletPoints(analysis.recommendations)}
            </ReactMarkdown>
          </div>
        </div>

        {analysis.importantDates && analysis.importantDates.length > 0 && (
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-medium text-purple-900 mb-2"># Important Dates</h3>
            <div className="space-y-3">
              {analysis.importantDates.map((dateInfo, index) => (
                <div key={index} className="text-sm text-purple-800 border-l-2 border-purple-200 pl-3">
                  <div className="flex items-start gap-3">
                    <CalendarDropdown dateInfo={dateInfo} />
                    <div className="flex-1">
                      <div className="font-medium">{dateInfo.formattedDate}</div>
                      <div className="text-xs bg-purple-100 inline-block px-2 py-0.5 rounded mt-1 mb-1">
                        {dateInfo.eventType}
                      </div>
                      <div className="text-purple-700">{dateInfo.context}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center mb-4">
        <FileText className="h-6 w-6 text-indigo-600" />
        <h2 className="ml-2 text-lg font-medium text-gray-900">Contract Analyzer</h2>
      </div>

      <div className="space-y-4">
        {!isAuthenticated ? (
          <div className="text-center py-8">
            <button
              onClick={initiateDocuSignAuth}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Sign in with DocuSign
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Authentication required to access DocuSign contracts
            </p>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="docusign-url" className="block text-sm font-medium text-gray-700 mb-1">
                DocuSign Contract URL
              </label>
              <div className="relative max-w-2xl">
                <input
                  id="docusign-url"
                  type="url"
                  value={docusignUrl}
                  onChange={(e) => setDocusignUrl(e.target.value)}
                  placeholder="Paste DocuSign URL here"
                  className="w-full h-10 px-3 pr-24 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={isAnalyzing}
                />
                <button
                  onClick={analyzeContract}
                  disabled={isAnalyzing || !docusignUrl.trim()}
                  className={`absolute right-1 top-1 px-4 h-8 rounded-lg text-white text-sm ${
                    isAnalyzing || !docusignUrl.trim()
                      ? 'bg-indigo-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-2">
                      <Loader className="w-3 h-3 animate-spin" />
                      <span>Analyzing...</span>
                    </div>
                  ) : (
                    'Analyze'
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <p className="ml-2 text-sm text-red-600">{error}</p>
                </div>
              </div>
            )}

            {analysis && renderAnalysis()}
          </>
        )}
      </div>
    </div>
  );
};

export default ContractAnalyzer; 