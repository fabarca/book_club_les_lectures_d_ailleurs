export function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    const escaped = div.innerHTML;
    return escaped;
}
