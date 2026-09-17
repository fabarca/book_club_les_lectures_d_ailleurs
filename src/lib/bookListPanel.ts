import type { Book } from "./types.js";
import { escapeHtml } from "./html.js";
import { lookupCountryGeoName } from "./countryLookup.js";

export interface CountryFilterOption {
  geoName: string;
  label: string;
  bookCount: number;
}

export interface ContinentFilterGroup {
  continent: string;
  countries: CountryFilterOption[];
  bookCount: number;
}

export type FilterTree = ContinentFilterGroup[];

export type FilterSelection =
  | { kind: "all" }
  | { kind: "continent"; continent: string }
  | { kind: "country"; geoName: string };

const ALL_COUNTRIES_LABEL = "Tous les pays";
const EXPANDED_CARET = "▼";
const COLLAPSED_CARET = "►";

function formatBookCount(count: number): string {
  const formatted = count === 1 ? "1 livre" : `${count} livres`;
  return formatted;
}

function findFilterOption(filterTree: FilterTree, geoName: string): CountryFilterOption | undefined {
  for (const group of filterTree) {
    for (const option of group.countries) {
      if (option.geoName === geoName) return option;
    }
  }
  return undefined;
}

function findContinentGroup(filterTree: FilterTree, continent: string): ContinentFilterGroup | undefined {
  return filterTree.find((group) => group.continent === continent);
}

function getSelectedFilterDisplay(
  filterTree: FilterTree,
  selectedFilter: FilterSelection,
  totalBookCount: number,
): { label: string; count: number } {
  if (selectedFilter.kind === "all") return { label: ALL_COUNTRIES_LABEL, count: totalBookCount };
  if (selectedFilter.kind === "continent") {
    const group = findContinentGroup(filterTree, selectedFilter.continent);
    return { label: selectedFilter.continent, count: group?.bookCount ?? 0 };
  }
  const option = findFilterOption(filterTree, selectedFilter.geoName);
  return { label: option?.label ?? ALL_COUNTRIES_LABEL, count: option?.bookCount ?? totalBookCount };
}

function buildCountryOptionHtml(option: CountryFilterOption): string {
  const html = `<li class="filter-option" data-kind="country" data-geo="${escapeHtml(option.geoName)}">${escapeHtml(option.label)} <span class="country-count">(${formatBookCount(option.bookCount)})</span></li>`;
  return html;
}

function isGroupExpanded(group: ContinentFilterGroup, selectedFilter: FilterSelection): boolean {
  if (selectedFilter.kind === "continent") return group.continent === selectedFilter.continent;
  if (selectedFilter.kind === "country") {
    return group.countries.some((option) => option.geoName === selectedFilter.geoName);
  }
  return false;
}

function buildContinentGroupHtml(group: ContinentFilterGroup, selectedFilter: FilterSelection): string {
  const countryItems: string[] = [];
  for (const option of group.countries) countryItems.push(buildCountryOptionHtml(option));
  const expanded = isGroupExpanded(group, selectedFilter);
  const hiddenAttr = expanded ? "" : "hidden";
  const caretGlyph = expanded ? EXPANDED_CARET : COLLAPSED_CARET;
  const html = `
    <li class="continent-group">
      <div class="continent-row">
        <button class="continent-expand" data-continent="${escapeHtml(group.continent)}" aria-expanded="${expanded}">${caretGlyph}</button>
        <button class="filter-option continent-select" data-kind="continent" data-continent="${escapeHtml(group.continent)}">
          ${escapeHtml(group.continent)} <span class="continent-count">(${formatBookCount(group.bookCount)})</span>
        </button>
      </div>
      <ul class="continent-countries" ${hiddenAttr}>${countryItems.join("")}</ul>
    </li>`;
  return html;
}

function buildFilterTreeHtml(filterTree: FilterTree, selectedFilter: FilterSelection, totalBookCount: number): string {
  const items: string[] = [
    `<li class="filter-option" data-kind="all">${ALL_COUNTRIES_LABEL} <span class="country-count">(${formatBookCount(totalBookCount)})</span></li>`,
  ];
  for (const group of filterTree) items.push(buildContinentGroupHtml(group, selectedFilter));
  const html = items.join("");
  return html;
}

function buildBookListItemHtml(book: Book, index: number): string {
  const geoName = lookupCountryGeoName(book.country) ?? "";
  const html = `
        <li data-index="${index}" data-geo="${escapeHtml(geoName)}">
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

function handleFilterOptionClick(item: HTMLElement, onFilterChange: (selection: FilterSelection) => void): void {
  const kind = item.dataset.kind;
  if (kind === "continent") {
    onFilterChange({ kind: "continent", continent: item.dataset.continent ?? "" });
  } else if (kind === "country") {
    onFilterChange({ kind: "country", geoName: item.dataset.geo ?? "" });
  } else {
    onFilterChange({ kind: "all" });
  }
}

function collapseOtherContinents(filterOptionsList: HTMLElement, exceptList: HTMLElement): void {
  const countriesLists = filterOptionsList.querySelectorAll<HTMLElement>(".continent-countries");
  for (const countriesList of countriesLists) {
    if (countriesList === exceptList) continue;
    countriesList.hidden = true;
    const expandButton = countriesList.closest(".continent-group")?.querySelector<HTMLButtonElement>(".continent-expand");
    if (!expandButton) continue;
    expandButton.setAttribute("aria-expanded", "false");
    expandButton.textContent = COLLAPSED_CARET;
  }
}

function handleContinentExpandClick(
  filterOptionsList: HTMLElement,
  expandButton: HTMLButtonElement,
  countriesList: HTMLElement,
): void {
  const willExpand = countriesList.hidden;
  if (willExpand) collapseOtherContinents(filterOptionsList, countriesList);
  countriesList.hidden = !countriesList.hidden;
  const expanded = !countriesList.hidden;
  expandButton.setAttribute("aria-expanded", String(expanded));
  expandButton.textContent = expanded ? EXPANDED_CARET : COLLAPSED_CARET;
}

function handleBookItemClick(item: HTMLLIElement, books: Book[], onSelectBook: (book: Book) => void): void {
  const index = Number(item.dataset.index);
  onSelectBook(books[index]);
}

function handleBookItemPointerEnter(item: HTMLLIElement, onHoverBookChange: (geoName: string | null) => void): void {
  onHoverBookChange(item.dataset.geo || null);
}

function handleBookItemPointerLeave(onHoverBookChange: (geoName: string | null) => void): void {
  onHoverBookChange(null);
}

function attachFilterToggleListener(filterToggle: HTMLElement | null, filterOptionsList: HTMLElement | null): void {
  if (!filterToggle || !filterOptionsList) return;
  filterToggle.addEventListener("click", handleFilterToggleClick.bind(null, filterOptionsList));
}

function attachFilterOptionListeners(
  filterOptionsList: HTMLElement | null,
  onFilterChange: (selection: FilterSelection) => void,
): void {
  if (!filterOptionsList) return;
  const items = filterOptionsList.querySelectorAll<HTMLElement>(".filter-option");
  for (const item of items) {
    item.addEventListener("click", handleFilterOptionClick.bind(null, item, onFilterChange));
  }
}

function attachContinentExpandListeners(filterOptionsList: HTMLElement | null): void {
  if (!filterOptionsList) return;
  const expandButtons = filterOptionsList.querySelectorAll<HTMLButtonElement>(".continent-expand");
  for (const expandButton of expandButtons) {
    const countriesList = expandButton.closest(".continent-group")?.querySelector<HTMLElement>(".continent-countries");
    if (!countriesList) continue;
    expandButton.addEventListener(
      "click",
      handleContinentExpandClick.bind(null, filterOptionsList, expandButton, countriesList),
    );
  }
}

function attachBookItemListeners(
  panel: HTMLElement,
  books: Book[],
  onSelectBook: (book: Book) => void,
  onHoverBookChange: (geoName: string | null) => void,
): void {
  const items = panel.querySelectorAll<HTMLLIElement>("#book-list li");
  for (const item of items) {
    item.addEventListener("click", handleBookItemClick.bind(null, item, books, onSelectBook));
    item.addEventListener("pointerenter", handleBookItemPointerEnter.bind(null, item, onHoverBookChange));
    item.addEventListener("pointerleave", handleBookItemPointerLeave.bind(null, onHoverBookChange));
  }
}

export function renderBookListPanel(
  books: Book[],
  filterTree: FilterTree,
  selectedFilter: FilterSelection,
  onFilterChange: (selection: FilterSelection) => void,
  onSelectBook: (book: Book) => void,
  onHoverBookChange: (geoName: string | null) => void,
): void {
  const panel = document.getElementById("book-panel");
  if (!panel) return;

  const { label, count } = getSelectedFilterDisplay(filterTree, selectedFilter, books.length);
  const optionsHtml = buildFilterTreeHtml(filterTree, selectedFilter, books.length);
  const itemsHtml = buildBookListItemsHtml(books);

  panel.innerHTML = `
    <div class="country-filter">
      <button id="country-filter-toggle">${escapeHtml(label)} <span class="country-count">(${formatBookCount(count)})</span> <span class="filter-arrow">▼</span></button>
      <ul id="country-filter-options" hidden>${optionsHtml}</ul>
    </div>
    <ul id="book-list">${itemsHtml}</ul>
  `;
  panel.scrollTop = 0;

  const filterToggle = document.getElementById("country-filter-toggle");
  const filterOptionsList = document.getElementById("country-filter-options");
  attachFilterToggleListener(filterToggle, filterOptionsList);
  attachFilterOptionListeners(filterOptionsList, onFilterChange);
  attachContinentExpandListeners(filterOptionsList);
  attachBookItemListeners(panel, books, onSelectBook, onHoverBookChange);
}
