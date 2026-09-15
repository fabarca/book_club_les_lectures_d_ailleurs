export function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  const escaped = div.innerHTML;
  return escaped;
}
