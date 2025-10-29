export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}
