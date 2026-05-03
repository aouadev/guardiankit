import { defineStore } from 'pinia'
import { ref } from 'vue'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

export const useWalletStore = defineStore('wallet', () => {
  const account = ref<string | null>(null)

  async function connect() {
    if (!window.ethereum) {
      alert('MetaMask is not installed')
      return
    }
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      account.value = accounts[0] ?? null
    } catch (e) {
      console.error('Wallet connection failed:', e)
    }
  }

  return { account, connect }
})
