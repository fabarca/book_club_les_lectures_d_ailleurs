import type { Book } from "./types.js";
import { escapeHtml } from "./html.js";

export interface CountryFilterOption {
  geoName: string;
  label: string;
}

const ALL_COUNTRIES_LABEL = "Tous les pays";

function findFilterOptionByGeoName(
  filterOptions: CountryFilterOption[],
  geoName: string,
): CountryFilterOption | undefined {
  for (const option of filterOptions) {
    if (option.geoName === geoName) return option;
  }
  return undefined;
}

function getSelectedFilterLabel(filterOptions: CountryFilterOption[], selectedGeoName: string | null): string {
  const selectedOption = selectedGeoName ? findFilterOptionByGeoName(filterOptions, selectedGeoName) : undefined;
  const label = selectedOption?.label ?? ALL_COUNTRIES_LABEL;
  return label;
}

function buildFilterOptionsHtml(filterOptions: CountryFilterOption[]): string {
  const items: string[] = [`<li data-geo="">${ALL_COUNTRIES_LABEL}</li>`];
  for (const option of filterOptions) {
    items.push(`<li data-geo="${escapeHtml(option.geoName)}">${escapeHtml(option.label)}</li>`);
  }
  const html = items.join("");
  return html;
}

function buildBookListItemHtml(book: Book, index: number): string {
  const html = `
        <li data-index="${index}">
          <img src="books/${book.imagePath}" alt="Couverture de ${escapeHtml(book.title)}" />
          <div>
            <strong>${escapeHtml(book.title)}</strong>
            <span>${escapeHtml(book.author)} — ${escapeHtml(book.year)}</span>
          </div>
        </li>`;
  return html;
}

function buildBookListItemsHtml(books: Book[]): string {
  const items: string[] = [];
  for (let index = 0; index < books.length; index++) {
    items.push(buildBookListItemHtml(books[index], index));
  }
  const html = items.join("");
  return html;
}

function handleFilterToggleClick(filterOptionsList: HTMLElement): void {
  filterOptionsList.hidden = !filterOptionsList.hidden;
}

function handleFilterOptionClick(item: HTMLLIElement, onFilterChange: (geoName: string | null) => void): void {
  onFilterChange(item.dataset.geo || null);
}

function handleBookItemClick(item: HTMLLIElement, books: Book[], onSelectBook: (book: Book) => void): void {
  const index = Number(item.dataset.index);
  onSelectBook(books[index]);
}

function attachFilterToggleListener(filterToggle: HTMLElement | null, filterOptionsList: HTMLElement | null): void {
  if (!filterToggle || !filterOptionsList) return;
  filterToggle.addEventListener("click", handleFilterToggleClick.bind(null, filterOptionsList));
}

function attachFilterOptionListeners(
  filterOptionsList: HTMLElement | null,
  onFilterChange: (geoName: string | null) => void,
): void {
  if (!filterOptionsList) return;
  const items = filterOptionsList.querySelectorAll<HTMLLIElement>("li");
  for (const item of items) {
    item.addEventListener("click", handleFilterOptionClick.bind(null, item, onFilterChange));
  }
}

function attachBookItemListeners(panel: HTMLElement, books: Book[], onSelectBook: (book: Book) => void): void {
  const items = panel.querySelectorAll<HTMLLIElement>("#book-list li");
  for (const item of items) {
    item.addEventListener("click", handleBookItemClick.bind(null, item, books, onSelectBook));
  }
}

export function renderBookListPanel(
  books: Book[],
  filterOptions: CountryFilterOption[],
  selectedGeoName: string | null,
  onFilterChange: (geoName: string | null) => void,
  onSelectBook: (book: Book) => void,
): void {
  const panel = document.getElementById("book-panel");
  if (!panel) return;

  const selectedLabel = getSelectedFilterLabel(filterOptions, selectedGeoName);
  const optionsHtml = buildFilterOptionsHtml(filterOptions);
  const itemsHtml = buildBookListItemsHtml(books);

  panel.innerHTML = `
    <div class="country-filter">
      <button id="country-filter-toggle">${escapeHtml(selectedLabel)} &#9662;</button>
      <ul id="country-filter-options" hidden>${optionsHtml}</ul>
    </div>
    <ul id="book-list">${itemsHtml}</ul>
  `;

  const filterToggle = document.getElementById("country-filter-toggle");
  const filterOptionsList = document.getElementById("country-filter-options");
  attachFilterToggleListener(filterToggle, filterOptionsList);
  attachFilterOptionListeners(filterOptionsList, onFilterChange);
  attachBookItemListeners(panel, books, onSelectBook);
}
