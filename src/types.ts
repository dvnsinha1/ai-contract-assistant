export interface Agreement {
  id: string;
  title: string;
  status: 'draft' | 'pending' | 'active' | 'expired';
  startDate: string;
  endDate: string;
  value: number;
  riskScore: number;
  keyTerms: string[];
  lastModified: string;
}

export interface RiskMetrics {
  overall: number;
  financial: number;
  compliance: number;
  performance: number;
}

export interface TrendData {
  month: string;
  activeAgreements: number;
  totalValue: number;
  averageRisk: number;
}