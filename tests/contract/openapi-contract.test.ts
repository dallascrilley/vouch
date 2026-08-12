import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, unknown>;
  };
  openapi: string;
  paths: Record<string, unknown>;
};

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }
    return refs;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === "$ref" && typeof nestedValue === "string") {
        refs.push(nestedValue);
      } else {
        collectRefs(nestedValue, refs);
      }
    }
  }

  return refs;
}

describe("OpenAPI contract", () => {
  it("uses OpenAPI 3.1 and resolves all local schema refs", () => {
    const contractPath = resolve(
      process.cwd(),
      "contracts/verification-control-plane/openapi.yaml"
    );
    const document = YAML.parse(
      readFileSync(contractPath, "utf8")
    ) as OpenApiDocument;

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).not.toHaveLength(0);

    const schemas = document.components?.schemas ?? {};
    const refs = collectRefs(document);
    const missingSchemaRefs = refs.filter((ref) => {
      if (!ref.startsWith("#/components/schemas/")) {
        return false;
      }

      const schemaName = ref.split("/").at(-1);
      return !schemaName || !(schemaName in schemas);
    });

    expect(missingSchemaRefs).toEqual([]);
  });
});
