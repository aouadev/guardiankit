import type { TransactionAnalysisResult } from '@/types/transactionAnalysis'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function analyzeTransactionApi(
  transactionData: string,
): Promise<TransactionAnalysisResult> {
  const response = await fetch(`${BASE_URL}/transaction-analyzer/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactionData }),
  })

  if (!response.ok) {
    throw new Error('Failed to analyze transaction')
  }

  return response.json()
}
