/**
 * Structure of an agent's memory stored on 0G Storage.
 * This is the canonical shape of the JSON we upload/download.
 */
export interface AgentMemory {
  agentName: string;
  version: string;
  createdAt: string;
  owner: string;
  systemPrompt: string;
  knowledgeBase: {
    knownSafeContracts: string[];
    knownScams: string[];
    patternsLearned: string[];
  };
  history: AgentHistoryEntry[];
  stats: {
    totalAnalyses: number;
    scamsBlocked: number;
    experienceLevel: 'novice' | 'intermediate' | 'expert';
  };
}

export interface AgentHistoryEntry {
  timestamp: string;
  contractAddress: string;
  functionCall: string;
  verdict: 'SAFE' | 'WARNING' | 'DANGER';
  reason: string;
}
