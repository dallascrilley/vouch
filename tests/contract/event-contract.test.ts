import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function parseSections(markdown: string) {
  const sections = markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [headingLine, ...rest] = section.split("\n");
      const heading = headingLine.trim();
      const payloadLines = rest.filter((line) => line.startsWith("- `"));
      return { heading, payloadLines };
    });

  return sections;
}

describe("Event contract", () => {
  it("defines unique event names and payload bullets for every event", () => {
    const contractPath = resolve(
      process.cwd(),
      "contracts/verification-control-plane/events.md"
    );
    const markdown = readFileSync(contractPath, "utf8");
    const eventSections = parseSections(markdown).filter((section) =>
      section.heading.startsWith("`verification.")
    );

    const eventNames = eventSections.map((section) =>
      section.heading.replaceAll("`", "")
    );
    const duplicates = eventNames.filter(
      (name, index) => eventNames.indexOf(name) !== index
    );

    expect(duplicates).toEqual([]);
    expect(eventSections.length).toBeGreaterThan(0);

    for (const section of eventSections) {
      expect(section.payloadLines.length).toBeGreaterThan(0);
    }
  });
});
