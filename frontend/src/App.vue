<script setup lang="ts">
import { ref } from 'vue'

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

const account = ref<string | null>(null)

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
</script>

<template>
  <main class="app">
    <section class="hero">
      <p class="badge">iNFT Security Agent</p>

      <h1>AI Wallet Guardian</h1>

      <p class="subtitle">
        An AI-powered assistant that helps you understand and secure your blockchain transactions.
      </p>

      <button class="primary-btn" @click="connectWallet">
        {{ account ? 'Connected' : 'Connect Wallet' }}
      </button>
      <p v-if="account" class="address">Connected: {{ account }}</p>
    </section>

    <section class="card">
      <h2>Analyze a Transaction</h2>
      <p>Paste transaction details and let your Guardian Agent detect potential risks.</p>

      <textarea
        placeholder="Paste transaction data, contract address, or approval details..."
      ></textarea>

      <button class="primary-btn full">Analyze Transaction</button>
    </section>
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  padding: 64px 24px;
  background: #0f172a;
  color: white;
  font-family: Arial, sans-serif;
}

.hero {
  max-width: 900px;
  margin: 0 auto 40px;
  text-align: center;
}

.badge {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 999px;
  background: #1e293b;
  color: #93c5fd;
  font-size: 14px;
}

h1 {
  font-size: 56px;
  margin: 24px 0 16px;
}

.subtitle {
  max-width: 680px;
  margin: 0 auto;
  color: #cbd5e1;
  font-size: 20px;
  line-height: 1.6;
}

.actions {
  margin-top: 32px;
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

button {
  border: none;
  cursor: pointer;
  border-radius: 12px;
  padding: 14px 22px;
  font-size: 16px;
  font-weight: 600;
}

.primary-btn {
  background: #2563eb;
  color: white;
}

.secondary-btn {
  background: #334155;
  color: white;
}

.card {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px;
  border-radius: 24px;
  background: #111827;
  border: 1px solid #334155;
}

.card h2 {
  margin-top: 0;
  font-size: 28px;
}

.card p {
  color: #cbd5e1;
}

textarea {
  width: 100%;
  min-height: 140px;
  margin: 20px 0;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #475569;
  background: #020617;
  color: white;
  font-size: 15px;
  resize: vertical;
}

.full {
  width: 100%;
}
.address {
  margin-top: 12px;
  color: #93c5fd;
  font-size: 14px;
}
</style>
