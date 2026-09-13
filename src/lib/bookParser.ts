import type { Book } from "./types.js";

const TITLE_LINE = /^#\s*Livre:\s*(.+)$/;
const IMAGE_LINE = /!\[[^\]]*\]\(([^)]+)\)/;
const FIELD_LINE = /^([A-Za-zÀ-ÿ' ]+):\s*(.+)$/;
const DESCRIPTION_HEADING = /^##\s*Description\s*$/;

/**
 * Parses the club's custom books/*.md format. Not standard frontmatter/CommonMark:
 * a title line, an image line, a few "Label: value" lines, then a description body.
 */
export function parseBookMarkdown(text: string, sourceFile: string): Book {
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;
  const titleMatch = TITLE_LINE.exec(lines[i] ?? "");
  if (!titleMatch) {
    throw new Error(`${sourceFile}: expected "# Livre: ..." on the first non-empty line`);
  }
  const title = titleMatch[1].trim();
  i++;

  while (i < lines.length && lines[i].trim() === "") i++;
  const imageMatch = IMAGE_LINE.exec(lines[i] ?? "");
  const imagePath = imageMatch ? imageMatch[1].trim() : "";
  if (imageMatch) i++;

  const fields: Record<string, string> = {};
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (DESCRIPTION_HEADING.test(line.trim())) break;
    const fieldMatch = FIELD_LINE.exec(line.trim());
    if (fieldMatch) {
      fields[fieldMatch[1].trim()] = fieldMatch[2].trim();
    }
    i++;
  }

  while (i < lines.length && !DESCRIPTION_HEADING.test(lines[i].trim())) i++;
  i++; // skip the "## Description" heading itself
  const description = lines.slice(i).join("\n").trim();

  const author = fields["Auteur"];
  if (!author) {
    throw new Error(`${sourceFile}: missing "Auteur:" field`);
  }

  return {
    title,
    author,
    edition: fields["Édition"] ?? "",
    eventDate: fields["Date l'événement"] ?? "",
    year: fields["Année"] ?? "",
    country: fields["Pays"] ?? "",
    description,
    imagePath,
    sourceFile,
  };
}
