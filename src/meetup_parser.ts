import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ManifestEntry } from "./lib/types.js";

const GROUP_URLNAME = "club-de-lecture-les-lectures-d-ailleurs";
const GRAPHQL_ENDPOINT = "https://www.meetup.com/gql2";
const BOOKS_DIR = path.join(process.cwd(), "books");
const MANIFEST_PATH = path.join(BOOKS_DIR, "manifest.json");
const PLACEHOLDER = "À COMPLÉTER";

interface MeetupEventNode {
  id: string;
  title: string;
  dateTime: string;
  description: string | null;
  featuredEventPhoto: { highResUrl: string | null } | null;
}

const QUERY = `query getGroupPastEvents($urlname:String!,$first:Int,$after:String){
  groupByUrlname(urlname:$urlname){
    id
    events(filter:{status:[PAST]},first:$first,after:$after){
      pageInfo{hasNextPage endCursor}
      edges{node{id title dateTime description featuredEventPhoto{highResUrl}}}
    }
  }
}`;

async function fetchAllPastEvents(): Promise<MeetupEventNode[]> {
  const events: MeetupEventNode[] = [];
  let after: string | null = null;

  for (;;) {
    const response: Response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        operationName: "getGroupPastEvents",
        variables: { urlname: GROUP_URLNAME, first: 100, after },
        query: QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meetup GraphQL request failed: HTTP ${response.status}`);
    }
    const json: any = await response.json();
    if (json.errors) {
      throw new Error(`Meetup GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const eventsConnection: any = json.data?.groupByUrlname?.events;
    if (!eventsConnection) {
      throw new Error("Unexpected Meetup GraphQL response shape (no events connection)");
    }

    for (const edge of eventsConnection.edges) {
      events.push(edge.node);
    }

    if (!eventsConnection.pageInfo.hasNextPage) break;
    after = eventsConnection.pageInfo.endCursor;
  }

  // Oldest first, so array position gives a stable edition number.
  events.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  return events;
}

/**
 * Splits a Meetup event title into book title + author.
 *
 * Titles are inconsistently formatted by the organizer:
 *   "Édition 8: Les oiseaux de Tarjei Vesaas"
 *   "Édition 1 : Alexis Zorba de Nikos Kazantzaki"
 *   "Miss Islande de Auður Ava Ólafsdóttir"          (no "Édition N:" prefix)
 *   "Le pingouin d'Andreï Kourkov"                    (elided "de" -> "d'")
 *   "Tango de Satan de László Krasznahorkai"          ("de" inside the book title too)
 *
 * The edition number is NOT parsed from here — it's derived from chronological
 * position by the caller, since 2/49 real events omit the "Édition N:" label
 * entirely while their neighbors' numbering still lines up with their position.
 *
 * The greedy regex below finds the LAST " de "/" d'" separator by backtracking,
 * which correctly handles a "de"/"d'" appearing earlier inside the book title.
 */
function splitTitleIntoBookAndAuthor(rawTitle: string): { book: string; author: string } | null {
  const withoutEditionPrefix = rawTitle.replace(/^Édition\s+\d+\s*:\s*/, "").trim();
  const match = /^(.*)\s+d(?:e\s+|')(.*)$/.exec(withoutEditionPrefix);
  if (!match) return null;
  return { book: match[1].trim(), author: match[2].trim() };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadManifest(): Promise<ManifestEntry[]> {
  if (!existsSync(MANIFEST_PATH)) return [];
  const raw = await readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as ManifestEntry[];
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`⚠ Could not download image ${url} (HTTP ${response.status})`);
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}

function buildMarkdown(params: {
  book: string;
  author: string;
  imageFileName: string;
  edition: number;
  eventDate: string;
  description: string;
}): string {
  const { book, author, imageFileName, edition, eventDate, description } = params;
  return `# Livre: ${book}
![Couverture](${imageFileName})
Édition: ${edition}
Date l'événement: ${eventDate}
Auteur: ${author}
Année: ${PLACEHOLDER}
Pays: ${PLACEHOLDER}

## Description
${description}
`;
}

async function main(): Promise<void> {
  await mkdir(BOOKS_DIR, { recursive: true });

  console.log("Fetching past events from Meetup (public, unauthenticated GraphQL)...");
  const events = await fetchAllPastEvents();
  console.log(`Found ${events.length} past events.`);

  const manifest = await loadManifest();
  const knownEventIds = new Set(manifest.map((entry) => entry.meetupEventId));

  let created = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const editionNumber = index + 1;

    if (knownEventIds.has(event.id)) continue;

    const split = splitTitleIntoBookAndAuthor(event.title);
    if (!split) {
      console.warn(`⚠ Skipping event ${event.id} ("${event.title}"): could not split book/author from title`);
      continue;
    }
    const { book, author } = split;

    const baseSlug = `${slugify(author)}__${slugify(book)}`;
    const mdFileName = `${baseSlug}.md`;
    const imageFileName = `${baseSlug}.jpg`;
    const mdPath = path.join(BOOKS_DIR, mdFileName);
    const imagePath = path.join(BOOKS_DIR, imageFileName);

    if (existsSync(mdPath)) {
      console.warn(`⚠ ${mdFileName} already exists on disk but wasn't in manifest.json — skipping to avoid overwriting it`);
      continue;
    }

    const photoUrl = event.featuredEventPhoto?.highResUrl;
    if (photoUrl) {
      await downloadImage(photoUrl, imagePath);
    } else {
      console.warn(`⚠ Édition ${editionNumber} (${mdFileName}): no event photo found, no cover image downloaded`);
    }

    const markdown = buildMarkdown({
      book,
      author,
      imageFileName,
      edition: editionNumber,
      eventDate: event.dateTime,
      description: (event.description ?? "").trim(),
    });
    await writeFile(mdPath, markdown, "utf8");

    manifest.push({ file: mdFileName, meetupEventId: event.id, editionNumber });
    knownEventIds.add(event.id);
    created++;

    console.log(`✓ Édition ${editionNumber}: ${book} — ${author}`);
    console.warn(`  ⚠ Pays/Année need manual completion in books/${mdFileName}`);
  }

  manifest.sort((a, b) => b.editionNumber - a.editionNumber);
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Done. ${created} new book(s) added, ${manifest.length} total in manifest.json.`);
}

main().catch((error) => {
  console.error("meetup_parser failed:", error);
  process.exitCode = 1;
});
