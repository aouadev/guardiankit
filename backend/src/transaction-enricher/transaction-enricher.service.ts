import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EnrichedTransaction } from './interfaces/enriched-transaction.interface';

interface EtherscanContractSourceResult {
  ContractName: string;
  CompilerVersion: string;
  ABI: string;
  SourceCode: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

interface EtherscanTxListItem {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
}

interface ContractInfoCache {
  isVerified: boolean;
  verificationStatus: 'verified' | 'unverified' | 'unknown';
  contractName?: string;
  deployedAt?: string;
  source?: 'etherscan' | 'known-protocol' | 'unknown';
  error?: string;
}

const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const KNOWN_PROTOCOLS: Record<string, string> = {
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 SwapRouter',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 SwapRouter02',
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Uniswap Permit2',
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router02',
};

@Injectable()
export class TransactionEnricherService implements OnModuleInit {
  private readonly logger = new Logger(TransactionEnricherService.name);
  private http!: AxiosInstance;
  private apiKey!: string;
  private chainId!: string;
  private contractCache = new Map<string, ContractInfoCache>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('ETHERSCAN_API_KEY') ?? '';

    this.chainId = this.configService.get<string>('ETHERSCAN_CHAIN_ID') ?? '1';

    const baseURL =
      this.configService.get<string>('ETHERSCAN_BASE_URL') ??
      'https://api.etherscan.io/v2/api';

    if (!this.apiKey) {
      this.logger.warn(
        'ETHERSCAN_API_KEY not set — enrichment will be limited',
      );
    }

    this.http = axios.create({
      baseURL,
      timeout: 8000,
    });

    this.logger.log(
      `TransactionEnricher initialized with Etherscan URL: ${baseURL}, chainId: ${this.chainId}`,
    );
  }

  async enrich(
    contractAddress: string,
    functionCall: string,
    params: Record<string, string>,
  ): Promise<EnrichedTransaction> {
    this.logger.log(
      `Enriching transaction → contract: ${contractAddress}, function: ${functionCall}`,
    );

    const contractInfo = await this.fetchContractInfo(contractAddress);

    let spenderInfo: EnrichedTransaction['spenderInfo'];

    const spenderAddress = this.extractSpenderAddress(functionCall, params);

    if (spenderAddress) {
      const spenderData = await this.fetchContractInfo(spenderAddress);

      spenderInfo = {
        address: spenderAddress,
        ...spenderData,
        ageInDays: this.computeAgeInDays(spenderData.deployedAt),
      };
    }

    const riskFlags = this.detectRiskFlags(
      functionCall,
      params,
      contractInfo,
      spenderInfo,
    );

    const summary = this.buildSummary(
      contractAddress,
      contractInfo,
      functionCall,
      params,
      spenderInfo,
      riskFlags,
    );

    return {
      contractAddress,
      functionCall,
      params,
      contractInfo: {
        ...contractInfo,
        ageInDays: this.computeAgeInDays(contractInfo.deployedAt),
      },
      spenderInfo,
      riskFlags,
      summary,
    };
  }

  private async fetchContractInfo(address: string): Promise<ContractInfoCache> {
    const normalized = address.toLowerCase();

    const cached = this.contractCache.get(normalized);
    if (cached) {
      this.logger.log(`Cache hit for ${normalized}`);
      return cached;
    }

    const knownProtocolName = KNOWN_PROTOCOLS[normalized];

    if (knownProtocolName) {
      const result: ContractInfoCache = {
        isVerified: true,
        verificationStatus: 'verified',
        contractName: knownProtocolName,
        source: 'known-protocol',
      };

      this.contractCache.set(normalized, result);
      return result;
    }

    try {
      const sourceResponse = await this.http.get<
        EtherscanResponse<EtherscanContractSourceResult[] | string>
      >('', {
        params: {
          chainid: this.chainId,
          module: 'contract',
          action: 'getsourcecode',
          address,
          apikey: this.apiKey,
        },
      });

      this.logger.log(
        `Etherscan source response for ${address}: ${JSON.stringify(
          sourceResponse.data,
        ).slice(0, 500)}`,
      );

      const sourcePayload = sourceResponse.data;

      if (
        sourcePayload.status !== '1' ||
        !Array.isArray(sourcePayload.result)
      ) {
        const result: ContractInfoCache = {
          isVerified: false,
          verificationStatus: 'unknown',
          source: 'unknown',
          error:
            typeof sourcePayload.result === 'string'
              ? sourcePayload.result
              : sourcePayload.message,
        };

        this.contractCache.set(normalized, result);
        return result;
      }

      const sourceData = sourcePayload.result[0];

      const hasSourceCode =
        !!sourceData?.SourceCode && sourceData.SourceCode.trim().length > 0;

      const hasVerifiedAbi =
        !!sourceData?.ABI &&
        sourceData.ABI !== 'Contract source code not verified';

      const isVerified = hasSourceCode && hasVerifiedAbi;

      const txResponse = await this.http.get<
        EtherscanResponse<EtherscanTxListItem[] | string>
      >('', {
        params: {
          chainid: this.chainId,
          module: 'account',
          action: 'txlist',
          address,
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: 1,
          sort: 'asc',
          apikey: this.apiKey,
        },
      });

      let deployedAt: string | undefined;

      if (
        txResponse.data.status === '1' &&
        Array.isArray(txResponse.data.result)
      ) {
        const firstTx = txResponse.data.result[0];

        deployedAt = firstTx?.timeStamp
          ? new Date(parseInt(firstTx.timeStamp, 10) * 1000).toISOString()
          : undefined;
      }

      const result: ContractInfoCache = {
        isVerified,
        verificationStatus: isVerified ? 'verified' : 'unverified',
        contractName: sourceData?.ContractName || undefined,
        deployedAt,
        source: 'etherscan',
      };

      this.contractCache.set(normalized, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Etherscan call failed for ${address}: ${message}`);

      const result: ContractInfoCache = {
        isVerified: false,
        verificationStatus: 'unknown',
        source: 'unknown',
        error: message,
      };

      this.contractCache.set(normalized, result);
      return result;
    }
  }

  private extractSpenderAddress(
    functionCall: string,
    params: Record<string, string>,
  ): string | null {
    const lowerCall = functionCall.toLowerCase();

    if (lowerCall.includes('approve')) {
      return (
        params.spender ??
        params._spender ??
        params.guy ??
        params.operator ??
        params['0'] ??
        null
      );
    }

    if (lowerCall.includes('setapprovalforall')) {
      return params.operator ?? params._operator ?? params['0'] ?? null;
    }

    return null;
  }

  private extractAmount(params: Record<string, string>): string | undefined {
    return (
      params.amount ??
      params.value ??
      params._value ??
      params.tokens ??
      params['1']
    );
  }

  private computeAgeInDays(deployedAt?: string): number | undefined {
    if (!deployedAt) return undefined;

    const deployTime = new Date(deployedAt).getTime();

    if (Number.isNaN(deployTime)) return undefined;

    const now = Date.now();

    return Math.floor((now - deployTime) / (1000 * 60 * 60 * 24));
  }

  private detectRiskFlags(
    functionCall: string,
    params: Record<string, string>,
    contractInfo: ContractInfoCache,
    spenderInfo?: EnrichedTransaction['spenderInfo'] & {
      verificationStatus?: 'verified' | 'unverified' | 'unknown';
    },
  ): EnrichedTransaction['riskFlags'] {
    const lowerCall = functionCall.toLowerCase();
    const amount = this.extractAmount(params);

    const isUnlimitedApproval =
      lowerCall.includes('approve') &&
      (amount === MAX_UINT256 || amount?.toLowerCase() === 'unlimited');

    const contractAge = this.computeAgeInDays(contractInfo.deployedAt);
    const spenderAge = spenderInfo?.ageInDays;

    return {
      isUnlimitedApproval,
      isFreshContract: contractAge !== undefined && contractAge < 7,

      // Important:
      // unknown !== unverified
      isUnverifiedContract: contractInfo.verificationStatus === 'unverified',

      isUnverifiedSpender: spenderInfo
        ? spenderInfo.verificationStatus === 'unverified'
        : false,

      isFreshSpender: spenderAge !== undefined && spenderAge < 7,
    };
  }

  private buildSummary(
    contractAddress: string,
    contractInfo: ContractInfoCache,
    functionCall: string,
    params: Record<string, string>,
    spenderInfo:
      | (EnrichedTransaction['spenderInfo'] & {
          verificationStatus?: 'verified' | 'unverified' | 'unknown';
          source?: string;
        })
      | undefined,
    riskFlags: EnrichedTransaction['riskFlags'],
  ): string {
    const lines: string[] = [];

    const contractLabel = contractInfo.contractName
      ? `${contractInfo.contractName} (${contractAddress})`
      : contractAddress;

    const verifiedLabel = this.formatVerificationLabel(contractInfo);

    const ageInDays = this.computeAgeInDays(contractInfo.deployedAt);

    const ageLabel =
      ageInDays !== undefined ? `${ageInDays} days old` : 'unknown age';

    lines.push(`Contract: ${contractLabel} — ${verifiedLabel}, ${ageLabel}`);

    lines.push(`Function: ${functionCall}`);
    lines.push(`Params: ${JSON.stringify(params)}`);

    if (spenderInfo) {
      const spenderLabel = spenderInfo.contractName
        ? `${spenderInfo.contractName} (${spenderInfo.address})`
        : spenderInfo.address;

      const spenderVerified = this.formatVerificationLabel(spenderInfo);

      const spenderAge =
        spenderInfo.ageInDays !== undefined
          ? `${spenderInfo.ageInDays} days old`
          : 'unknown age';

      lines.push(
        `Spender: ${spenderLabel} — ${spenderVerified}, ${spenderAge}`,
      );
    }

    const activeFlags = Object.entries(riskFlags)
      .filter(([, value]) => value)
      .map(([key]) => key);

    if (activeFlags.length > 0) {
      lines.push(`Risk flags: ${activeFlags.join(', ')}`);
    } else {
      lines.push('Risk flags: none detected');
    }

    return lines.join('\n');
  }

  private formatVerificationLabel(info: {
    isVerified?: boolean;
    verificationStatus?: 'verified' | 'unverified' | 'unknown';
    source?: string;
  }): string {
    if (info.verificationStatus === 'verified') {
      return info.source === 'known-protocol'
        ? '✓ known protocol'
        : '✓ verified';
    }

    if (info.verificationStatus === 'unverified') {
      return '⚠ unverified';
    }

    return '? verification unknown';
  }
}
