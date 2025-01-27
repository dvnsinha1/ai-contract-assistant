import { Agreement, TrendData } from './types';

export const mockAgreements: Agreement[] = [
  {
    id: '1',
    title: 'Enterprise Software License Agreement',
    status: 'active',
    startDate: '2024-01-15',
    endDate: '2025-01-14',
    value: 250000,
    riskScore: 65,
    keyTerms: ['Annual renewal', 'Data protection', 'SLA 99.9%'],
    lastModified: '2024-02-20'
  },
  {
    id: '2',
    title: 'Cloud Services Partnership',
    status: 'pending',
    startDate: '2024-03-01',
    endDate: '2026-02-28',
    value: 500000,
    riskScore: 72,
    keyTerms: ['Revenue sharing', 'Exclusivity', 'Termination clause'],
    lastModified: '2024-02-25'
  },
  {
    id: '3',
    title: 'Professional Services Agreement',
    status: 'active',
    startDate: '2023-11-01',
    endDate: '2024-10-31',
    value: 150000,
    riskScore: 45,
    keyTerms: ['Milestone payments', 'IP rights', 'Non-compete'],
    lastModified: '2024-02-15'
  },
  {
    id: '4',
    title: 'Hardware Supply Agreement',
    status: 'expired',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    value: 750000,
    riskScore: 85,
    keyTerms: ['Warranty', 'Delivery terms', 'Price adjustment'],
    lastModified: '2024-01-01'
  },
  {
    id: '5',
    title: 'Marketing Services Contract',
    status: 'active',
    startDate: '2024-02-01',
    endDate: '2025-01-31',
    value: 180000,
    riskScore: 55,
    keyTerms: ['Performance metrics', 'Content rights', 'Cancellation terms'],
    lastModified: '2024-02-22'
  }
];

export const mockTrends: TrendData[] = [
  { month: 'Jan', activeAgreements: 45, totalValue: 2500000, averageRisk: 68 },
  { month: 'Feb', activeAgreements: 48, totalValue: 2750000, averageRisk: 65 },
  { month: 'Mar', activeAgreements: 52, totalValue: 3000000, averageRisk: 70 },
  { month: 'Apr', activeAgreements: 50, totalValue: 2900000, averageRisk: 72 },
  { month: 'May', activeAgreements: 55, totalValue: 3250000, averageRisk: 69 }
];