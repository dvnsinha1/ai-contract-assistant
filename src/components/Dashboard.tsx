import React from 'react';
import ContractAnalyzer from './ContractAnalyzer';
import ContractAssistant from './ContractAssistant';

const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Contract Analysis Dashboard</h1>
          <p className="text-gray-600">
            Upload your DocuSign contracts for instant AI-powered analysis and insights.
          </p>
        </div>

        {/* Contract Analyzer */}
        <div className="mt-8">
          <ContractAnalyzer />
        </div>
      </div>

      {/* Floating Contract Assistant */}
      <ContractAssistant />
    </div>
  );
};

export default Dashboard;