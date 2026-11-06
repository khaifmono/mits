// Self-installing copy-to-clipboard handler for any [data-copy="<element-id>"] button.
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const src = document.getElementById(btn.dataset.copy ?? '');
    const text = src?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // clipboard unavailable (non-secure context) — do nothing
    }
    const original = btn.innerHTML;
    btn.innerHTML = 'Copied ✓';
    btn.disabled = true;
    setTimeout(() => {
      btn.innerHTML = original;
      btn.disabled = false;
    }, 1500);
  });
});
