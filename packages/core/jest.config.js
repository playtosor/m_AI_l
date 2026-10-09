module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.ts"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts", "!src/**/__tests__/**"],
  moduleFileExtensions: ["ts", "js", "json", "node"],
  transform: {
    "^.+\\.ts$": "ts-jest"
  },
  moduleNameMapper: {
    "^@m_ai_l/core$": "<rootDir>/src/index.ts",
    "^@m_ai_l/mcp$": "<rootDir>/../../packages/mcp/src/server.ts"
  },
  testTimeout: 10000,
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },
};
