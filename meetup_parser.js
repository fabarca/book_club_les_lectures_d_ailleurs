import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseBookMarkdown } from "./lib/bookParser.js";
import { extractMeetupEventId, generateManifest, isMarkdownFile } from "./generate_manifest.js";
const GROUP_URLNAME = "club-de-lecture-les-lectures-d-ailleurs";
const GRAPHQL_ENDPOINT = "https://www.meetup.com/gql2";
const BOOKS_DIR = path.join(process.cwd(), "books");
const PLACEHOLDER = "À COMPLÉTER";
function compareEventsByDateAscending(a, b) {
    const difference = new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
    return difference;
}
const QUERY = `query getGroupEvents($urlname:String!,$first:Int,$after:String){
  groupByUrlname(urlname:$urlname){
    id
    events(filter:{status:[PAST,ACTIVE]},first:$first,after:$after){
      pageInfo{hasNextPage endCursor}
      edges{node{id title dateTime description featuredEventPhoto{highResUrl}}}
    }
  }
}`;
async function fetchAllEvents() {
    const events = [];
    let after = null;
    for (;;) {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                operationName: "getGroupEvents",
                variables: { urlname: GROUP_URLNAME, first: 100, after },
                query: QUERY,
            }),
        });
        if (!response.ok) {
            throw new Error(`Meetup GraphQL request failed: HTTP ${response.status}`);
        }
        const json = await response.json();
        if (json.errors) {
            throw new Error(`Meetup GraphQL errors: ${JSON.stringify(json.errors)}`);
        }
        const eventsConnection = json.data?.groupByUrlname?.events;
        if (!eventsConnection) {
            throw new Error("Unexpected Meetup GraphQL response shape (no events connection)");
        }
        for (const edge of eventsConnection.edges) {
            events.push(edge.node);
        }
        if (!eventsConnection.pageInfo.hasNextPage)
            break;
        after = eventsConnection.pageInfo.endCursor;
    }
    // Oldest first, so array position gives a stable edition number.
    events.sort(compareEventsByDateAscending);
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
function splitTitleIntoBookAndAuthor(rawTitle) {
    const withoutEditionPrefix = rawTitle.replace(/^Édition\s+\d+\s*:\s*/, "").trim();
    const match = /^(.*)\s+d(?:e\s+|')(.*)$/.exec(withoutEditionPrefix);
    if (!match)
        return null;
    const split = { book: match[1].trim(), author: match[2].trim() };
    return split;
}
function slugify(value) {
    return value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
async function loadKnownEventIds() {
    const knownEventIds = new Set();
    if (!existsSync(BOOKS_DIR))
        return knownEventIds;
    const files = await readdir(BOOKS_DIR);
    for (const file of files) {
        if (!isMarkdownFile(file))
            continue;
        const text = await readFile(path.join(BOOKS_DIR, file), "utf8");
        const book = parseBookMarkdown(text, file);
        const eventId = extractMeetupEventId(book.sourceUrl);
        if (eventId)
            knownEventIds.add(eventId);
    }
    return knownEventIds;
}
async function downloadImage(url, destPath) {
    const response = await fetch(url);
    if (!response.ok) {
        console.warn(`⚠ Could not download image ${url} (HTTP ${response.status})`);
        return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
}
function eventUrl(eventId) {
    const url = `https://www.meetup.com/${GROUP_URLNAME}/events/${eventId}/`;
    return url;
}
function toDateOnly(isoDateTime) {
    const dateOnly = isoDateTime.slice(0, 10);
    return dateOnly;
}
function buildMarkdown(params) {
    const { book, author, imageFileName, edition, eventDate, sourceUrl, description } = params;
    const markdown = `# Livre: ${book}
![Couverture](${imageFileName})
Édition: ${edition}
Date l'événement: ${toDateOnly(eventDate)}
Lien: ${sourceUrl}
Auteur: ${author}
Année: ${PLACEHOLDER}
Pays: ${PLACEHOLDER}

## Description
${description}
`;
    return markdown;
}
async function main() {
    await mkdir(BOOKS_DIR, { recursive: true });
    console.log("Fetching events from Meetup (public, unauthenticated GraphQL)...");
    const events = await fetchAllEvents();
    console.log(`Found ${events.length} events.`);
    const knownEventIds = await loadKnownEventIds();
    let created = 0;
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        const editionNumber = index + 1;
        if (knownEventIds.has(event.id))
            continue;
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
            console.warn(`⚠ ${mdFileName} already exists on disk — skipping to avoid overwriting it`);
            continue;
        }
        const photoUrl = event.featuredEventPhoto?.highResUrl;
        if (photoUrl) {
            await downloadImage(photoUrl, imagePath);
        }
        else {
            console.warn(`⚠ Édition ${editionNumber} (${mdFileName}): no event photo found, no cover image downloaded`);
        }
        const markdown = buildMarkdown({
            book,
            author,
            imageFileName,
            edition: editionNumber,
            eventDate: event.dateTime,
            sourceUrl: eventUrl(event.id),
            description: (event.description ?? "").trim(),
        });
        await writeFile(mdPath, markdown, "utf8");
        knownEventIds.add(event.id);
        created++;
        console.log(`✓ Édition ${editionNumber}: ${book} — ${author}`);
        console.warn(`  ⚠ Pays/Année need manual completion in books/${mdFileName}`);
    }
    const manifest = await generateManifest();
    console.log(`Done. ${created} new book(s) added, ${manifest.length} total in manifest.json.`);
}
function handleMeetupParserError(error) {
    console.error("meetup_parser failed:", error);
    process.exitCode = 1;
}
main().catch(handleMeetupParserError);
