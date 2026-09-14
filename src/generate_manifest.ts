import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBookMarkdown } from "./lib/bookParser.js";
import type { ManifestEntry } from "./lib/types.js";

const BOOKS_DIR = path.join(process.cwd(), "books");
const MANIFEST_PATH = path.join(process.cwd(), "manifest.json");

export function extractMeetupEventId(sourceUrl: string): string {
  const match = /\/events\/(\d+)\/?/.exec(sourceUrl);
  return match ? match[1] : "";
}

export async function generateManifest(): Promise<ManifestEntry[]> {
  const files = await readdir(BOOKS_DIR);
  const mdFiles = files.filter((file) => file.endsWith(".md")).sort();

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

  entries.sort((a, b) => b.editionNumber - a.editionNumber);
  await writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
  return entries;
}

async function main(): Promise<void> {
  const entries = await generateManifest();
  console.log(`Wrote manifest.json with ${entries.length} entrie(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("generate_manifest failed:", error);
    process.exitCode = 1;
  });
}
