import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium"
].filter(Boolean) as string[];

async function main() {
  const fixturePath = resolve(
    process.argv[2] ?? "fixtures/visual-qa/hero-cta-overlap.html"
  );
  const outDir = resolve(process.argv[3] ?? ".runtime/visual-qa");
  const screenshotPath = resolve(outDir, "hero-cta-overlap-1440x900.png");
  const embeddedImagePath = resolve(
    outDir,
    "hero-cta-overlap-1440x900-embed.jpg"
  );
  const manifestPath = resolve(outDir, "hero-cta-overlap-1440x900.json");

  mkdirSync(outDir, { recursive: true });
  await captureScreenshot({
    fixtureUrl: pathToFileURL(fixturePath).href,
    screenshotPath,
    viewport: "1440,900"
  });

  const bytes = readFileSync(screenshotPath);
  const contentHash = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
  const embedded = await createEmbeddedImage({
    inputPath: screenshotPath,
    outputPath: embeddedImagePath
  });
  const dataUrl = `data:${embedded.mimeType};base64,${embedded.bytes.toString("base64")}`;
  if (dataUrl.length > 100_000) {
    throw new Error(
      `Embedded visual evidence is ${dataUrl.length} characters, which is too large for MTurk HTMLQuestion. Use a smaller fixture or install sips-compatible JPEG conversion.`
    );
  }
  const manifest = {
    artifact_id: "artifact-hero-cta-overlap-1440",
    caption:
      "Desktop screenshot of the Northstar hero fixture at 1440x900. Verify whether the orange CTA overlaps the headline.",
    content_hash: contentHash,
    data_url: dataUrl,
    embedded_image_path: embeddedImagePath,
    fixture_path: fixturePath,
    screenshot_path: screenshotPath,
    viewport: "1440x900"
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        artifact_id: manifest.artifact_id,
        content_hash: manifest.content_hash,
        manifest_path: manifestPath,
        screenshot_path: screenshotPath,
        viewport: manifest.viewport
      },
      null,
      2
    )
  );
}

async function createEmbeddedImage(input: {
  inputPath: string;
  outputPath: string;
}) {
  try {
    await execFileAsync("/usr/bin/sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "55",
      "--resampleWidth",
      "900",
      input.inputPath,
      "--out",
      input.outputPath
    ]);
    return {
      bytes: readFileSync(input.outputPath),
      mimeType: "image/jpeg"
    };
  } catch {
    return {
      bytes: readFileSync(input.inputPath),
      mimeType: "image/png"
    };
  }
}

async function captureScreenshot(input: {
  fixtureUrl: string;
  screenshotPath: string;
  viewport: string;
}) {
  const errors: string[] = [];
  for (const chrome of chromeCandidates) {
    try {
      await execFileAsync(chrome, [
        "--headless=new",
        "--hide-scrollbars",
        "--disable-gpu",
        `--window-size=${input.viewport}`,
        `--screenshot=${input.screenshotPath}`,
        input.fixtureUrl
      ]);
      return;
    } catch (error) {
      errors.push(
        `${chrome}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    `Unable to capture screenshot with Chrome/Chromium. Tried: ${errors.join("; ")}`
  );
}

void main();
