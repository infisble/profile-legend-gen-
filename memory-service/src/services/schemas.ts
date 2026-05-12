export const photoAnalysisSchema = {
  additionalProperties: false,
  properties: {
    apparentAgeRange: { type: "string" },
    cautionNotes: {
      items: { type: "string" },
      type: "array"
    },
    confidenceNotes: {
      items: { type: "string" },
      type: "array"
    },
    conversationHooks: {
      items: { type: "string" },
      type: "array"
    },
    mood: { type: "string" },
    setting: { type: "string" },
    styleSignals: {
      items: { type: "string" },
      type: "array"
    },
    subjectSummary: { type: "string" },
    visibleDetails: {
      items: { type: "string" },
      type: "array"
    }
  },
  required: [
    "subjectSummary",
    "apparentAgeRange",
    "visibleDetails",
    "styleSignals",
    "mood",
    "setting",
    "conversationHooks",
    "cautionNotes",
    "confidenceNotes"
  ],
  type: "object"
};

export const contextAnalysisSchema = {
  additionalProperties: false,
  properties: {
    antiBotRiskDetected: { type: "boolean" },
    antiBotSignals: {
      items: { type: "string" },
      type: "array"
    },
    clientFacts: {
      items: { type: "string" },
      type: "array"
    },
    conversationMomentum: { type: "string" },
    emotionalAttachmentDetected: { type: "boolean" },
    emotionalAttachmentSignals: {
      items: { type: "string" },
      type: "array"
    },
    emotionalTone: {
      items: { type: "string" },
      type: "array"
    },
    factBasedQuestions: {
      items: { type: "string" },
      type: "array"
    },
    nextBestMove: { type: "string" },
    profileSummary: { type: "string" },
    redFlags: {
      items: { type: "string" },
      type: "array"
    },
    recommendedReplyMode: { type: "string" },
    relationshipStage: { type: "string" },
    responseStrategy: { type: "string" },
    themesToAvoid: {
      items: { type: "string" },
      type: "array"
    },
    themesToUse: {
      items: { type: "string" },
      type: "array"
    },
    threadRecap: { type: "string" }
  },
  required: [
    "antiBotRiskDetected",
    "antiBotSignals",
    "profileSummary",
    "clientFacts",
    "relationshipStage",
    "conversationMomentum",
    "emotionalAttachmentDetected",
    "emotionalAttachmentSignals",
    "emotionalTone",
    "threadRecap",
    "themesToUse",
    "themesToAvoid",
    "redFlags",
    "responseStrategy",
    "nextBestMove",
    "factBasedQuestions",
    "recommendedReplyMode"
  ],
  type: "object"
};

export const assistantOutputSchema = {
  additionalProperties: false,
  properties: {
    drafts: {
      items: {
        additionalProperties: false,
        properties: {
          followUpGoal: { type: "string" },
          label: { type: "string" },
          message: { type: "string" },
          riskLevel: { type: "string" },
          whyItWorks: { type: "string" }
        },
        required: [
          "label",
          "message",
          "whyItWorks",
          "riskLevel",
          "followUpGoal"
        ],
        type: "object"
      },
      type: "array"
    },
    factAnchorsUsed: {
      items: { type: "string" },
      type: "array"
    },
    operatorNote: { type: "string" },
    recommendedApproach: { type: "string" }
  },
  required: [
    "operatorNote",
    "recommendedApproach",
    "factAnchorsUsed",
    "drafts"
  ],
  type: "object"
};
