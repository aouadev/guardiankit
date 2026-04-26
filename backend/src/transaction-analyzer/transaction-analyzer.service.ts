import { Injectable } from '@nestjs/common';

@Injectable()
export class TransactionAnalyzerService {
  analyze(transactionData: string) {
    const input = transactionData.toLowerCase();

    const warnings: string[] = [];
    let riskScore = 10;

    if (input.includes('approve')) {
      riskScore += 35;
      warnings.push('This transaction appears to request token approval.');
    }

    if (
      input.includes('unlimited') ||
      input.includes('max') ||
      input.includes('ffffffff')
    ) {
      riskScore += 35;
      warnings.push('Possible unlimited approval detected.');
    }

    if (input.includes('transferfrom')) {
      riskScore += 25;
      warnings.push(
        'transferFrom detected. This may allow a contract to move tokens.',
      );
    }

    if (input.includes('0x')) {
      riskScore += 10;
      warnings.push(
        'Contract or wallet address detected. Verify the recipient carefully.',
      );
    }

    if (riskScore > 100) {
      riskScore = 100;
    }

    const status =
      riskScore >= 70
        ? 'High Risk'
        : riskScore >= 40
          ? 'Medium Risk'
          : 'Low Risk';

    const recommendation =
      riskScore >= 70
        ? 'Do not sign before verifying the contract, spender address, and approval amount.'
        : riskScore >= 40
          ? 'Review the transaction carefully before signing.'
          : 'No major risk detected, but always verify the transaction details.';

    return {
      network: '0G Galileo',
      riskScore,
      status,
      summary: this.buildSummary(status, warnings),
      warnings,
      recommendation,
      explanation: this.buildExplanation(status, warnings),
      transactionPreview: transactionData,
    };
  }

  private buildSummary(status: string, warnings: string[]) {
    if (warnings.length === 0) {
      return 'The transaction does not show obvious risky patterns.';
    }

    return `${status}: ${warnings.join(' ')}`;
  }

  private buildExplanation(status: string, warnings: string[]) {
    if (warnings.length === 0) {
      return 'This transaction appears safe. No suspicious patterns were detected, but always double-check the recipient and amount before signing.';
    }

    return `This transaction has been flagged as ${status}. ${warnings.join(
      ' ',
    )} This could expose your wallet to risk. Please verify the contract and permissions before proceeding.`;
  }
}
