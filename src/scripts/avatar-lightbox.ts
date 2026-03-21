// Avatar lightbox with FLIP animation

const lb = document.getElementById('avatar-lightbox')!;
const lbImg = lb.querySelector('.lb-img') as HTMLImageElement;
const avatar = document.getElementById('avatar') as HTMLImageElement;
const frame = document.getElementById('avatar-frame')!;
let isOpen = false;
let isAnimating = false;

function openLightbox() {
  if (isOpen || isAnimating) return;
  isAnimating = true;

  // First: measure avatar's current position
  const rect = avatar.getBoundingClientRect();
  const style = getComputedStyle(avatar);
  const br = parseFloat(style.borderRadius) || 14;

  // Position the lightbox image exactly over the avatar
  lbImg.style.top = rect.top + 'px';
  lbImg.style.left = rect.left + 'px';
  lbImg.style.width = rect.width + 'px';
  lbImg.style.height = rect.height + 'px';
  lbImg.style.borderRadius = br + 'px';

  // Hide original avatar, show lightbox (no transition yet)
  frame.classList.add('lb-active');
  lb.classList.add('open');

  // Last: compute target position (centered, enlarged)
  const targetSize = Math.min(window.innerWidth * 0.7, window.innerHeight * 0.7, 420);
  const targetTop = (window.innerHeight - targetSize) / 2;
  const targetLeft = (window.innerWidth - targetSize) / 2;

  // Invert + Play: enable transitions then move to target
  requestAnimationFrame(() => {
    lb.classList.add('animating');
    requestAnimationFrame(() => {
      lbImg.style.top = targetTop + 'px';
      lbImg.style.left = targetLeft + 'px';
      lbImg.style.width = targetSize + 'px';
      lbImg.style.height = targetSize + 'px';
      lbImg.style.borderRadius = '22px';
      isOpen = true;
      isAnimating = false;
    });
  });
}

function closeLightbox() {
  if (!isOpen || isAnimating) return;
  isAnimating = true;

  // Animate back to avatar's current position
  const rect = avatar.getBoundingClientRect();
  const style = getComputedStyle(avatar);
  const br = parseFloat(style.borderRadius) || 14;

  lbImg.style.top = rect.top + 'px';
  lbImg.style.left = rect.left + 'px';
  lbImg.style.width = rect.width + 'px';
  lbImg.style.height = rect.height + 'px';
  lbImg.style.borderRadius = br + 'px';

  lb.classList.remove('open');

  const cleanup = () => {
    lb.classList.remove('animating');
    frame.classList.remove('lb-active');
    isOpen = false;
    isAnimating = false;
  };
  lbImg.addEventListener('transitionend', function done(e: TransitionEvent) {
    if (e.propertyName !== 'width') return;
    lbImg.removeEventListener('transitionend', done);
    clearTimeout(fallback);
    cleanup();
  });
  const fallback = setTimeout(cleanup, 500);
}

frame.addEventListener('click', openLightbox);
lb.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
