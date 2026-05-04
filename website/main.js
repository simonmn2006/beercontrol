// Language state
let currentLang = 'de';
let isEditMode = false;

window.setLanguage = function(lang) {
  if (!window.translations || !window.translations[lang]) {
    console.error(`Translations for ${lang} not found`);
    return;
  }

  currentLang = lang;
  document.documentElement.lang = lang;
  
  // Static translations + DB overrides are already merged in translations object
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    if (window.translations[lang][key]) {
      const translation = window.translations[lang][key];
      if (translation.includes('<') || translation.includes('&')) {
        el.innerHTML = translation;
      } else {
        el.textContent = translation;
      }
    }
  });

  // Update placeholders
  document.querySelectorAll('[data-t-placeholder]').forEach(el => {
    const key = el.getAttribute('data-t-placeholder');
    if (window.translations[lang][key]) {
      el.placeholder = window.translations[lang][key];
    }
  });

  // Update data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (window.translations[lang][key]) {
      el.innerHTML = window.translations[lang][key];
    }
  });

  // Update images
  document.querySelectorAll('img[data-i]').forEach(img => {
    const key = img.getAttribute('data-i');
    if (window.translations[lang][key]) {
      img.src = window.translations[lang][key];
    }
  });

  // Update buttons state
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${lang}`);
  if (activeBtn) activeBtn.classList.add('active');

  localStorage.setItem('keghero_lang', lang);
};

document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('keghero_lang') || 'de';
  
  // Attach language buttons
  const btnDe = document.getElementById('btn-de');
  const btnEn = document.getElementById('btn-en');
  if (btnDe) btnDe.addEventListener('click', () => window.setLanguage('de'));
  if (btnEn) btnEn.addEventListener('click', () => window.setLanguage('en'));
  
  // ── Cookie Banner Logic ──
  const cookieConsent = localStorage.getItem('keghero_cookies');
  if (!cookieConsent) {
    document.getElementById('cookie-banner').style.display = 'block';
  }

  window.acceptCookies = function() {
    localStorage.setItem('keghero_cookies', 'accepted');
    document.getElementById('cookie-banner').style.display = 'none';
  };

  window.closeCookieBanner = function() {
    localStorage.setItem('keghero_cookies', 'declined');
    document.getElementById('cookie-banner').style.display = 'none';
  };

  // ── Dynamic Site Settings ──
  fetch('/api/content')
    .then(r => r.json())
    .then(dbSettings => {
      Object.keys(dbSettings).forEach(lang => {
        if (!window.translations[lang]) window.translations[lang] = {};
        Object.keys(dbSettings[lang]).forEach(key => {
          window.translations[lang][key] = dbSettings[lang][key];
        });
      });
      window.setLanguage(savedLang);

      // Contact Info display
      const c = dbSettings[currentLang] || {};
      if (document.getElementById('display-address')) document.getElementById('display-address').textContent = c.address || 'Musterstraße 123, Berlin';
      if (document.getElementById('display-email')) document.getElementById('display-email').textContent = c.email || 'info@keghero.de';
      if (document.getElementById('display-phone')) document.getElementById('display-phone').textContent = c.phone || '+49 30 123456';

      if (c.address && document.getElementById('link-address')) {
        document.getElementById('link-address').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`;
      }
      if (c.email && document.getElementById('link-email')) {
        document.getElementById('link-email').href = `mailto:${c.email}`;
      }
      if (c.phone && document.getElementById('link-phone')) {
        document.getElementById('link-phone').href = `tel:${c.phone.replace(/\s/g, '')}`;
      }
    });

  // ── Visual Editor Logic ──
  checkAdmin();

  async function checkAdmin() {
    const res = await fetch('/admin/check');
    const data = await res.json();
    if (data.loggedIn) {
      document.getElementById('admin-bar').style.display = 'flex';
      document.body.style.paddingTop = '60px';
    }
  }

  window.toggleEditMode = function() {
    isEditMode = !isEditMode;
    const btn = document.getElementById('toggle-edit');
    const saveBtn = document.getElementById('save-inline');
    
    if (isEditMode) {
      document.body.classList.add('edit-mode');
      btn.textContent = 'Disable Visual Edit';
      btn.style.background = '#334155';
      btn.style.color = '#fff';
      saveBtn.style.display = 'block';
      document.querySelectorAll('[data-t], [data-i18n]').forEach(el => { el.contentEditable = "true"; });
      document.querySelectorAll('img[data-i]').forEach(img => {
        img.style.cursor = 'pointer';
        img.title = 'Click to change image';
        img.addEventListener('click', imageClickHandler);
      });
    } else {
      document.body.classList.remove('edit-mode');
      btn.textContent = 'Enable Visual Edit';
      btn.style.background = 'var(--accent-amber)';
      btn.style.color = '#000';
      saveBtn.style.display = 'none';
      document.querySelectorAll('[data-t], [data-i18n]').forEach(el => { el.contentEditable = "false"; });
      document.querySelectorAll('img[data-i]').forEach(img => {
        img.style.cursor = '';
        img.title = '';
        img.removeEventListener('click', imageClickHandler);
      });
    }
  };

  function imageClickHandler(e) {
    if (!isEditMode) return;
    const img = e.target;
    const newSrc = prompt('Enter new image URL:', img.src);
    if (newSrc && newSrc !== img.src) {
      img.src = newSrc;
    }
  }

  window.saveInlineChanges = async function() {
    const saveBtn = document.getElementById('save-inline');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const elements = document.querySelectorAll('[data-t], [data-i18n]');
    for (const el of elements) {
      const key = el.getAttribute('data-t') || el.getAttribute('data-i18n');
      const value = el.innerHTML;
      await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: currentLang, key, value })
      });
    }

    // Save image changes
    const images = document.querySelectorAll('img[data-i]');
    for (const img of images) {
      const key = img.getAttribute('data-i');
      const value = img.src;
      await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: currentLang, key, value })
      });
    }

    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);
  };

  window.restoreDefaults = async function() {
    if (!confirm('Are you sure you want to restore all website content to its default state? This cannot be undone.')) return;
    
    const btn = document.querySelector('.btn-restore');
    const originalText = btn.textContent;
    btn.textContent = 'Restoring...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/content/restore', { method: 'POST' });
      if (res.ok) {
        btn.textContent = 'Restored!';
        setTimeout(() => location.reload(), 1000);
      } else {
        throw new Error();
      }
    } catch (err) {
      alert('Error restoring defaults');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };

  window.adminLogout = async function() {
    await fetch('/admin/logout', { method: 'POST' });
    location.reload();
  };

  // ── Generic Carousel Logic ──
  function initCarousel(parentSelector, itemSelector, dotsSelector) {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;
    
    const items = parent.querySelectorAll(itemSelector);
    const dots = parent.querySelectorAll(dotsSelector + ' .dot');
    let currentIndex = 0;

    function showItem(index) {
      items.forEach(d => d.classList.remove('active'));
      dots.forEach(d => d.classList.remove('active'));
      if (items[index]) items[index].classList.add('active');
      if (dots[index]) dots[index].classList.add('active');
      currentIndex = index;
    }

    if (dots.length > 0) {
      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => showItem(i));
      });
      setInterval(() => {
        let next = (currentIndex + 1) % items.length;
        showItem(next);
      }, 5000);
    }
  }

  initCarousel('.industrial-carousel-container', '.industrial-display', '.carousel-dots');
  initCarousel('.fridge-carousel', '.fridge-alert-mockup', '.fridge-dots');

  // ── Scroll Reveal Logic ──
  const observerOptions = {
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-up, .fade-in, .fade-right, .fade-left').forEach(el => {
    observer.observe(el);
  });

  // ── Contact Form Logic ──
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('formStatus');
      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData.entries());
      const privacyChecked = document.getElementById('privacy-check')?.checked;

      if (!data.name || !data.email) {
        status.textContent = 'Please provide your name and email.';
        status.style.color = '#ef4444';
        return;
      }

      if (!privacyChecked) {
        status.textContent = 'Please accept the privacy policy to continue.';
        status.style.color = '#ef4444';
        return;
      }

      status.textContent = 'Sending...';
      status.style.color = '#fff';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          status.textContent = 'Message sent successfully!';
          status.style.color = '#10b981';
          contactForm.reset();
        } else {
          throw new Error();
        }
      } catch (err) {
        status.textContent = 'Error sending message. Please try again.';
        status.style.color = '#ef4444';
      }
    });
  }
});
