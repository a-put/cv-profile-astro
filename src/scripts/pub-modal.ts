// Publication modal — open/close + scroll lock

const modal = document.getElementById('pub-modal')!;
const card = document.getElementById('pub-modal-card')!;
const closeBtn = document.getElementById('pub-modal-close')!;

function openPubModal(pubCard: HTMLElement) {
  const journal = pubCard.dataset.journal || '';
  const year = pubCard.dataset.year || '';
  const title = pubCard.dataset.title || '';
  const layman = pubCard.dataset.layman || '';
  const image = pubCard.dataset.image || '';

  document.getElementById('pm-journal')!.textContent = `${journal} · ${year}`;
  document.getElementById('pm-title')!.textContent = title;
  document.getElementById('pm-layman')!.textContent = layman;

  const imgWrap = document.getElementById('pm-img-wrap')!;
  const img = document.getElementById('pm-img') as HTMLImageElement;

  // Center horizontally over the publications main column
  const mainEl = document.querySelector('.page-layout > main');
  if (mainEl) {
    const mainRect = mainEl.getBoundingClientRect();
    card.style.left = (mainRect.left + mainRect.width / 2) + 'px';
  }

  if (image) {
    const probe = new Image();
    probe.onload = () => {
      imgWrap.style.display = '';
      img.src = image;
      modal.classList.add('open');
    };
    probe.onerror = () => {
      imgWrap.style.display = 'none';
      modal.classList.add('open');
    };
    probe.src = image;
  } else {
    imgWrap.style.display = 'none';
    modal.classList.add('open');
  }
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// Lock body scroll when modal opens (mobile only)
new MutationObserver(() => {
  if (modal.classList.contains('open') && window.innerWidth <= 620)
    document.body.style.overflow = 'hidden';
}).observe(modal, { attributeFilter: ['class'] });

// Wire up pub cards to open modal
document.querySelectorAll<HTMLElement>('.pub-card').forEach(el => {
  el.addEventListener('click', () => openPubModal(el));
});

modal.addEventListener('click', closeModal);
card.addEventListener('click', e => e.stopPropagation());
closeBtn.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
