// ---------- Theme toggle ----------
const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const storedTheme = localStorage.getItem('theme');
if (storedTheme) root.setAttribute('data-theme', storedTheme);
else if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.setAttribute('data-theme', 'dark');

themeToggle.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ---------- Mobile nav ----------
const navToggle = document.getElementById('nav-toggle');
const nav = document.getElementById('nav');
navToggle.addEventListener('click', () => nav.classList.toggle('open'));
nav.querySelectorAll('a').forEach((link) =>
  link.addEventListener('click', () => nav.classList.remove('open'))
);

// ---------- Footer year ----------
document.getElementById('year').textContent = new Date().getFullYear();

// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealEls.forEach((el) => revealObserver.observe(el));

// ---------- Services: fetched dynamically from the backend ----------
const ICONS = {
  code: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  mobile: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
  layers: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  headset: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
};

async function loadServices() {
  const grid = document.getElementById('services-grid');
  try {
    const res = await fetch('/api/services');
    if (!res.ok) throw new Error('Request failed');
    const services = await res.json();

    grid.innerHTML = '';
    services.forEach((service, i) => {
      const card = document.createElement('div');
      card.className = 'service-card reveal';
      card.innerHTML = `
        <div class="service-icon">${ICONS[service.icon] || ICONS.code}</div>
        <h3>${service.title}</h3>
        <p>${service.description}</p>
      `;
      grid.appendChild(card);
      revealObserver.observe(card);
      setTimeout(() => card.classList.add('in-view'), i * 60);
    });
  } catch (err) {
    grid.innerHTML = '<div class="service-card error">Couldn\'t load services right now. Please refresh, or email manojsairm@gmail.com directly.</div>';
    console.error(err);
  }
}
loadServices();

// ---------- Contact form ----------
const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('contact-submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = '';
  statusEl.className = 'form-status';

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    message: form.message.value.trim(),
  };

  if (!payload.name || !payload.email || !payload.message) {
    statusEl.textContent = 'Please fill in your name, email and message.';
    statusEl.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      statusEl.textContent = data.message || 'Message sent successfully!';
      statusEl.classList.add('success');
      form.reset();
    } else {
      statusEl.textContent = data.error || 'Something went wrong. Please try again.';
      statusEl.classList.add('error');
    }
  } catch (err) {
    statusEl.textContent = 'Network error - please try again or email manojsairm@gmail.com directly.';
    statusEl.classList.add('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
  }
});
