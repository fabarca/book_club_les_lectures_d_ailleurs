import { escapeHtml } from "./html.js";
import { lookupCountryGeoName } from "./countryLookup.js";
const ALL_COUNTRIES_LABEL = "Tous les pays";
function findFilterOptionByGeoName(filterOptions, geoName) {
    for (const option of filterOptions) {
        if (option.geoName === geoName)
            return option;
    }
    return undefined;
}
function getSelectedFilterLabel(filterOptions, selectedGeoName) {
    const selectedOption = selectedGeoName ? findFilterOptionByGeoName(filterOptions, selectedGeoName) : undefined;
    const label = selectedOption?.label ?? ALL_COUNTRIES_LABEL;
    return label;
}
function buildFilterOptionsHtml(filterOptions) {
    const items = [`<li data-geo="">${ALL_COUNTRIES_LABEL}</li>`];
    for (const option of filterOptions) {
        items.push(`<li data-geo="${escapeHtml(option.geoName)}">${escapeHtml(option.label)}</li>`);
    }
    const html = items.join("");
    return html;
}
function buildBookListItemHtml(book, index) {
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
function buildBookListItemsHtml(books) {
    const items = [];
    for (let index = 0; index < books.length; index++) {
        items.push(buildBookListItemHtml(books[index], index));
    }
    const html = items.join("");
    return html;
}
function handleFilterToggleClick(filterOptionsList) {
    filterOptionsList.hidden = !filterOptionsList.hidden;
}
function handleFilterOptionClick(item, onFilterChange) {
    onFilterChange(item.dataset.geo || null);
}
function handleBookItemClick(item, books, onSelectBook) {
    const index = Number(item.dataset.index);
    onSelectBook(books[index]);
}
function handleBookItemPointerEnter(item, onHoverBookChange) {
    onHoverBookChange(item.dataset.geo || null);
}
function handleBookItemPointerLeave(onHoverBookChange) {
    onHoverBookChange(null);
}
function attachFilterToggleListener(filterToggle, filterOptionsList) {
    if (!filterToggle || !filterOptionsList)
        return;
    filterToggle.addEventListener("click", handleFilterToggleClick.bind(null, filterOptionsList));
}
function attachFilterOptionListeners(filterOptionsList, onFilterChange) {
    if (!filterOptionsList)
        return;
    const items = filterOptionsList.querySelectorAll("li");
    for (const item of items) {
        item.addEventListener("click", handleFilterOptionClick.bind(null, item, onFilterChange));
    }
}
function attachBookItemListeners(panel, books, onSelectBook, onHoverBookChange) {
    const items = panel.querySelectorAll("#book-list li");
    for (const item of items) {
        item.addEventListener("click", handleBookItemClick.bind(null, item, books, onSelectBook));
        item.addEventListener("pointerenter", handleBookItemPointerEnter.bind(null, item, onHoverBookChange));
        item.addEventListener("pointerleave", handleBookItemPointerLeave.bind(null, onHoverBookChange));
    }
}
export function renderBookListPanel(books, filterOptions, selectedGeoName, onFilterChange, onSelectBook, onHoverBookChange) {
    const panel = document.getElementById("book-panel");
    if (!panel)
        return;
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
    panel.scrollTop = 0;
    const filterToggle = document.getElementById("country-filter-toggle");
    const filterOptionsList = document.getElementById("country-filter-options");
    attachFilterToggleListener(filterToggle, filterOptionsList);
    attachFilterOptionListeners(filterOptionsList, onFilterChange);
    attachBookItemListeners(panel, books, onSelectBook, onHoverBookChange);
}
