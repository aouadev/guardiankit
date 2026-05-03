const BASE_URL = 'http://localhost:3000'

export interface CreateSentinelResponse {
  tokenId: number
  owner: string
  rootHash: string
  storageTxHash: string
  mintTxHash: string
  explorerUrl: string
  createdAt: string
}

export interface SentinelInfo {
  tokenId: number
  owner: string
  encryptedURI: string
  metadataHash: string
}

export type Verdict = 'SAFE' | 'WARNING' | 'DANGER'

export interface AnalysisResult {
  verdict: Verdict
  reason: string
  confidence: number
  providerUsed: string
  responseTimeMs: number
}

export type TxType =
  | 'native_transfer'
  | 'token_transfer'
  | 'token_approve'
  | 'contract_interaction'

export interface TxPayload {
  type: TxType
  recipient?: string
  amount?: string
  tokenAddress?: string
  spender?: string
  contractAddress?: string
  functionCall?: string
  params?: Record<string, string>
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function createSentinel(
  recipient?: string,
  agentName?: string,
): Promise<CreateSentinelResponse> {
  return apiFetch('/inft/create', {
    method: 'POST',
    body: JSON.stringify({ recipient, agentName }),
  })
}

export function getSentinel(tokenId: number): Promise<SentinelInfo> {
  return apiFetch(`/inft/${tokenId}`)
}

export function analyzeTx(tokenId: number, payload: TxPayload): Promise<AnalysisResult> {
  return apiFetch(`/inft/${tokenId}/analyze`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
