export interface MessageRecord {
  attachments: string[];
  body: string;
  direction: "incoming" | "outgoing";
  format: number | null;
  id: string | null;
  isSystem: boolean;
  sentAt: string | null;
  type: number | null;
}

export interface NoteRecord {
  date: string | null;
  id: string | null;
  text: string;
}

export interface NormalizedProfile {
  age: number | null;
  bodyType: string | null;
  city: string | null;
  country: string | null;
  goal: string[];
  hobbies: string[];
  maritalStatus: string | null;
  name: string | null;
  occupation: string | null;
  personalityType: string | null;
  photoCount: number | null;
  photoUrl: string | null;
  traits: string[];
}

export interface PreparedConversation {
  conversationText: string;
  keptMessages: number;
  lastIncoming: MessageRecord | null;
  lastOutgoing: MessageRecord | null;
  messages: MessageRecord[];
  recentWindowText: string;
  recentWindowMessages: MessageRecord[];
  totalMessages: number;
}

export interface MemoryChunk {
  direction?: "incoming" | "outgoing" | null;
  id: string;
  noteDate?: string | null;
  score: number;
  sentAt?: string | null;
  source: "conversation" | "letter" | "note" | "profile" | "summary";
  sourceId?: string | null;
  text: string;
  vector: number[];
}

export interface PreparedMemoryContext {
  cacheKey: string;
  query: string;
  selectedChunks: MemoryChunk[];
  strategy: string;
  totalChunks: number;
  vectorDimensions: number;
}

export interface InputOverview {
  hasConversation: boolean;
  hasNotes: boolean;
  hasPhoto: boolean;
  hasProfile: boolean;
  keptMessages: number;
  notesCount: number;
  photoUrl: string | null;
  totalMessages: number;
  warnings: string[];
}

export interface PreparedInputs {
  conversation: PreparedConversation | null;
  inputOverview: InputOverview;
  memoryContext: PreparedMemoryContext;
  notes: NoteRecord[];
  photoUrl: string | null;
  profile: NormalizedProfile | null;
}

export interface WorkflowOptions {
  draftLanguage: string;
  instruction: string;
  messageType: string;
  messageTypeGuidance: string;
  operatorLanguage: string;
  photoUrl: string | null;
  tone: string;
}

export interface PhotoAnalysisResult {
  apparentAgeRange: string;
  cautionNotes: string[];
  confidenceNotes: string[];
  conversationHooks: string[];
  mood: string;
  setting: string;
  styleSignals: string[];
  subjectSummary: string;
  visibleDetails: string[];
}

export interface ContextAnalysisResult {
  antiBotRiskDetected: boolean;
  antiBotSignals: string[];
  clientFacts: string[];
  conversationMomentum: string;
  emotionalAttachmentDetected: boolean;
  emotionalAttachmentSignals: string[];
  emotionalTone: string[];
  factBasedQuestions: string[];
  nextBestMove: string;
  profileSummary: string;
  redFlags: string[];
  recommendedReplyMode: string;
  relationshipStage: string;
  responseStrategy: string;
  themesToAvoid: string[];
  themesToUse: string[];
  threadRecap: string;
}

export interface ReplyDraft {
  followUpGoal: string;
  label: string;
  message: string;
  riskLevel: string;
  whyItWorks: string;
}

export interface AssistantOutputResult {
  drafts: ReplyDraft[];
  factAnchorsUsed: string[];
  operatorNote: string;
  recommendedApproach: string;
}

export interface ModelRoutingResult {
  configuredProvider: string;
  routingReason: string;
  selectedModel: string;
  selectedProvider: "gemini" | "xai";
  sexualContextDetected: boolean;
  sexualContextSignals: string[];
}

export interface WorkflowResult {
  assistantOutput: AssistantOutputResult;
  contextAnalysis: ContextAnalysisResult;
  inputOverview: InputOverview;
  modelRouting: ModelRoutingResult;
  photoAnalysis: PhotoAnalysisResult | null;
}
