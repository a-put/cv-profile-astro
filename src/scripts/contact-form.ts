// Contact form submission handler

const form = document.getElementById('contact-form') as HTMLFormElement;
const status = document.getElementById('form-status')!;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const endpoint = form.dataset.endpoint;

function showStatus(msg: string, type: 'ok' | 'warn' | 'err') {
  status.textContent = msg;
  status.style.color = type === 'ok' ? '#188038' : type === 'warn' ? '#92400e' : '#c0392b';
  status.classList.remove('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!endpoint || endpoint.includes('YOUR_ID_HERE')) {
    showStatus('Form not configured.', 'warn');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending\u2026';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form),
    });

    const json = await res.json();

    if (res.ok) {
      form.style.display = 'none';
      const success = document.getElementById('form-success')!;
      success.style.display = 'flex';
      success.classList.remove('hidden');
    } else {
      throw new Error(json.error || 'Unknown error');
    }
  } catch (err) {
    showStatus('Something went wrong. Please try again or email directly.', 'err');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
  }
});
