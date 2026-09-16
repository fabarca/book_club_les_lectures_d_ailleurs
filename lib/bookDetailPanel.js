import { escapeHtml } from "./html.js";
export function renderBookDetailPanel(book, onBack) {
    const panel = document.getElementById("book-panel");
    if (!panel)
        return;
    panel.innerHTML = `
    <button id="book-detail-back">&larr; Retour à la liste</button>
    <img src="books/${book.imagePath}" alt="Couverture de ${escapeHtml(book.title)}" />
    <h2>${escapeHtml(book.title)}</h2>
    <p class="book-meta">${escapeHtml(book.author)} — ${escapeHtml(book.year)} — ${escapeHtml(book.country)}</p>
    <p class="book-edition">Édition ${escapeHtml(book.edition)} (${escapeHtml(book.eventDate)})</p>
    ${book.sourceUrl ? `<p class="book-source"><a href="${escapeHtml(book.sourceUrl)}" target="_blank" rel="noopener noreferrer">Voir l'événement sur Meetup</a></p>` : ""}
    <div class="book-description">${escapeHtml(book.description).replace(/\n/g, "<br>")}</div>
  `;
    panel.scrollTop = 0;
    document.getElementById("book-detail-back")?.addEventListener("click", onBack);
}
