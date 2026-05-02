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
  contractName?: string;
  deployedAt?: string;
}

const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

@Injectable()
export class TransactionEnricherService implements OnModuleInit {
  private readonly logger = new Logger(TransactionEnricherService.name);
  private http!: AxiosInstance;
  private apiKey!: string;
  private contractCache = new Map<string, ContractInfoCache>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('ETHERSCAN_API_KEY') ?? '';
    const baseURL =
      this.configService.get<string>('ETHERSCAN_BASE_URL') ??
      'https://api.etherscan.io/api';

    if (!this.apiKey) {
      this.logger.warn(
        'ETHERSCAN_API_KEY not set — enrichment will be limited',
      );
    }

    this.http = axios.create({
      baseURL,
      timeout: 8000,
    });

    this.logger.log('TransactionEnricher initialized');
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

    try {
      const sourceResponse = await this.http.get<
        EtherscanResponse<EtherscanContractSourceResult[]>
      >('', {
        params: {
          module: 'contract',
          action: 'getsourcecode',
          address,
          apikey: this.apiKey,
        },
      });

      const sourceData = sourceResponse.data?.result?.[0];
      const isVerified =
        !!sourceData?.SourceCode && sourceData.SourceCode.length > 0;
      const contractName = sourceData?.ContractName || undefined;

      const txResponse = await this.http.get<
        EtherscanResponse<EtherscanTxListItem[]>
      >('', {
        params: {
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

      const firstTx = txResponse.data?.result?.[0];
      const deployedAt = firstTx?.timeStamp
        ? new Date(parseInt(firstTx.timeStamp, 10) * 1000).toISOString()
        : undefined;

      const result: ContractInfoCache = {
        isVerified,
        contractName,
        deployedAt,
      };
      this.contractCache.set(normalized, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Etherscan call failed for ${address}: ${message}`);
      return { isVerified: false };
    }
  }

  private extractSpenderAddress(
    functionCall: string,
    params: Record<string, string>,
  ): string | null {
    const lowerCall = functionCall.toLowerCase();
    if (lowerCall.includes('approve')) {
      return params.spender ?? null;
    }
    if (lowerCall.includes('transferfrom')) {
      return params.to ?? null;
    }
    return null;
  }

  private computeAgeInDays(deployedAt?: string): number | undefined {
    if (!deployedAt) return undefined;
    const deployTime = new Date(deployedAt).getTime();
    const now = Date.now();
    return Math.floor((now - deployTime) / (1000 * 60 * 60 * 24));
  }

  private detectRiskFlags(
    functionCall: string,
    params: Record<string, string>,
    contractInfo: ContractInfoCache,
    spenderInfo?: EnrichedTransaction['spenderInfo'],
  ): EnrichedTransaction['riskFlags'] {
    const isUnlimitedApproval =
      functionCall.toLowerCase().includes('approve') &&
      (params.amount === MAX_UINT256 ||
        params.amount?.toLowerCase() === 'unlimited');

    const contractAge = this.computeAgeInDays(contractInfo.deployedAt);
    const spenderAge = spenderInfo?.ageInDays;

    return {
      isUnlimitedApproval,
      isFreshContract: contractAge !== undefined && contractAge < 7,
      isUnverifiedContract: !contractInfo.isVerified,
      isUnverifiedSpender: spenderInfo ? !spenderInfo.isVerified : false,
      isFreshSpender: spenderAge !== undefined && spenderAge < 7,
    };
  }

  private buildSummary(
    contractAddress: string,
    contractInfo: ContractInfoCache,
    functionCall: string,
    params: Record<string, string>,
    spenderInfo: EnrichedTransaction['spenderInfo'] | undefined,
    riskFlags: EnrichedTransaction['riskFlags'],
  ): string {
    const lines: string[] = [];

    const contractLabel = contractInfo.contractName
      ? `${contractInfo.contractName} (${contractAddress})`
      : contractAddress;
    const verifiedLabel = contractInfo.isVerified
      ? '✓ verified'
      : '⚠ unverified';
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
      const spenderVerified = spenderInfo.isVerified
        ? '✓ verified'
        : '⚠ unverified';
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
}
