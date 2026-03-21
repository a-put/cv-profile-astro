// Tab switching + scroll-spy (desktop & mobile)

const mobileQuery = window.matchMedia('(max-width: 768px)');
let scrollObserver: IntersectionObserver | null = null;

function setHeaderHeight() {
  const h = (document.querySelector('header') as HTMLElement).offsetHeight;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}

function setupDesktopTabs() {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('hidden'));

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.getElementById(`tab-${btn.dataset.tab}`)
        ?.scrollIntoView({ behavior: 'smooth' });
    };
  });

  if (scrollObserver) scrollObserver.disconnect();
  const headerH = (document.querySelector('header') as HTMLElement).offsetHeight;
  scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('tab-', '');
        document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === id);
        });
      }
    });
  }, { rootMargin: `-${headerH}px 0px -50% 0px` });

  document.querySelectorAll('.tab-section').forEach(s => scrollObserver!.observe(s));
}

function setupMobileTabs() {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('hidden'));

  const nav = document.querySelector('.sidebar') as HTMLElement;
  document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');

  const headerH = (document.querySelector('header') as HTMLElement).offsetHeight;
  const navH = nav.offsetHeight;
  const topOffset = headerH + navH;

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.getElementById(`tab-${btn.dataset.tab}`)
        ?.scrollIntoView({ behavior: 'smooth' });
    };
  });

  if (scrollObserver) scrollObserver.disconnect();
  scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('tab-', '');
        document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === id);
        });
        const activeBtn = nav.querySelector(`.tab-btn[data-tab="${id}"]`);
        if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
  }, { rootMargin: `-${topOffset}px 0px -50% 0px` });

  document.querySelectorAll('.tab-section').forEach(s => scrollObserver!.observe(s));
}

function initTabs() {
  setHeaderHeight();
  if (mobileQuery.matches) setupMobileTabs();
  else setupDesktopTabs();
}

let initTabsTimer: ReturnType<typeof setTimeout>;
function initTabsDebounced() { clearTimeout(initTabsTimer); initTabsTimer = setTimeout(initTabs, 120); }

mobileQuery.addEventListener('change', initTabs);
window.addEventListener('resize', initTabsDebounced);
initTabs();
