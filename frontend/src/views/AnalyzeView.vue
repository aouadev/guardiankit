<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { analyzeTx } from '@/api/guardianApi'
import type { TxType, AnalysisResult } from '@/api/guardianApi'

const props = defineProps<{ tokenId: string }>()
const router = useRouter()

const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935'

const TX_TYPES: TxType[] = [
  'native_transfer',
  'token_transfer',
  'token_approve',
  'contract_interaction',
]

const TX_LABELS: Record<TxType, string> = {
  native_transfer: 'Native ETH Transfer',
  token_transfer: 'Token Transfer',
  token_approve: 'Token Approval',
  contract_interaction: 'Contract Interaction',
}

interface FormState {
  type: TxType
  recipient: string
  ethAmount: string
  tokenAddress: string
  amount: string
  spender: string
  unlimited: boolean
  contractAddress: string
  functionCall: string
}

const form = reactive<FormState>({
  type: 'native_transfer',
  recipient: '',
  ethAmount: '',
  tokenAddress: '',
  amount: '',
  spender: '',
  unlimited: false,
  contractAddress: '',
  functionCall: '',
})

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<AnalysisResult | null>(null)

const tokenId = computed(() => parseInt(props.tokenId))

function ethToWei(eth: string): string {
  const n = parseFloat(eth)
  if (isNaN(n)) return '0'
  return Math.floor(n * 1e18).toString()
}

async function submit() {
  error.value = null
  result.value = null
  loading.value = true

  try {
    const base = { type: form.type }
    let payload: ReturnType<typeof Object.assign>

    if (form.type === 'native_transfer') {
      if (!form.recipient || !form.ethAmount) throw new Error('Recipient and amount are required')
      payload = { ...base, recipient: form.recipient, amount: ethToWei(form.ethAmount) }
    } else if (form.type === 'token_transfer') {
      if (!form.tokenAddress || !form.recipient || !form.amount)
        throw new Error('Token address, recipient and amount are required')
      payload = { ...base, tokenAddress: form.tokenAddress, recipient: form.recipient, amount: form.amount }
    } else if (form.type === 'token_approve') {
      if (!form.tokenAddress || !form.spender) throw new Error('Token address and spender are required')
      if (!form.unlimited && !form.amount) throw new Error('Provide an amount or check Unlimited')
      payload = {
        ...base,
        tokenAddress: form.tokenAddress,
        spender: form.spender,
        amount: form.unlimited ? MAX_UINT256 : form.amount,
      }
    } else {
      if (!form.contractAddress || !form.functionCall)
        throw new Error('Contract address and function call are required')
      payload = { ...base, contractAddress: form.contractAddress, functionCall: form.functionCall }
    }

    result.value = await analyzeTx(tokenId.value, payload)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const EXAMPLES = {
  safe: {
    type: 'native_transfer' as TxType,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    ethAmount: '0.01',
    tokenAddress: '',
    amount: '',
    spender: '',
    unlimited: false,
    contractAddress: '',
    functionCall: '',
  },
  warning: {
    type: 'token_approve' as TxType,
    recipient: '',
    ethAmount: '',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '',
    spender: '0xe592427a0aece92de3edee1f18e0157c05861564',
    unlimited: true,
    contractAddress: '',
    functionCall: '',
  },
  danger: {
    type: 'token_approve' as TxType,
    recipient: '',
    ethAmount: '',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '',
    spender: '0x1234567890123456789012345678901234567890',
    unlimited: true,
    contractAddress: '',
    functionCall: '',
  },
}

function loadExample(key: keyof typeof EXAMPLES) {
  Object.assign(form, EXAMPLES[key])
  result.value = null
  error.value = null
}

const verdictStyle = computed(() => {
  if (!result.value) return {}
  const colors: Record<string, string> = {
    SAFE: 'var(--safe)',
    WARNING: 'var(--warning)',
    DANGER: 'var(--danger)',
  }
  return { color: colors[result.value.verdict], borderColor: colors[result.value.verdict] }
})

const verdictBg = computed(() => {
  if (!result.value) return {}
  const bgs: Record<string, string> = {
    SAFE: 'rgba(16,185,129,0.07)',
    WARNING: 'rgba(245,158,11,0.07)',
    DANGER: 'rgba(239,68,68,0.07)',
  }
  return { background: bgs[result.value.verdict] }
})

const verdictEmoji = computed(() => {
  if (!result.value) return ''
  return { SAFE: '✅', WARNING: '⚠️', DANGER: '🚨' }[result.value.verdict] ?? ''
})
</script>

<template>
  <div class="page">
    <button class="back-btn" @click="router.push('/')">← My Sentinels</button>

    <div class="page-header">
      <h1>Analyze Transaction</h1>
      <p class="subtitle">Sentinel #{{ tokenId }}</p>
    </div>

    <!-- Transaction type -->
    <div class="card">
      <h2>Transaction Type</h2>
      <div class="type-grid mt-sm">
        <label
          v-for="t in TX_TYPES"
          :key="t"
          class="type-option"
          :class="{ active: form.type === t }"
        >
          <input type="radio" :value="t" v-model="form.type" hidden />
          {{ TX_LABELS[t] }}
        </label>
      </div>
    </div>

    <!-- Fields -->
    <div class="card">
      <h2>Transaction Details</h2>
      <div class="fields mt-sm">

        <!-- native_transfer -->
        <template v-if="form.type === 'native_transfer'">
          <label class="field-label">Recipient address</label>
          <input v-model="form.recipient" class="input" placeholder="0x…" />
          <label class="field-label mt-sm">Amount (ETH)</label>
          <input
            v-model="form.ethAmount"
            class="input"
            placeholder="0.01"
            type="number"
            step="0.001"
            min="0"
          />
        </template>

        <!-- token_transfer -->
        <template v-else-if="form.type === 'token_transfer'">
          <label class="field-label">Token contract address</label>
          <input
            v-model="form.tokenAddress"
            class="input"
            placeholder="0xA0b8… (e.g. USDC)"
          />
          <label class="field-label mt-sm">Recipient address</label>
          <input v-model="form.recipient" class="input" placeholder="0x…" />
          <label class="field-label mt-sm">Amount <span class="muted">(smallest unit — USDC: 1 = 0.000001)</span></label>
          <input v-model="form.amount" class="input" placeholder="1000000 = 1 USDC" />
        </template>

        <!-- token_approve -->
        <template v-else-if="form.type === 'token_approve'">
          <label class="field-label">Token contract address</label>
          <input
            v-model="form.tokenAddress"
            class="input"
            placeholder="0xA0b8… (e.g. USDC)"
          />
          <label class="field-label mt-sm">Spender address</label>
          <input v-model="form.spender" class="input" placeholder="0x…" />
          <label class="toggle mt-sm">
            <input type="checkbox" v-model="form.unlimited" />
            <span>Unlimited approval <span class="muted">(max uint256)</span></span>
          </label>
          <template v-if="!form.unlimited">
            <label class="field-label mt-sm">Amount <span class="muted">(smallest unit)</span></label>
            <input v-model="form.amount" class="input" placeholder="1000000 = 1 USDC" />
          </template>
        </template>

        <!-- contract_interaction -->
        <template v-else>
          <label class="field-label">Contract address</label>
          <input v-model="form.contractAddress" class="input" placeholder="0x…" />
          <label class="field-label mt-sm">Function call</label>
          <input
            v-model="form.functionCall"
            class="input"
            placeholder="transfer(address,uint256)"
          />
        </template>
      </div>
    </div>

    <!-- Examples -->
    <div class="card">
      <h2>Try with example</h2>
      <div class="example-row mt-sm">
        <button class="btn btn-secondary example-btn" @click="loadExample('safe')">
          0.01 ETH transfer
        </button>
        <button class="btn btn-secondary example-btn" @click="loadExample('warning')">
          Unlimited USDC approval to Uniswap V3
        </button>
        <button class="btn btn-secondary example-btn" @click="loadExample('danger')">
          Unlimited USDC approval to unknown spender
        </button>
      </div>
    </div>

    <!-- Submit -->
    <button class="btn btn-primary full" :disabled="loading" @click="submit">
      <span v-if="loading" class="spinner" />
      {{ loading ? 'Analyzing…' : 'Analyze Transaction' }}
    </button>

    <p v-if="error" class="error mt-sm">{{ error }}</p>

    <!-- Verdict -->
    <div
      v-if="result"
      class="verdict-card mt"
      :style="{ ...verdictStyle, ...verdictBg }"
    >
      <div class="verdict-header">
        <span class="verdict-emoji">{{ verdictEmoji }}</span>
        <span class="verdict-label" :style="verdictStyle">{{ result.verdict }}</span>
        <span class="confidence-badge">{{ Math.round(result.confidence * 100) }}% confident</span>
      </div>

      <p class="verdict-reason">{{ result.reason }}</p>

      <div class="confidence-bar">
        <div
          class="confidence-fill"
          :style="{ width: `${result.confidence * 100}%`, background: verdictStyle.color }"
        />
      </div>

      <p class="verdict-meta">
        Provider: {{ result.providerUsed }} &nbsp;·&nbsp; {{ result.responseTimeMs }}ms
      </p>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 720px; margin: 0 auto; padding: 32px 20px; }

.back-btn {
  background: none; border: none; color: var(--muted);
  cursor: pointer; font-size: 0.9rem; padding: 0; margin-bottom: 16px;
}
.back-btn:hover { color: var(--text); }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 1.75rem; font-weight: 700; }
.subtitle { color: var(--muted); margin-top: 4px; }

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.card h2 { font-size: 1.05rem; font-weight: 600; }

.mt-sm { margin-top: 10px; }
.mt { margin-top: 16px; }
.full { width: 100%; padding: 12px; font-size: 1rem; }
.muted { color: var(--muted); }
.error { color: var(--danger); font-size: 0.85rem; }

/* Type selector */
.type-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.type-option {
  padding: 8px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg);
  font-size: 0.85rem; color: var(--muted);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  user-select: none;
}
.type-option.active {
  border-color: var(--blue);
  color: var(--blue);
  background: rgba(59, 130, 246, 0.1);
}
.type-option:hover:not(.active) { border-color: var(--muted); color: var(--text); }

/* Fields */
.fields { display: flex; flex-direction: column; }
.field-label { font-size: 0.82rem; color: var(--muted); margin-bottom: 4px; }
.input {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); font-size: 0.95rem; outline: none;
}
.input:focus { border-color: var(--blue); }
.toggle {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; font-size: 0.9rem; color: var(--text);
  margin-top: 10px;
}
.toggle input[type='checkbox'] { width: 16px; height: 16px; cursor: pointer; }

/* Examples */
.example-row { display: flex; gap: 8px; flex-wrap: wrap; }
.example-btn { font-size: 0.8rem; padding: 7px 12px; }

/* Submit spinner */
.btn .spinner, .full .spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.8s linear infinite;
  vertical-align: middle; margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Verdict */
.verdict-card {
  border: 2px solid;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
}
.verdict-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
}
.verdict-emoji { font-size: 2rem; line-height: 1; }
.verdict-label { font-size: 1.6rem; font-weight: 800; letter-spacing: 0.06em; }
.confidence-badge {
  margin-left: auto; font-size: 0.85rem;
  color: var(--muted); background: var(--bg);
  padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--border);
}
.verdict-reason {
  font-size: 0.95rem; color: var(--text);
  line-height: 1.6; margin-bottom: 16px;
}
.confidence-bar {
  height: 4px; background: var(--border);
  border-radius: 2px; margin-bottom: 12px; overflow: hidden;
}
.confidence-fill {
  height: 100%; border-radius: 2px;
  transition: width 0.6s ease;
}
.verdict-meta { font-size: 0.78rem; color: var(--muted); }
</style>
