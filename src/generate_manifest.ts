import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBookMarkdown } from "./lib/bookParser.js";
import type { ManifestEntry } from "./lib/types.js";

const BOOKS_DIR = path.join(process.cwd(), "books");
const MANIFEST_PATH = path.join(process.cwd(), "manifest.json");

export function extractMeetupEventId(sourceUrl: string): string {
  const match = /\/events\/(\d+)\/?/.exec(sourceUrl);
  const eventId = match ? match[1] : "";
  return eventId;
}

export function isMarkdownFile(file: string): boolean {
  const isMarkdown = file.endsWith(".md");
  return isMarkdown;
}

function compareByEditionNumberDescending(a: ManifestEntry, b: ManifestEntry): number {
  const difference = b.editionNumber - a.editionNumber;
  return difference;
}

export async function generateManifest(): Promise<ManifestEntry[]> {
  const files = await readdir(BOOKS_DIR);
  const mdFiles: string[] = [];
  for (const file of files) {
    if (isMarkdownFile(file)) mdFiles.push(file);
  }
  mdFiles.sort();

  const entries: ManifestEntry[] = [];
  for (const file of mdFiles) {
    const text = await readFile(path.join(BOOKS_DIR, file), "utf8");
    const book = parseBookMarkdown(text, file);

    const editionNumber = Number(book.edition);
    if (!Number.isFinite(editionNumber)) {
      console.warn(`⚠ ${file}: invalid or missing "Édition:" field, skipping from manifest.json`);
      continue;
    }

    entries.push({
      file,
      meetupEventId: extractMeetupEventId(book.sourceUrl),
      editionNumber,
    });
  }

  entries.sort(compareByEditionNumberDescending);
  await writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
  return entries;
}

async function main(): Promise<void> {
  const entries = await generateManifest();
  console.log(`Wrote manifest.json with ${entries.length} entrie(s).`);
}

function handleGenerateManifestError(error: unknown): void {
  console.error("generate_manifest failed:", error);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(handleGenerateManifestError);
}
