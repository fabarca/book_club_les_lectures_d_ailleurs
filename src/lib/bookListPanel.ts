import type { Book } from "./types.js";
import { escapeHtml } from "./html.js";

export interface CountryFilterOption {
  geoName: string;
  label: string;
}

const ALL_COUNTRIES_LABEL = "Tous les pays";

export function renderBookListPanel(
  books: Book[],
  filterOptions: CountryFilterOption[],
  selectedGeoName: string | null,
  onFilterChange: (geoName: string | null) => void,
  onSelectBook: (book: Book) => void,
): void {
  const panel = document.getElementById("book-panel");
  if (!panel) return;

  const selectedLabel =
    (selectedGeoName && filterOptions.find((option) => option.geoName === selectedGeoName)?.label) ||
    ALL_COUNTRIES_LABEL;

  const optionsHtml = [`<li data-geo="">${ALL_COUNTRIES_LABEL}</li>`]
    .concat(
      filterOptions.map(
        (option) => `<li data-geo="${escapeHtml(option.geoName)}">${escapeHtml(option.label)}</li>`,
      ),
    )
    .join("");

  const itemsHtml = books
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
    <div class="country-filter">
      <button id="country-filter-toggle">${escapeHtml(selectedLabel)} &#9662;</button>
      <ul id="country-filter-options" hidden>${optionsHtml}</ul>
    </div>
    <ul id="book-list">${itemsHtml}</ul>
  `;

  const filterToggle = document.getElementById("country-filter-toggle");
  const filterOptionsList = document.getElementById("country-filter-options");
  filterToggle?.addEventListener("click", () => {
    if (filterOptionsList) filterOptionsList.hidden = !filterOptionsList.hidden;
  });
  filterOptionsList?.querySelectorAll<HTMLLIElement>("li").forEach((item) => {
    item.addEventListener("click", () => {
      onFilterChange(item.dataset.geo || null);
    });
  });

  panel.querySelectorAll<HTMLLIElement>("#book-list li").forEach((item) => {
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index);
      onSelectBook(books[index]);
    });
  });
}
