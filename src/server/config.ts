import dotenv from "dotenv";
dotenv.config();

export const config = {
  foldspace: {
    url: process.env.FOLDSPACE_URL || "https://app.foldspace.ai/",
    apiBaseUrl:
      process.env.FOLDSPACE_API_URL || "https://app-be.foldspace.ai",
    username: process.env.FOLDSPACE_USERNAME || "",
    password: process.env.FOLDSPACE_PASSWORD || "",
  },
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/ground-truth",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    judgeModel: process.env.JUDGE_MODEL || "claude-sonnet-4-20250514",
  },
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
  },
} as const;
