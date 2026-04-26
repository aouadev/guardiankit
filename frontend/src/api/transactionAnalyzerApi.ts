import type { TransactionAnalysisResult } from '@/types/transactionAnalysis'

export async function analyzeTransactionApi(
  transactionData: string,
): Promise<TransactionAnalysisResult> {
  const response = await fetch('http://localhost:3000/transaction-analyzer/analyze', {
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
