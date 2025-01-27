import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, TrendingUp, Loader, X, MinusSquare, Maximize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ContractAnalysis {
  summary: string;
  riskScore: number;
  keyTerms: string[];
  potentialIssues: string[];
  recommendations: string[];
  riskExplanation?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const ContractAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([{
    id: '1',
    text: "Hi! I can help analyze your contracts and answer any questions. Just paste a DocuSign URL above and ask me anything!",
    isUser: false,
    timestamp: new Date()
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Listen for contract analysis updates
  useEffect(() => {
    const handleAnalysisUpdate = (event: CustomEvent<ContractAnalysis>) => {
      // Validate risk score
      if (typeof event.detail.riskScore !== 'number' || isNaN(event.detail.riskScore)) {
        console.error('Invalid risk score received');
        return;
      }

      setAnalysis(event.detail);
      
      const riskScore = event.detail.riskScore;
      const riskLevel = riskScore < 30 ? 'Low' : riskScore < 60 ? 'Moderate' : 'High';
      
      const analysisMessage: Message = {
        id: Date.now().toString(),
        text: `I've analyzed your contract! Here's what I found:\n\n📊 Risk Assessment: ${riskScore}/100 (${riskLevel} Risk)\n\n📝 Summary:\n${event.detail.summary}\n\nAsk me any questions about the analysis!`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, analysisMessage]);
    };

    window.addEventListener('contractAnalysisComplete' as any, handleAnalysisUpdate);
    return () => {
      window.removeEventListener('contractAnalysisComplete' as any, handleAnalysisUpdate);
    };
  }, []);

  const generateResponse = async (userQuestion: string): Promise<string> => {
    if (!analysis) {
      return "Please upload a contract first using the Contract Analyzer above. Once analyzed, I can answer specific questions about it.";
    }

    // Format the context for the AI
    const context = `
      Contract Analysis Context:
      Summary: ${analysis.summary}
      Risk Score: ${analysis.riskScore}/100 (${analysis.riskScore < 30 ? 'Low' : analysis.riskScore < 60 ? 'Moderate' : 'High'} Risk)
      Key Terms: ${analysis.keyTerms.join(', ')}
      Potential Issues: ${analysis.potentialIssues.join(', ')}
      Recommendations: ${analysis.recommendations.join(', ')}
      
      User Question: ${userQuestion}
    `;

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          context,
          question: userQuestion
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Error generating response:', error);
      return "I apologize, but I'm having trouble processing your question. Please try asking in a different way or ask another question.";
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      isUser: true,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await generateResponse(input);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiResponse]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      console.error('Error in handleSend:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        handleSend();
      }
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all duration-300 flex items-center space-x-2"
      >
        <MessageSquare className="w-6 h-6" />
        <span>Contract Assistant</span>
      </button>
    );
  }

  return (
    <div 
      className={`fixed right-8 ${isMinimized ? 'bottom-8' : 'bottom-0'} transition-all duration-300 ${
        isMinimized ? 'h-12' : 'h-[600px]'
      } w-[400px] bg-white rounded-t-lg shadow-xl flex flex-col`}
    >
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          <MessageSquare className="text-indigo-600" />
          <h2 className="text-lg font-semibold">Contract Assistant</h2>
        </div>
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-600">AI-Powered</span>
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <MinusSquare className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white shadow text-gray-800'
                  }`}
                >
                  <div className={`text-sm prose ${message.isUser ? 'prose-invert' : ''} max-w-none`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.text}
                    </ReactMarkdown>
                  </div>
                  <div className="text-xs mt-1 opacity-75">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-center">
                <Loader className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            )}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t">
            <div className="flex space-x-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about contract analysis..."
                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={2}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className={`p-2 bg-indigo-600 text-white rounded-lg transition-colors ${
                  isLoading || !input.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                }`}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ContractAssistant;