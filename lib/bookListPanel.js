import { escapeHtml } from "./html.js";
import { lookupCountryGeoName } from "./countryLookup.js";
const ALL_COUNTRIES_LABEL = "Tous les pays";
function formatBookCount(count) {
    const formatted = count === 1 ? "1 livre" : `${count} livres`;
    return formatted;
}
function findFilterOption(filterTree, geoName) {
    for (const group of filterTree) {
        for (const option of group.countries) {
            if (option.geoName === geoName)
                return option;
        }
    }
    return undefined;
}
function getSelectedFilterLabel(filterTree, selectedFilter) {
    if (selectedFilter.kind === "all")
        return ALL_COUNTRIES_LABEL;
    if (selectedFilter.kind === "continent")
        return selectedFilter.continent;
    const option = findFilterOption(filterTree, selectedFilter.geoName);
    const label = option?.label ?? ALL_COUNTRIES_LABEL;
    return label;
}
function buildCountryOptionHtml(option) {
    const html = `<li class="filter-option" data-kind="country" data-geo="${escapeHtml(option.geoName)}">${escapeHtml(option.label)} <span class="country-count">(${formatBookCount(option.bookCount)})</span></li>`;
    return html;
}
function isGroupExpanded(group, selectedFilter) {
    if (selectedFilter.kind === "continent")
        return group.continent === selectedFilter.continent;
    if (selectedFilter.kind === "country") {
        return group.countries.some((option) => option.geoName === selectedFilter.geoName);
    }
    return false;
}
function buildContinentGroupHtml(group, selectedFilter) {
    const countryItems = [];
    for (const option of group.countries)
        countryItems.push(buildCountryOptionHtml(option));
    const expanded = isGroupExpanded(group, selectedFilter);
    const hiddenAttr = expanded ? "" : "hidden";
    const caretGlyph = expanded ? "&#9662;" : "&#9656;";
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
function buildFilterTreeHtml(filterTree, selectedFilter) {
    const items = [`<li class="filter-option" data-kind="all">${ALL_COUNTRIES_LABEL}</li>`];
    for (const group of filterTree)
        items.push(buildContinentGroupHtml(group, selectedFilter));
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
    const kind = item.dataset.kind;
    if (kind === "continent") {
        onFilterChange({ kind: "continent", continent: item.dataset.continent ?? "" });
    }
    else if (kind === "country") {
        onFilterChange({ kind: "country", geoName: item.dataset.geo ?? "" });
    }
    else {
        onFilterChange({ kind: "all" });
    }
}
function collapseOtherContinents(filterOptionsList, exceptList) {
    const countriesLists = filterOptionsList.querySelectorAll(".continent-countries");
    for (const countriesList of countriesLists) {
        if (countriesList === exceptList)
            continue;
        countriesList.hidden = true;
        const expandButton = countriesList.closest(".continent-group")?.querySelector(".continent-expand");
        if (!expandButton)
            continue;
        expandButton.setAttribute("aria-expanded", "false");
        expandButton.textContent = "▸";
    }
}
function handleContinentExpandClick(filterOptionsList, expandButton, countriesList) {
    const willExpand = countriesList.hidden;
    if (willExpand)
        collapseOtherContinents(filterOptionsList, countriesList);
    countriesList.hidden = !countriesList.hidden;
    const expanded = !countriesList.hidden;
    expandButton.setAttribute("aria-expanded", String(expanded));
    expandButton.textContent = expanded ? "▾" : "▸";
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
    const items = filterOptionsList.querySelectorAll(".filter-option");
    for (const item of items) {
        item.addEventListener("click", handleFilterOptionClick.bind(null, item, onFilterChange));
    }
}
function attachContinentExpandListeners(filterOptionsList) {
    if (!filterOptionsList)
        return;
    const expandButtons = filterOptionsList.querySelectorAll(".continent-expand");
    for (const expandButton of expandButtons) {
        const countriesList = expandButton.closest(".continent-group")?.querySelector(".continent-countries");
        if (!countriesList)
            continue;
        expandButton.addEventListener("click", handleContinentExpandClick.bind(null, filterOptionsList, expandButton, countriesList));
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
export function renderBookListPanel(books, filterTree, selectedFilter, onFilterChange, onSelectBook, onHoverBookChange) {
    const panel = document.getElementById("book-panel");
    if (!panel)
        return;
    const selectedLabel = getSelectedFilterLabel(filterTree, selectedFilter);
    const optionsHtml = buildFilterTreeHtml(filterTree, selectedFilter);
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
    attachContinentExpandListeners(filterOptionsList);
    attachBookItemListeners(panel, books, onSelectBook, onHoverBookChange);
}
