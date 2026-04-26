<script setup lang="ts">
import { ref } from 'vue'
import { analyzeTransactionApi } from '@/api/transactionAnalyzerApi'
import type { TransactionAnalysisResult } from '@/types/transactionAnalysis'

// ---------------- STATE ----------------
const account = ref<string | null>(null)
const transactionData = ref('')
const analysisResult = ref<TransactionAnalysisResult | null>(null)

// ---------------- TYPES ----------------
interface EthereumRequestArgs {
  method: string
  params?: unknown[]
}

interface EthereumProvider {
  request: (args: EthereumRequestArgs) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

// ---------------- WALLET ----------------
const connectWallet = async () => {
  try {
    if (!window.ethereum) {
      alert('MetaMask is not installed')
      return
    }

    const accounts = (await window.ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[]

    account.value = accounts[0] ?? null
  } catch (error) {
    console.error(error)
  }
}

// ---------------- ANALYZER ----------------
const analyzeTransaction = async () => {
  if (!transactionData.value.trim()) {
    alert('Please enter transaction data')
    return
  }

  try {
    analysisResult.value = await analyzeTransactionApi(transactionData.value)
  } catch (error) {
    console.error(error)
    alert('Error analyzing transaction')
  }
}
</script>

<template>
  <div class="container">
    <!-- Wallet -->
    <div class="wallet">
      <button class="primary-btn" @click="connectWallet">
        {{ account ? 'Connected' : 'Connect Wallet' }}
      </button>
      <p v-if="account">Connected: {{ account }}</p>
    </div>

    <!-- Analyzer -->
    <div class="card">
      <h2>Analyze a Transaction</h2>
      <p>Paste transaction details and let your Guardian Agent detect risks.</p>

      <textarea v-model="transactionData" placeholder="Paste transaction data..."></textarea>

      <button class="primary-btn full" @click="analyzeTransaction">Analyze Transaction</button>

      <!-- Result -->
      <div v-if="analysisResult" class="result">
        <h3>Analysis Result</h3>
        <p><strong>Network:</strong> {{ analysisResult.network }}</p>
        <p><strong>Status:</strong> {{ analysisResult.status }}</p>
        <p><strong>Risk Score:</strong> {{ analysisResult.riskScore }}/100</p>
        <p><strong>Summary:</strong> {{ analysisResult.summary }}</p>
        <p><strong>Explanation:</strong> {{ analysisResult.explanation }}</p>
        <p><strong>Recommendation:</strong> {{ analysisResult.recommendation }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: auto;
  padding: 40px;
  color: white;
}

.wallet {
  margin-bottom: 20px;
}

.card {
  padding: 20px;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid #334155;
}

textarea {
  width: 100%;
  height: 120px;
  margin-top: 10px;
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #020617;
  color: white;
  border: 1px solid #475569;
}

.primary-btn {
  padding: 10px 16px;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  border: none;
  cursor: pointer;
}

.full {
  width: 100%;
}

.result {
  margin-top: 20px;
  padding: 16px;
  border-radius: 12px;
  background: #020617;
  border: 1px solid #475569;
}
</style>
