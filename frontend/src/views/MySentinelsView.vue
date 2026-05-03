<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { createSentinel, getSentinel, getSentinelMemory } from '@/api/guardianApi'
import type { SentinelInfo, AgentMemory, CreateSentinelResponse } from '@/api/guardianApi'

const router = useRouter()
const wallet = useWalletStore()

interface SentinelCard {
  info: SentinelInfo
  memory: AgentMemory | null
  memoryLoading: boolean
}

const cards = ref<SentinelCard[]>([])
const loadingList = ref(false)

// Create form
const showCreateForm = ref(false)
const agentNameInput = ref('')
const creating = ref(false)
const createResult = ref<CreateSentinelResponse | null>(null)
const createError = ref<string | null>(null)

// Lookup
const lookupId = ref('')
const lookupError = ref<string | null>(null)

// Copy-to-clipboard state
const copiedHash = ref<string | null>(null)

// ── localStorage helpers ──────────────────────────────────────
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
    localStorage.setItem(`sentinels_${wallet.account.toLowerCase()}`, JSON.stringify(ids))
  }
}

// ── Load sentinels ─────────────────────────────────────────────
async function loadSentinels() {
  const ids = getStoredIds()
  if (ids.length === 0) { cards.value = []; return }

  loadingList.value = true

  // 1. Fetch on-chain info first (fast RPC calls)
  const infoResults = await Promise.allSettled(ids.map((id) => getSentinel(id)))
  const validCards: SentinelCard[] = infoResults
    .filter((r): r is PromiseFulfilledResult<SentinelInfo> => r.status === 'fulfilled')
    .map((r) => ({ info: r.value, memory: null, memoryLoading: true }))

  cards.value = validCards
  loadingList.value = false

  // 2. Fetch memories in parallel without blocking the list render
  validCards.forEach(async (card, index) => {
    try {
      const memory = await getSentinelMemory(card.info.tokenId)
      cards.value[index] = { ...card, memory, memoryLoading: false }
    } catch {
      cards.value[index] = { ...card, memoryLoading: false }
    }
  })
}

// ── Create ────────────────────────────────────────────────────
async function handleCreate() {
  const name = agentNameInput.value.trim()
  if (!name || !wallet.account) return
  creating.value = true
  createResult.value = null
  createError.value = null
  try {
    const result = await createSentinel(wallet.account, name)
    createResult.value = result
    agentNameInput.value = ''
    showCreateForm.value = false
    storeId(result.tokenId)
    await loadSentinels()
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e)
  } finally {
    creating.value = false
  }
}

function cancelCreate() {
  showCreateForm.value = false
  agentNameInput.value = ''
  createError.value = null
}

// ── Lookup ────────────────────────────────────────────────────
async function handleLookup() {
  const id = parseInt(lookupId.value)
  if (isNaN(id) || id < 1) { lookupError.value = 'Enter a valid token ID'; return }
  lookupError.value = null
  try {
    const info = await getSentinel(id)
    storeId(id)
    if (!cards.value.find((c) => c.info.tokenId === id)) {
      const card: SentinelCard = { info, memory: null, memoryLoading: true }
      cards.value.push(card)
      const index = cards.value.length - 1
      try {
        const memory = await getSentinelMemory(id)
        cards.value[index] = { ...card, memory, memoryLoading: false }
      } catch {
        cards.value[index] = { ...card, memoryLoading: false }
      }
    }
    lookupId.value = ''
  } catch {
    lookupError.value = `Token #${id} not found on-chain`
  }
}

// ── Helpers ───────────────────────────────────────────────────
async function copyHash(hash: string) {
  try {
    await navigator.clipboard.writeText(hash)
    copiedHash.value = hash
    setTimeout(() => { copiedHash.value = null }, 2000)
  } catch { /* ignore */ }
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function isOwnWallet(addr: string): boolean {
  return !!wallet.account && addr.toLowerCase() === wallet.account.toLowerCase()
}

function displayName(card: SentinelCard): string {
  return card.memory?.agentName ?? `Sentinel #${card.info.tokenId}`
}

const LEVEL_COLOR: Record<string, string> = {
  novice: '#64748b',
  intermediate: '#3b82f6',
  expert: '#f59e0b',
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
      <!-- ── Create card ── -->
      <div class="card">
        <div class="row-between">
          <div>
            <h2>Create a new Sentinel</h2>
            <p class="muted small mt-xs">Mints a Guardian iNFT on 0G Chain (~30s).</p>
          </div>
          <button
            v-if="!showCreateForm"
            class="btn btn-primary"
            @click="showCreateForm = true"
          >
            + New Sentinel
          </button>
        </div>

        <!-- Inline form -->
        <div v-if="showCreateForm" class="create-form mt-sm">
          <div class="input-wrap">
            <input
              v-model="agentNameInput"
              class="input"
              placeholder="e.g. Sentinel Prime"
              maxlength="50"
              :disabled="creating"
              autofocus
              @keyup.enter="handleCreate"
              @keyup.escape="cancelCreate"
            />
            <span class="char-count">{{ agentNameInput.length }}/50</span>
          </div>
          <div class="create-actions">
            <button
              class="btn btn-primary"
              :disabled="!agentNameInput.trim() || creating"
              @click="handleCreate"
            >
              <span v-if="creating" class="spinner white-spin" />
              {{ creating ? 'Minting…' : 'Mint Sentinel' }}
            </button>
            <button class="btn btn-secondary" :disabled="creating" @click="cancelCreate">
              Cancel
            </button>
          </div>
        </div>

        <div v-if="creating" class="status-row mt-sm">
          <span class="spinner" /> Uploading memory to 0G Storage, then minting on-chain…
        </div>

        <div v-if="createResult" class="success-box mt-sm">
          <strong>✅ Sentinel #{{ createResult.tokenId }} created!</strong>
          <p class="small muted mt-xs">Storage: {{ createResult.storageTxHash.slice(0, 22) }}…</p>
          <a :href="createResult.explorerUrl" target="_blank" class="link small">
            View mint tx on Explorer →
          </a>
        </div>

        <p v-if="createError" class="error mt-sm">{{ createError }}</p>
      </div>

      <!-- ── Track by ID ── -->
      <div class="card">
        <h2>Track a Sentinel by ID</h2>
        <p class="muted small mt-xs">Enter any token ID to add it to your tracked list.</p>
        <div class="row-gap mt-sm">
          <input
            v-model="lookupId"
            class="input"
            placeholder="Token ID (e.g. 2)"
            type="number"
            min="1"
            @keyup.enter="handleLookup"
          />
          <button class="btn btn-secondary" @click="handleLookup">Track</button>
        </div>
        <p v-if="lookupError" class="error small mt-xs">{{ lookupError }}</p>
      </div>

      <!-- ── Sentinel list ── -->
      <div class="card">
        <h2>Your Sentinels</h2>
        <p v-if="loadingList" class="muted small mt-sm">Loading…</p>
        <p v-else-if="cards.length === 0" class="muted small mt-sm">
          No sentinels tracked yet. Create one or enter a token ID above.
        </p>
        <div v-else class="sentinel-list mt-sm">
          <div v-for="(card, index) in cards" :key="card.info.tokenId" class="sentinel-card">

            <!-- Left: rich info -->
            <div class="sentinel-info">

              <!-- Name + ID chip -->
              <div class="name-row">
                <template v-if="card.memoryLoading">
                  <div class="skeleton name-skel" />
                </template>
                <span v-else class="agent-name">{{ displayName(card) }}</span>
                <span class="token-chip">#{{ card.info.tokenId }}</span>
              </div>

              <!-- Stats badges -->
              <div class="badge-row mt-xs">
                <template v-if="card.memoryLoading">
                  <div class="skeleton badge-skel" />
                  <div class="skeleton badge-skel" />
                  <div class="skeleton badge-skel short" />
                </template>
                <template v-else-if="card.memory">
                  <span class="badge">{{ card.memory.stats.totalAnalyses }} analyses</span>
                  <span class="badge">{{ card.memory.stats.scamsBlocked }} scams blocked</span>
                  <span
                    class="badge level-badge"
                    :style="{ color: LEVEL_COLOR[card.memory.stats.experienceLevel], borderColor: LEVEL_COLOR[card.memory.stats.experienceLevel] + '66' }"
                  >
                    {{ card.memory.stats.experienceLevel }}
                  </span>
                </template>
                <span v-else class="muted small">Memory unavailable</span>
              </div>

              <!-- Memory hash + owner -->
              <div class="meta-row mt-xs">
                <button
                  class="hash-btn"
                  :title="card.info.encryptedURI"
                  @click="copyHash(card.info.encryptedURI)"
                >
                  <span class="hash-icon">📦</span>
                  <span class="hash-text">{{ card.info.encryptedURI.slice(0, 20) }}…</span>
                  <span v-if="copiedHash === card.info.encryptedURI" class="copied-tag">Copied!</span>
                </button>
                <span v-if="!isOwnWallet(card.info.owner)" class="owner-tag">
                  · {{ shortAddr(card.info.owner) }}
                </span>
              </div>
            </div>

            <!-- Right: CTA -->
            <button
              class="btn btn-primary analyze-btn"
              @click="router.push(`/analyze/${card.info.tokenId}`)"
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
/* ── Layout ── */
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

/* ── Spacing helpers ── */
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.row-gap { display: flex; gap: 8px; align-items: center; }
.mt { margin-top: 16px; }
.mt-sm { margin-top: 10px; }
.mt-xs { margin-top: 4px; }
.small { font-size: 0.85rem; }
.muted { color: var(--muted); }
.link { color: var(--blue); }
.error { color: var(--danger); font-size: 0.85rem; }

/* ── Create form ── */
.create-form { display: flex; flex-direction: column; gap: 8px; }
.input-wrap { position: relative; }
.char-count {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  font-size: 0.72rem; color: var(--muted); pointer-events: none;
}
.create-actions { display: flex; gap: 8px; }

.status-row {
  display: flex; align-items: center; gap: 8px;
  color: var(--muted); font-size: 0.9rem;
}
.success-box {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px; padding: 12px 16px;
}

/* ── Inputs ── */
.input {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); font-size: 0.95rem; outline: none; min-width: 0;
}
.input:focus { border-color: var(--blue); }

/* ── Spinner ── */
.spinner {
  display: inline-block; width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid var(--border); border-top-color: var(--blue);
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
.white-spin { border-color: rgba(255,255,255,0.3); border-top-color: white; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Sentinel cards ── */
.sentinel-list { display: flex; flex-direction: column; gap: 12px; }
.sentinel-card {
  display: flex; align-items: flex-start; justify-content: space-between;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px; gap: 12px;
}
.sentinel-info { flex: 1; min-width: 0; }

/* Name row */
.name-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.agent-name { font-size: 1.2rem; font-weight: 700; color: var(--text); }
.token-chip {
  font-size: 0.72rem; color: var(--muted);
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 20px; padding: 1px 8px; flex-shrink: 0;
}

/* Badges */
.badge-row { display: flex; flex-wrap: wrap; gap: 6px; }
.badge {
  font-size: 0.75rem; color: var(--muted);
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 20px; padding: 2px 10px;
}
.level-badge { font-weight: 500; }

/* Skeleton shimmer */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #1e293b 25%, #2d3f55 50%, #1e293b 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
.name-skel  { height: 22px; width: 150px; }
.badge-skel { height: 22px; width: 90px; border-radius: 20px; }
.badge-skel.short { width: 70px; }

/* Meta row (hash + owner) */
.meta-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hash-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  padding: 2px 6px; border-radius: 6px;
  color: var(--muted); font-size: 0.78rem;
  transition: background 0.15s, color 0.15s;
}
.hash-btn:hover { background: var(--bg-card); color: var(--text); }
.hash-text { font-family: monospace; letter-spacing: -0.01em; }
.copied-tag { color: var(--safe); font-size: 0.72rem; font-weight: 600; }
.owner-tag { font-size: 0.78rem; color: var(--muted); }

/* Analyze button */
.analyze-btn { padding: 8px 16px; font-size: 0.85rem; flex-shrink: 0; align-self: center; }
</style>
