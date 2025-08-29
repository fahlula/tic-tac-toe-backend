import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  // Ignora build e dependências
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  // Opcional: deixa os logs mais limpos
  verbose: true,
  // Se quiser forçar tsconfig próprio para testes, descomente:
  // globals: { "ts-jest": { tsconfig: "tsconfig.json" } },
};

export default config;
