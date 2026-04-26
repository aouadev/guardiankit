export interface TransactionAnalysisResult {
  network: string
  riskScore: number
  status: string
  summary: string
  warnings: string[]
  recommendation: string
  explanation: string
  transactionPreview: string
}
