import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { RuntimeConfig } from "./runtime.js";

export function validateRuntimeConfig(config: RuntimeConfig) {
  if (config.databasePath !== ":memory:") {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    const database = new DatabaseSync(config.databasePath);
    database.exec("PRAGMA busy_timeout = 5000;");
    database.exec("PRAGMA journal_mode = WAL;");
    database.close();
    accessSync(config.databasePath, constants.R_OK | constants.W_OK);
  }

  mkdirSync(config.artifactRoot, { recursive: true });
  accessSync(config.artifactRoot, constants.R_OK | constants.W_OK);
}
