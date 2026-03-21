// Typing tagline animation

const titleEl = document.getElementById('header-title');
if (titleEl) {
  const raw = titleEl.dataset.taglines;
  if (raw) {
    const taglines: string[] = JSON.parse(raw);
    let tIdx = 0, cIdx = 0, deleting = false, pauseUntil = 0;
    const TYPE_SPEED = 55, DELETE_SPEED = 30, PAUSE_AFTER = 2200, PAUSE_BEFORE = 400;

    function tickTagline() {
      const now = Date.now();
      if (now < pauseUntil) { requestAnimationFrame(tickTagline); return; }
      const current = taglines[tIdx];
      if (!deleting) {
        cIdx++;
        titleEl!.textContent = current.slice(0, cIdx);
        if (cIdx === current.length) {
          deleting = true;
          pauseUntil = now + PAUSE_AFTER;
        }
      } else {
        cIdx--;
        titleEl!.textContent = current.slice(0, cIdx);
        if (cIdx === 0) {
          deleting = false;
          tIdx = (tIdx + 1) % taglines.length;
          pauseUntil = now + PAUSE_BEFORE;
        }
      }
      setTimeout(() => requestAnimationFrame(tickTagline), deleting ? DELETE_SPEED : TYPE_SPEED);
    }

    // Show first tagline immediately, start cycling after a pause
    titleEl.textContent = taglines[0];
    cIdx = taglines[0].length;
    deleting = true;
    pauseUntil = Date.now() + PAUSE_AFTER;
    requestAnimationFrame(tickTagline);
  }
}
