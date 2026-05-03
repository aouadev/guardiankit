import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OgStorageService } from '../og-storage/og-storage.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { AnalysisResultDto } from '../llm/dto/analysis-result.dto';
import { AnalyzeTransactionDto } from './dto/analyze-transaction.dto';
import {
  AgentHistoryEntry,
  AgentMemory,
} from './interfaces/agent-memory.interface';
import { TransactionEnricherService } from '../transaction-enricher/transaction-enricher.service';
import GuardianINFTArtifact from './abi/GuardianINFT.json';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import {
  CreateGuardianResponseDto,
  InftInfoDto,
} from './dto/inft-response.dto';
@Injectable()
export class InftService implements OnModuleInit {
  private readonly logger = new Logger(InftService.name);
  private contract!: ethers.Contract;
  private signer!: ethers.Wallet;
  private contractAddress!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ogStorageService: OgStorageService,
    private readonly llmRouter: LlmRouterService,
    private readonly transactionEnricher: TransactionEnricherService,
  ) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('OG_RPC_URL') ?? '';
    const privateKey = this.configService.get<string>('PRIVATE_KEY') ?? '';
    this.contractAddress =
      this.configService.get<string>('GUARDIAN_INFT_ADDRESS') ?? '';

    if (!rpcUrl || !privateKey || !this.contractAddress) {
      throw new Error(
        'Missing required env: OG_RPC_URL, PRIVATE_KEY, GUARDIAN_INFT_ADDRESS',
      );
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);

    // ABI is in the "abi" property of the Hardhat artifact JSON
    const abi = (GuardianINFTArtifact as { abi: ethers.InterfaceAbi }).abi;
    this.contract = new ethers.Contract(this.contractAddress, abi, this.signer);

    this.logger.log(
      `iNFT service initialized — contract: ${this.contractAddress}`,
    );
  }

  /**
   * Full workflow: build agent memory → upload to 0G Storage → mint iNFT pointing to it.
   */
  async createGuardian(
    dto: CreateGuardianDto,
  ): Promise<CreateGuardianResponseDto> {
    try {
      // 1. Determine recipient (default: backend signer)
      const recipient = dto.recipient ?? this.signer.address;
      this.logger.log(`Creating Guardian for ${recipient}`);

      // 2. Get next tokenId for naming
      const totalMinted = (await this.contract.totalMinted()) as bigint;
      const nextTokenId = Number(totalMinted) + 1;

      // 3. Build initial memory JSON
      const defaultSystemPrompt = `You are a blockchain transaction security analyzer.

Your role is to evaluate transactions and classify them as SAFE, WARNING, or DANGER.

You must base your decision only on observable facts:
- transaction type
- token or contract involved
- permissions granted (if any)
- known reputation (if available)
- potential impact (loss, approval, control)

## Rules by transaction type

### Native transfer (ETH/0G sent directly to a wallet)
- Default verdict: SAFE.
- No smart contract is involved, so the attack surface is minimal.
- Upgrade to WARNING only if the recipient is in your known scam list.
- Never classify a small or normal native transfer as WARNING just because the recipient is unknown.

### Token transfer (ERC-20 sent to a recipient)
- If the token is a well-known verified token (USDC, DAI, WETH, etc.): SAFE.
- If the token is unverified or very recently deployed: WARNING.
- Unknown recipient alone is not a reason for WARNING.

### Token approve (granting a spender permission to use tokens)
- Known, verified protocol (Uniswap, Aave, Compound, etc.) + limited amount: SAFE.
- Known, verified protocol + unlimited amount: WARNING.
- Unknown or unverified spender + any amount: WARNING.
- Unknown or unverified spender + unlimited amount: DANGER.
- Spender deployed less than 7 days ago: DANGER regardless of approval amount.

### Contract interaction
- Verified contract with a standard function: SAFE or WARNING depending on context.
- Unverified or fresh contract: WARNING or DANGER depending on the function called.

## General principles
- Unknown does not mean malicious.
- Do not invent missing information.
- Be precise and calibrated: reserve DANGER for real, concrete threats.
- If you are uncertain between SAFE and WARNING, prefer SAFE for transfers and WARNING for approvals.`;
      const memory: AgentMemory = {
        agentName: dto.agentName ?? `Sentinel #${nextTokenId}`,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        owner: recipient,
        systemPrompt: defaultSystemPrompt,
        knowledgeBase: {
          knownSafeContracts: [],
          knownScams: [],
          patternsLearned: [],
        },
        history: [],
        stats: {
          totalAnalyses: 0,
          scamsBlocked: 0,
          experienceLevel: 'novice',
        },
      };

      // 4. Upload memory to 0G Storage
      this.logger.log(`Uploading memory to 0G Storage...`);
      const uploadResult = await this.ogStorageService.uploadJson(memory);
      this.logger.log(`Memory uploaded — rootHash: ${uploadResult.rootHash}`);

      // 5. Compute the metadata hash for on-chain integrity proof
      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(memory)),
      );

      // 6. Sealed key placeholder (real encryption will come in next iteration)
      const sealedKey = ethers.toUtf8Bytes(
        `placeholder-sealed-key-${nextTokenId}`,
      );

      // 7. Mint the iNFT on-chain
      this.logger.log(`Minting iNFT for ${recipient}...`);
      const mintTx = (await this.contract.mint(
        recipient,
        uploadResult.rootHash, // ← VRAI rootHash, plus de placeholder !
        metadataHash,
        sealedKey,
      )) as ethers.TransactionResponse;

      this.logger.log(`Mint tx submitted: ${mintTx.hash}`);
      const receipt = await mintTx.wait();
      if (!receipt) {
        throw new Error('Mint transaction receipt is null');
      }
      this.logger.log(`Mint confirmed in block ${receipt.blockNumber}`);

      // 8. Verify mint by reading on-chain
      const owner = (await this.contract.ownerOf(nextTokenId)) as string;

      return {
        tokenId: nextTokenId,
        owner,
        rootHash: uploadResult.rootHash,
        storageTxHash: uploadResult.txHash,
        mintTxHash: mintTx.hash,
        explorerUrl: `https://chainscan-galileo.0g.ai/tx/${mintTx.hash}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`createGuardian failed: ${message}`);
      throw new InternalServerErrorException(
        `Failed to create Guardian: ${message}`,
      );
    }
  }

  /**
   * Read on-chain info for a given tokenId.
   */
  async getInftInfo(tokenId: number): Promise<InftInfoDto> {
    try {
      const owner = (await this.contract.ownerOf(tokenId)) as string;
      const encryptedURI = (await this.contract.getEncryptedURI(
        tokenId,
      )) as string;
      const metadataHash = (await this.contract.getMetadataHash(
        tokenId,
      )) as string;

      return { tokenId, owner, encryptedURI, metadataHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getInftInfo failed for token ${tokenId}: ${message}`);
      throw new NotFoundException(
        `Token ${tokenId} not found or contract error: ${message}`,
      );
    }
  }

  /**
   * Read on-chain encryptedURI then download memory from 0G Storage.
   */
  async getInftMemory(tokenId: number): Promise<Record<string, any>> {
    const info = await this.getInftInfo(tokenId);
    if (
      !info.encryptedURI ||
      info.encryptedURI.startsWith('0g://storage/placeholder')
    ) {
      throw new NotFoundException(
        `Token ${tokenId} has a placeholder URI — no real memory on 0G Storage`,
      );
    }
    return this.ogStorageService.downloadJson(info.encryptedURI);
  }

  /**
   * Analyzes a transaction using the iNFT's memory + LLM.
   * The agent reads its memory from 0G Storage, then asks the LLM for a verdict.
   */
  async analyzeTransaction(
    tokenId: number,
    txData: AnalyzeTransactionDto,
  ): Promise<AnalysisResultDto> {
    this.logger.log(
      `Analyzing transaction (type: ${txData.type}) for Guardian #${tokenId}`,
    );

    // 1. Récupère la mémoire de l'agent depuis 0G Storage
    let memory: AgentMemory;
    try {
      const rawMemory = await this.getInftMemory(tokenId);
      memory = rawMemory as AgentMemory;
      this.logger.log(
        `Memory loaded for Guardian #${tokenId} — analyses: ${memory.stats.totalAnalyses}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NotFoundException(
        `Cannot load memory for Guardian #${tokenId}: ${message}`,
      );
    }

    // 2. Build context based on transaction type
    let context: string;
    switch (txData.type) {
      case 'native_transfer':
        context = this.buildNativeTransferContext(txData);
        break;
      case 'token_transfer':
        context = await this.buildTokenTransferContext(txData);
        break;
      case 'token_approve':
        context = await this.buildApproveContext(txData);
        break;
      case 'contract_interaction':
        context = await this.buildContractContext(txData);
        break;
      default:
        throw new InternalServerErrorException(
          `Unknown transaction type: ${String(txData.type)}`,
        );
    }

    // 3. Construit le prompt avec mémoire + contexte
    const prompt = this.buildAnalysisPrompt(memory, context);
    this.logger.log(`Built prompt (${prompt.length} chars), calling LLM...`);

    // 4. Appelle le LLM via le router
    const result = await this.llmRouter.analyze(prompt);

    this.logger.log(
      `LLM verdict: ${result.verdict} (provider: ${result.providerUsed}, ${result.responseTimeMs}ms)`,
    );

    await this.updateMemoryAfterAnalysis(tokenId, memory, txData, result);

    return result;
  }

  /**
   * Builds context for a native ETH/0G transfer.
   * No contract enrichment needed (no contract involved).
   */
  private buildNativeTransferContext(txData: AnalyzeTransactionDto): string {
    if (!txData.recipient || !txData.amount) {
      throw new InternalServerErrorException(
        'native_transfer requires "recipient" and "amount"',
      );
    }

    const amountInEth = (Number(txData.amount) / 1e18).toFixed(6);

    return `# TRANSACTION TYPE: Native ETH Transfer
- Recipient address: ${txData.recipient}
- Amount: ${amountInEth} ETH (${txData.amount} wei)
- No smart contract involved (direct value transfer at protocol level)

Note: Native transfers cannot be analyzed via Etherscan contract data 
(there is no contract). Risk assessment focuses on:
- Is the recipient a known address (from your memory)?
- Is the amount unusually large?
- Are there patterns matching known scams?`;
  }

  /**
   * Builds context for an ERC-20 token transfer.
   * Enriches the token contract with Etherscan.
   */
  private async buildTokenTransferContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.tokenAddress || !txData.recipient || !txData.amount) {
      throw new InternalServerErrorException(
        'token_transfer requires "tokenAddress", "recipient" and "amount"',
      );
    }

    const enriched = await this.transactionEnricher.enrich(
      txData.tokenAddress,
      'transfer(address,uint256)',
      { to: txData.recipient, amount: txData.amount },
    );

    return `# TRANSACTION TYPE: ERC-20 Token Transfer

${enriched.summary}

Note: This is a simple ERC-20 token transfer.
The user is sending tokens to a recipient. No spending permission is granted.

Important rules:
- Do NOT classify as DANGER only because the recipient is unknown.
- If the token is legitimate and the amount is normal, classify as SAFE or WARNING.
- Use WARNING only if the recipient is unknown, the amount is unusually high, or the token looks suspicious.
- DANGER is reserved for known scam addresses, malicious contracts, phishing patterns, or abnormal high-risk signals.`;
  }

  /**
   * Builds context for an ERC-20 approve.
   * Enriches both the token and the spender.
   */
  private async buildApproveContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.tokenAddress || !txData.spender || !txData.amount) {
      throw new InternalServerErrorException(
        'token_approve requires "tokenAddress", "spender" and "amount"',
      );
    }

    // 🔹 enrich token (déjà existant)
    const enriched = await this.transactionEnricher.enrich(
      txData.tokenAddress,
      'approve(address,uint256)',
      { spender: txData.spender, amount: txData.amount },
    );

    // 🔹 NOUVEAU : enrich spender (safe avec try/catch)
    let spenderSummary = 'No additional data about spender.';
    try {
      const spenderInfo = await this.transactionEnricher.enrich(
        txData.spender,
        'contract_info',
        {},
      );
      spenderSummary = spenderInfo.summary;
      console.log('====== SPENDER SUMMARY ======');
      console.log(spenderSummary);
      console.log('=============================');
    } catch (e) {
      // fallback silencieux → ne casse rien
      this.logger.warn(`Failed to enrich spender: ${txData.spender}`);
    }

    return `# TRANSACTION TYPE: ERC-20 Approve

# TOKEN INFO
${enriched.summary}

# SPENDER INFO
${spenderSummary}

- Spender address: ${txData.spender}

Note: This is an ERC-20 approval.
The user gives permission to a spender to use tokens later.

Important rules:
- Unlimited approval to an unknown or unverified spender => DANGER.
- Unlimited approval to a well-known trusted protocol => WARNING, not DANGER.
- Limited approval to a known protocol => SAFE or WARNING.
- DANGER must be used only when the spender is unknown, suspicious, unverified, or matches scam patterns.

Important:
- The spender is the most critical part of an approval.
- If the spender is a known DeFi protocol (Uniswap, etc.), do NOT classify as DANGER by default.
- If the spender is unknown AND approval is unlimited → DANGER.
`;
  }

  /**
   * Builds context for a generic contract interaction.
   */
  private async buildContractContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.contractAddress || !txData.functionCall) {
      throw new InternalServerErrorException(
        'contract_interaction requires "contractAddress" and "functionCall"',
      );
    }

    const enriched = await this.transactionEnricher.enrich(
      txData.contractAddress,
      txData.functionCall,
      txData.params ?? {},
    );

    return `# TRANSACTION TYPE: Generic Contract Interaction

${enriched.summary}

Note: This is an arbitrary contract call. Without specific patterns to match,
risk assessment focuses on contract verification, age, and reputation.`;
  }

  /**
   * Builds the final LLM prompt combining agent memory + transaction context.
   */
  private buildAnalysisPrompt(memory: AgentMemory, context: string): string {
    const knownSafe = memory.knowledgeBase.knownSafeContracts;
    const knownScams = memory.knowledgeBase.knownScams;
    const patterns = memory.knowledgeBase.patternsLearned;
    const recentHistory = memory.history.slice(-5);
    const stats = memory.stats;

    return `${memory.systemPrompt}

# AGENT MEMORY
- Total transactions analyzed: ${stats.totalAnalyses}
- Scams blocked: ${stats.scamsBlocked}
- Experience level: ${stats.experienceLevel}

# KNOWN SAFE CONTRACTS
${knownSafe.length > 0 ? knownSafe.join('\n') : '(none yet)'}

# KNOWN SCAM ADDRESSES
${knownScams.length > 0 ? knownScams.join('\n') : '(none yet)'}

# PATTERNS LEARNED
${patterns.length > 0 ? patterns.join('\n') : '(none yet)'}

# RECENT ANALYSIS HISTORY
${recentHistory.length > 0 ? JSON.stringify(recentHistory, null, 2) : '(none yet)'}

# CURRENT TRANSACTION CONTEXT
${context}

# DECISION FRAMEWORK
Classify the transaction as SAFE, WARNING, or DANGER.

Use SAFE when:
- native transfer to any wallet not in the known scam list;
- token transfer of a verified token to any recipient;
- approval to a known, verified protocol with a limited amount;
- no dangerous permissions are granted and no malicious signal is present.

Use WARNING when:
- approval to a known protocol with an unlimited amount;
- approval to an unknown/unverified spender with a limited amount;
- token transfer involving an unverified token;
- contract interaction with uncertain risk.

Use DANGER when:
- approval to an unknown/unverified spender with an unlimited amount;
- spender or recipient is in the known scam list;
- spender contract is less than 7 days old;
- the transaction matches a wallet-drain or phishing pattern;
- there is strong, concrete evidence of malicious behavior.

Important:
- Do not invent facts.
- Unknown recipient or contract alone is NOT sufficient for WARNING on transfers.
- Unknown spender on an approval IS sufficient for at least WARNING.
- Explain your reasoning using the provided facts and memory.
- If uncertain between SAFE and WARNING: prefer SAFE for transfers, WARNING for approvals.

Respond only with a JSON object:
{"verdict": "SAFE"|"WARNING"|"DANGER", "reason": "1-2 sentences", "confidence": 0.0-1.0}`;
  }

  private async updateMemoryAfterAnalysis(
    tokenId: number,
    memory: AgentMemory,
    txData: AnalyzeTransactionDto,
    result: AnalysisResultDto,
  ): Promise<void> {
    const analyzedAt = new Date().toISOString();

    const historyEntry: AgentHistoryEntry = {
      timestamp: analyzedAt,
      contractAddress:
        txData.contractAddress ??
        txData.tokenAddress ??
        txData.recipient ??
        'N/A',
      functionCall: txData.functionCall ?? txData.type,
      verdict: result.verdict,
      reason: result.reason,
    };

    memory.history.push(historyEntry);

    memory.stats.totalAnalyses += 1;

    if (result.verdict === 'DANGER') {
      memory.stats.scamsBlocked += 1;
    }

    if (memory.stats.totalAnalyses >= 20) {
      memory.stats.experienceLevel = 'expert';
    } else if (memory.stats.totalAnalyses >= 5) {
      memory.stats.experienceLevel = 'intermediate';
    }
    if (
      result.verdict === 'DANGER' &&
      txData.type === 'token_approve' &&
      txData.spender &&
      result.confidence >= 0.9 &&
      result.reason.toLowerCase().includes('scam')
    ) {
      if (!memory.knowledgeBase.knownScams.includes(txData.spender)) {
        memory.knowledgeBase.knownScams.push(txData.spender);
      }
    }
    if (
      result.verdict === 'WARNING' &&
      txData.type === 'token_approve' &&
      txData.spender &&
      result.reason.toLowerCase().includes('known protocol')
    ) {
      memory.knowledgeBase.knownScams = memory.knowledgeBase.knownScams.filter(
        (addr) => addr.toLowerCase() !== txData.spender!.toLowerCase(),
      );
    }

    if (result.verdict === 'SAFE' && txData.tokenAddress) {
      if (
        !memory.knowledgeBase.knownSafeContracts.includes(txData.tokenAddress)
      ) {
        memory.knowledgeBase.knownSafeContracts.push(txData.tokenAddress);
      }
    }

    if (result.verdict === 'DANGER') {
      const pattern = `Dangerous ${txData.type}: ${result.reason}`;
      if (!memory.knowledgeBase.patternsLearned.includes(pattern)) {
        memory.knowledgeBase.patternsLearned.push(pattern);
      }
    }

    const uploadResult = await this.ogStorageService.uploadJson(memory);
    const metadataHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(memory)),
    );

    const updateTx = (await this.contract.updateMemory(
      tokenId,
      uploadResult.rootHash,
      metadataHash,
    )) as ethers.TransactionResponse;

    await updateTx.wait();

    this.logger.log(
      `On-chain memory pointer updated for Guardian #${tokenId}: ${uploadResult.rootHash}`,
    );

    this.logger.log(
      `Updated memory for Guardian #${tokenId} uploaded to 0G Storage: ${uploadResult.rootHash}`,
    );
  }
}
