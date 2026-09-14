import type { Book } from "./types.js";

export function renderDetailPanel(book: Book, onBack?: () => void): void {
  const panel = document.getElementById("book-detail");
  if (!panel) return;

  panel.innerHTML = `
    <button id="book-detail-close" aria-label="Fermer">&times;</button>
    ${onBack ? `<button id="book-detail-back">&larr; Retour à la liste</button>` : ""}
    <img src="books/${book.imagePath}" alt="Couverture de ${escapeHtml(book.title)}" />
    <h2>${escapeHtml(book.title)}</h2>
    <p class="book-meta">${escapeHtml(book.author)} — ${escapeHtml(book.year)} — ${escapeHtml(book.country)}</p>
    <p class="book-edition">Édition ${escapeHtml(book.edition)} (${escapeHtml(book.eventDate)})</p>
    ${book.sourceUrl ? `<p class="book-source"><a href="${escapeHtml(book.sourceUrl)}" target="_blank" rel="noopener noreferrer">Voir l'événement sur Meetup</a></p>` : ""}
    <div class="book-description">${escapeHtml(book.description).replace(/\n/g, "<br>")}</div>
  `;
  panel.hidden = false;
  document.getElementById("book-detail-close")?.addEventListener("click", () => {
    panel.hidden = true;
  });
  if (onBack) {
    document.getElementById("book-detail-back")?.addEventListener("click", onBack);
  }
}

/** Lists the books of a single country so the reader can pick one; used
 * when a map marker groups more than one book. */
export function renderBookList(books: Book[], countryLabel: string, onSelect: (book: Book) => void): void {
  const panel = document.getElementById("book-detail");
  if (!panel) return;

  const items = books
    .map(
      (book, index) => `
        <li data-index="${index}">
          <img src="books/${book.imagePath}" alt="Couverture de ${escapeHtml(book.title)}" />
          <div>
            <strong>${escapeHtml(book.title)}</strong>
            <span>${escapeHtml(book.author)} — ${escapeHtml(book.year)}</span>
          </div>
        </li>`,
    )
    .join("");

  panel.innerHTML = `
    <button id="book-detail-close" aria-label="Fermer">&times;</button>
    <h2>${escapeHtml(countryLabel)}</h2>
    <ul id="book-list">${items}</ul>
  `;
  panel.hidden = false;
  document.getElementById("book-detail-close")?.addEventListener("click", () => {
    panel.hidden = true;
  });
  panel.querySelectorAll<HTMLLIElement>("#book-list li").forEach((item) => {
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index);
      onSelect(books[index]);
    });
  });
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
