<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { createSentinel, getSentinel } from '@/api/guardianApi'
import type { SentinelInfo, CreateSentinelResponse } from '@/api/guardianApi'

const router = useRouter()
const wallet = useWalletStore()

const sentinels = ref<SentinelInfo[]>([])
const loadingList = ref(false)
const creating = ref(false)
const createResult = ref<CreateSentinelResponse | null>(null)
const createError = ref<string | null>(null)
const lookupId = ref('')
const lookupError = ref<string | null>(null)

function getStoredIds(): number[] {
  if (!wallet.account) return []
  const raw = localStorage.getItem(`sentinels_${wallet.account.toLowerCase()}`)
  return raw ? (JSON.parse(raw) as number[]) : []
}

function storeId(tokenId: number) {
  if (!wallet.account) return
  const ids = getStoredIds()
  if (!ids.includes(tokenId)) {
    ids.push(tokenId)
    localStorage.setItem(
      `sentinels_${wallet.account.toLowerCase()}`,
      JSON.stringify(ids),
    )
  }
}

async function loadSentinels() {
  const ids = getStoredIds()
  if (ids.length === 0) {
    sentinels.value = []
    return
  }
  loadingList.value = true
  const results = await Promise.allSettled(ids.map((id) => getSentinel(id)))
  sentinels.value = results
    .filter((r): r is PromiseFulfilledResult<SentinelInfo> => r.status === 'fulfilled')
    .map((r) => r.value)
  loadingList.value = false
}

async function handleCreate() {
  if (!wallet.account) return
  creating.value = true
  createResult.value = null
  createError.value = null
  try {
    const result = await createSentinel(wallet.account)
    createResult.value = result
    storeId(result.tokenId)
    await loadSentinels()
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e)
  } finally {
    creating.value = false
  }
}

async function handleLookup() {
  const id = parseInt(lookupId.value)
  if (isNaN(id) || id < 1) {
    lookupError.value = 'Enter a valid token ID'
    return
  }
  lookupError.value = null
  try {
    const info = await getSentinel(id)
    storeId(id)
    if (!sentinels.value.find((s) => s.tokenId === id)) {
      sentinels.value.push(info)
    }
    lookupId.value = ''
  } catch {
    lookupError.value = `Token #${id} not found on-chain`
  }
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

watch(() => wallet.account, () => {
  createResult.value = null
  loadSentinels()
})
onMounted(() => loadSentinels())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>My Sentinels</h1>
      <p class="subtitle">AI Wallet Guardians stored as iNFTs on 0G Chain</p>
    </div>

    <!-- Not connected -->
    <div v-if="!wallet.account" class="card center">
      <p class="muted">Connect your wallet to view and create Sentinel iNFTs.</p>
      <button class="btn btn-primary mt" @click="wallet.connect()">Connect Wallet</button>
    </div>

    <template v-else>
      <!-- Create -->
      <div class="card">
        <div class="row-between">
          <div>
            <h2>Create a new Sentinel</h2>
            <p class="muted small mt-xs">Mints a Guardian iNFT on 0G Chain (~30s).</p>
          </div>
          <button class="btn btn-primary" :disabled="creating" @click="handleCreate">
            <span v-if="creating" class="spinner" /> {{ creating ? 'Minting…' : '+ New Sentinel' }}
          </button>
        </div>

        <div v-if="creating" class="status-row">
          <span class="spinner" /> Uploading memory to 0G Storage, then minting on-chain…
        </div>

        <div v-if="createResult" class="success-box mt-sm">
          <strong>✅ Sentinel #{{ createResult.tokenId }} created!</strong>
          <p class="small muted mt-xs">
            Storage: {{ createResult.storageTxHash.slice(0, 22) }}…
          </p>
          <a :href="createResult.explorerUrl" target="_blank" class="link small">
            View mint tx on Explorer →
          </a>
        </div>

        <p v-if="createError" class="error mt-sm">{{ createError }}</p>
      </div>

      <!-- Look up by ID -->
      <div class="card">
        <h2>Track a Sentinel by ID</h2>
        <p class="muted small mt-xs">Enter any token ID to add it to your tracked list.</p>
        <div class="row-gap mt-sm">
          <input
            v-model="lookupId"
            class="input"
            placeholder="Token ID (e.g. 1)"
            type="number"
            min="1"
            @keyup.enter="handleLookup"
          />
          <button class="btn btn-secondary" @click="handleLookup">Track</button>
        </div>
        <p v-if="lookupError" class="error small mt-xs">{{ lookupError }}</p>
      </div>

      <!-- List -->
      <div class="card">
        <h2>Your Sentinels</h2>
        <p v-if="loadingList" class="muted small mt-sm">Loading…</p>
        <p v-else-if="sentinels.length === 0" class="muted small mt-sm">
          No sentinels tracked yet. Create one or enter a token ID above.
        </p>
        <div v-else class="sentinel-list mt-sm">
          <div v-for="s in sentinels" :key="s.tokenId" class="sentinel-card">
            <div class="sentinel-info">
              <span class="token-id">#{{ s.tokenId }}</span>
              <div>
                <p class="small"><span class="muted">Owner:</span> {{ shortAddr(s.owner) }}</p>
                <p class="small"><span class="muted">Memory:</span> {{ s.encryptedURI.slice(0, 20) }}…</p>
              </div>
            </div>
            <button
              class="btn btn-primary small-btn"
              @click="router.push(`/analyze/${s.tokenId}`)"
            >
              Analyze →
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 720px; margin: 0 auto; padding: 32px 20px; }
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
.center { text-align: center; padding: 40px 20px; }

.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.row-gap { display: flex; gap: 8px; align-items: center; }
.mt { margin-top: 16px; }
.mt-sm { margin-top: 10px; }
.mt-xs { margin-top: 4px; }
.small { font-size: 0.85rem; }
.muted { color: var(--muted); }
.link { color: var(--blue); }
.error { color: var(--danger); font-size: 0.85rem; }

.status-row {
  display: flex; align-items: center; gap: 8px;
  color: var(--muted); font-size: 0.9rem; margin-top: 12px;
}

.spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--border); border-top-color: var(--blue);
  border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.success-box {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
}

.input {
  flex: 1; padding: 9px 12px; border-radius: 8px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); font-size: 0.95rem; outline: none;
  min-width: 0;
}
.input:focus { border-color: var(--blue); }

.sentinel-list { display: flex; flex-direction: column; gap: 10px; }
.sentinel-card {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 16px; gap: 12px;
}
.sentinel-info { display: flex; align-items: center; gap: 16px; min-width: 0; }
.token-id { font-size: 1.4rem; font-weight: 700; color: var(--blue); flex-shrink: 0; }
.small-btn { padding: 7px 14px; font-size: 0.85rem; flex-shrink: 0; }
</style>
