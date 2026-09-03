/**
 * Tech Innovations Inc. — Corporate Website JavaScript Engine
 * Modern Premium Light Theme, 3D Tilt Cards, Particle Mesh Canvas, Dynamic Headline Rotator,
 * Scroll Progress, Back-to-Top Indicator, Magnetic Glow, and Careers Integration
 */

// Production & Local HR Workflow API configuration
const HR_WORKFLOW_API_URLS = [
  'https://nexus-hr-workflow.onrender.com/api/job-roles',
  'http://localhost:3000/api/job-roles'
];

const HR_CONTACT_EMAIL = 'manasvipaliwal317@gmail.com';

// Fallback Job Roles in case network is offline
const FALLBACK_JOB_ROLES = [
  {
    id: "role_fullstack",
    title: "Full Stack Developer",
    department: "Engineering & Platform Security",
    isActive: true,
    requiredSkills: ["React", "Node.js", "Express", "PostgreSQL", "REST APIs", "TypeScript", "Git", "System Architecture"],
    minExperience: "2+ Years",
    description: "Designing and developing full-stack web applications, RESTful APIs, responsive frontends, and database architectures for secure enterprise systems."
  },
  {
    id: "role_marketing",
    title: "Digital Marketing Specialist",
    department: "Growth & Digital Acquisition",
    isActive: true,
    requiredSkills: ["SEO", "SEM", "Google Ads", "Meta Ads Manager", "GA4", "Content Strategy", "Conversion Funnels", "Campaign Optimization"],
    minExperience: "1+ Years",
    description: "Leading multi-channel digital acquisition, B2B cybersecurity content strategy, search optimization (SEO), and performance marketing campaigns."
  },
  {
    id: "role_cyber_analyst",
    title: "Cybersecurity Security Analyst",
    department: "Security Operations & Defense",
    isActive: true,
    requiredSkills: ["Vulnerability Assessment", "Network Defense", "SIEM Monitoring", "Incident Response", "OWASP Top 10", "Linux Security"],
    minExperience: "2+ Years",
    description: "Performing vulnerability assessments, monitoring security event streams, evaluating client infrastructure, and hardening network defense controls."
  }
];

document.addEventListener('DOMContentLoaded', () => {
  initScrollProgressBar();
  initNavbar();
  initStickyHeader();
  initScrollAnimations();
  initParticleCanvas();
  initTiltCards();
  initMagneticButtons();
  initDynamicHeadline();
  initCounterAnimations();
  initBackToTop();
  initLiveSecurityPill();
  initContactForm();
  initCareersDynamicFeed();
});

/* ==========================================================================
   1. Reading Scroll Progress Bar
   ========================================================================== */
function initScrollProgressBar() {
  let bar = document.getElementById('scroll-progress-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'scroll-progress-bar';
    document.body.appendChild(bar);
  }

  window.addEventListener('scroll', () => {
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    bar.style.width = scrolled + '%';
  }, { passive: true });
}

/* ==========================================================================
   2. Navigation & Mobile Drawer
   ========================================================================== */
function initNavbar() {
  const mobileToggle = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu-drawer');
  const mobileClose = document.getElementById('mobile-menu-close');

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  if (mobileClose && mobileMenu) {
    mobileClose.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
    });
  }

  // Close mobile drawer on link click
  const navLinks = document.querySelectorAll('#mobile-menu-drawer a');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mobileMenu) mobileMenu.classList.add('hidden');
    });
  });

  // Highlight active link based on current path
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const allNavLinks = document.querySelectorAll('.nav-link-item');
  allNavLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('text-blue-600', 'font-bold', 'active');
      link.classList.remove('text-slate-600');
    }
  });
}

function initStickyHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

/* ==========================================================================
   3. Scroll Reveal Animations (Intersection Observer)
   ========================================================================== */
function initScrollAnimations() {
  const elements = document.querySelectorAll('.reveal-on-scroll, .scale-on-scroll');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  elements.forEach(el => observer.observe(el));
}

/* ==========================================================================
   4. Interactive 3D Tilt Cards with Dynamic Specular Reflection
   ========================================================================== */
function initTiltCards() {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) return; // Skip on touch devices for battery & performance

  const cards = document.querySelectorAll('.glass-panel, .tilt-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;

      card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
      card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale3d(1.01, 1.01, 1.01)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)';
    });
  });
}

/* ==========================================================================
   5. Magnetic Buttons with Cursor Aura
   ========================================================================== */
function initMagneticButtons() {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) return;

  const buttons = document.querySelectorAll('.btn-cyber-primary, .btn-cyber-secondary');
  buttons.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const deltaX = (x - centerX) * 0.18;
      const deltaY = (y - centerY) * 0.18;
      btn.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate(0px, 0px)';
    });
  });
}

/* ==========================================================================
   6. Dynamic Headline Word Rotator / Typing Effect
   ========================================================================== */
function initDynamicHeadline() {
  const target = document.getElementById('dynamic-hero-text');
  if (!target) return;

  const words = [
    'Digital Infrastructure',
    'Enterprise Cloud',
    'AI Workflows',
    'Cyber Resilience',
    'Mission-Critical Data',
    'Scalable Platforms'
  ];

  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typingSpeed = 100;

  function type() {
    const currentWord = words[wordIndex];
    
    if (isDeleting) {
      target.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
      typingSpeed = 50;
    } else {
      target.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
      typingSpeed = 90;
    }

    if (!isDeleting && charIndex === currentWord.length) {
      typingSpeed = 2200; // Pause at full word
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typingSpeed = 400; // Pause before typing next word
    }

    setTimeout(type, typingSpeed);
  }

  // Start typing loop
  setTimeout(type, 800);
}

/* ==========================================================================
   7. Interactive Particle Canvas (Vibrant Cyan & Royal Blue Nodes)
   ========================================================================== */
function initParticleCanvas() {
  const canvas = document.getElementById('hero-particle-canvas');
  if (!canvas) return;

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReducedMotion) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];
  const particleCount = 45;
  const maxDistance = 140;
  let mouse = { x: null, y: null, radius: 100 };

  function resize() {
    width = canvas.width = canvas.parentElement.offsetWidth;
    height = canvas.height = canvas.parentElement.offsetHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.baseVx = (Math.random() - 0.5) * 0.8;
      this.baseVy = (Math.random() - 0.5) * 0.8;
      this.vx = this.baseVx;
      this.vy = this.baseVy;
      this.radius = Math.random() * 2.2 + 1.2;
      this.color = Math.random() > 0.4 ? '#2563eb' : '#0ea5e9';
    }

    update() {
      // Mouse repulsion interaction
      if (mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          const dirX = (dx / dist) * force * 3;
          const dirY = (dy / dist) * force * 3;
          this.x += dirX;
          this.y += dirY;
        }
      }

      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx = -this.vx;
      if (this.y < 0 || this.y > height) this.vy = -this.vy;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(37, 99, 235, 0.35)';
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();

      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistance) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(14, 165, 233, ${0.22 * (1 - dist / maxDistance)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
}

/* ==========================================================================
   8. Animated Stat Counters with Easing
   ========================================================================== */
function initCounterAnimations() {
  const counters = document.querySelectorAll('.stat-counter, [data-target]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-target') || '100');
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        const isDecimal = target % 1 !== 0;
        let startTime = null;
        const duration = 1800;

        function step(timestamp) {
          if (!startTime) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          // Ease-out cubic formula
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const current = target * easeOut;

          if (isDecimal) {
            el.textContent = `${prefix}${current.toFixed(2)}${suffix}`;
          } else {
            el.textContent = `${prefix}${Math.floor(current)}${suffix}`;
          }

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = `${prefix}${target}${suffix}`;
          }
        }

        requestAnimationFrame(step);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.25 });

  counters.forEach(counter => observer.observe(counter));
}

/* ==========================================================================
   9. Floating Back-to-Top Button with Circular SVG Progress Ring
   ========================================================================== */
function initBackToTop() {
  let btn = document.getElementById('btn-back-to-top');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = `
      <svg class="progress-ring" width="48" height="48">
        <circle stroke="#e2e8f0" stroke-width="3" fill="transparent" r="22" cx="24" cy="24"/>
        <circle class="progress-circle" stroke="#2563eb" stroke-width="3" stroke-linecap="round" fill="transparent" r="22" cx="24" cy="24"/>
      </svg>
      <svg class="w-4 h-4 text-blue-600 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/>
      </svg>
    `;
    document.body.appendChild(btn);
  }

  const circle = btn.querySelector('.progress-circle');
  const radius = 22;
  const circumference = 2 * Math.PI * radius; // ~138.23

  if (circle) {
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
  }

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? scrollY / docHeight : 0;

    if (scrollY > 280) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }

    if (circle) {
      const offset = circumference - (progress * circumference);
      circle.style.strokeDashoffset = offset;
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ==========================================================================
   10. Live Security Trust Pill Notification
   ========================================================================== */
function initLiveSecurityPill() {
  let pill = document.getElementById('live-trust-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'live-trust-pill';
    pill.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
      <span id="trust-pill-text">🛡️ Threat Shield Active • 100% Defense Status</span>
    `;
    document.body.appendChild(pill);
  }

  const messages = [
    '🛡️ Threat Shield Active • 100% Defense Status',
    '⚡ 24/7 Security Operations Center • Khandwa, MP',
    '🔒 SOC 2 & ISO 27001 Ready Cloud Architecture',
    '🚀 Autonomous AI Candidate Screening Enabled'
  ];

  let msgIdx = 0;
  setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    const textEl = document.getElementById('trust-pill-text');
    if (textEl) {
      textEl.style.opacity = 0;
      setTimeout(() => {
        textEl.textContent = messages[msgIdx];
        textEl.style.opacity = 1;
      }, 250);
    }
  }, 6000);
}

/* ==========================================================================
   11. Careers Dynamic Feed & Pre-Formatted "Apply Now" Job Application
   ========================================================================== */
function generateJobApplicationMailto(role) {
  const roleTitle = role ? (role.title || 'Specialist') : 'Position';
  const roleDepartment = role ? (role.department || 'Technology & Cybersecurity') : 'Engineering';
  const skillsList = (role && role.requiredSkills && role.requiredSkills.length > 0)
    ? role.requiredSkills.slice(0, 6).join(', ')
    : 'Full Stack Development, React, Node.js, Cybersecurity, IT Systems';

  const subject = `Job Application: ${roleTitle} - [Your Full Name]`;

  const body = `Dear Tech Innovations Inc. Hiring Team,

I am writing to apply for the position of ${roleTitle} (${roleDepartment}) at Tech Innovations Inc.

Please find my application information below:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE DETAILS:
• Full Name: [Your Full Name]
• Contact Number: [Your Mobile / Phone Number]
• Email Address: [Your Email Address]
• Current Location: [City, State / Country]
• Total Relevant Experience: [e.g., 2+ Years]
• Key Technical Skills: [e.g., ${skillsList}]
• Preferred Work Mode: [Remote / Hybrid / On-site]
• Notice Period / Availability: [e.g., Immediate / 15 Days / 30 Days]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Why I am a strong fit for Tech Innovations Inc.:
[Please write 2-3 brief lines highlighting your recent project experience, key technical achievements, and why you are interested in this role.]

📎 Resume Attachment:
I have attached my updated Resume / CV (PDF or DOCX format) to this email for your evaluation.

Thank you for your time and consideration. I look forward to hearing from your recruitment team.

Warm regards,
[Your Full Name]
[Your Contact Number]
[LinkedIn / Portfolio Link - Optional]`;

  return `mailto:${HR_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function initCareersDynamicFeed() {
  const container = document.getElementById('dynamic-job-openings-grid') || document.getElementById('dynamic-jobs-container');
  if (!container) return;

  container.innerHTML = `
    <div class="col-span-full text-center py-12">
      <div class="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p class="mt-4 text-sm text-slate-500 font-medium">Fetching active career opportunities...</p>
    </div>
  `;

  let roles = null;

  for (const url of HR_WORKFLOW_API_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.roles || data.activeRoles || []);
        if (Array.isArray(list) && list.length > 0) {
          roles = list;
          break;
        }
      }
    } catch (e) {
      // Continue to next endpoint fallback
    }
  }

  if (!roles || !roles.length) {
    roles = FALLBACK_JOB_ROLES;
  }

  renderJobRoles(container, roles);
}

function renderJobRoles(container, roles) {
  container.innerHTML = '';

  const activeRoles = roles.filter(r => r.isActive !== false);

  // Update live status badge if present
  const statusBadge = document.getElementById('careers-live-status');
  if (statusBadge) {
    statusBadge.innerHTML = `
      <span class="inline-flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        ${activeRoles.length} Active Positions Open
      </span>
    `;
  }

  activeRoles.forEach((role, idx) => {
    const card = document.createElement('div');
    card.className = `glass-panel p-6 sm:p-8 flex flex-col justify-between reveal-on-scroll reveal-stagger-${(idx % 4) + 1}`;
    
    const mailtoUrl = generateJobApplicationMailto(role);

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <span class="inline-block px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 mb-2">
              ${escapeHtml(role.department || 'Engineering')}
            </span>
            <h3 class="text-xl font-extrabold text-slate-900">${escapeHtml(role.title)}</h3>
          </div>
          <span class="px-2.5 py-1 text-[11px] font-mono font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Full-Time
          </span>
        </div>

        <p class="text-sm text-slate-600 mb-6 leading-relaxed">
          ${escapeHtml(role.description || 'Join our high-impact cybersecurity and technology team.')}
        </p>

        <div class="mb-6">
          <div class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Required Skills:</div>
          <div class="flex flex-wrap gap-1.5">
            ${(role.requiredSkills || []).map(s => `<span class="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md border border-slate-200">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>

        <div class="text-xs text-slate-500 font-mono mb-6">
          Experience: <strong class="text-slate-800">${escapeHtml(role.minExperience || '1+ Years')}</strong> • Location: <strong class="text-slate-800">Khandwa, MP / Remote</strong>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100">
        <a href="${mailtoUrl}" class="btn-cyber-primary text-sm py-3 px-5 w-full text-center font-bold" onclick="showToast('Opening your email app with pre-filled application format for ${escapeHtml(role.title).replace(/'/g, "\\'")}. Please attach your resume and send!', 'success')">
          Apply Now ➔
        </a>
      </div>
    `;

    container.appendChild(card);
  });

  // Re-run tilt and scroll reveal on freshly rendered cards
  initScrollAnimations();
  initTiltCards();
}

/* ==========================================================================
   12. Contact Form Handler
   ========================================================================== */
function initContactForm() {
  const form = document.getElementById('security-contact-form');
  const statusMsg = document.getElementById('contact-form-status');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('contact-name')?.value.trim();
    const email = document.getElementById('contact-email')?.value.trim();
    const phone = document.getElementById('contact-phone')?.value.trim();
    const service = document.getElementById('contact-service')?.value;
    const message = document.getElementById('contact-message')?.value.trim();

    // Validations
    if (!name || name.length < 2) {
      showFormAlert(statusMsg, 'Please enter your full name (minimum 2 characters).', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showFormAlert(statusMsg, 'Please provide a valid business or personal email address.', 'error');
      return;
    }

    if (!phone || phone.length < 8) {
      showFormAlert(statusMsg, 'Please enter a valid phone or mobile number.', 'error');
      return;
    }

    if (!service) {
      showFormAlert(statusMsg, 'Please select the security service or domain required.', 'error');
      return;
    }

    if (!message || message.length < 10) {
      showFormAlert(statusMsg, 'Please provide brief details of your security requirements (at least 10 characters).', 'error');
      return;
    }

    // Success State
    showFormAlert(
      statusMsg, 
      `🛡️ Thank you, ${name}! Your security consultation request for "${service}" has been recorded. For direct inquiries, email us at ${HR_CONTACT_EMAIL}.`, 
      'success'
    );

    form.reset();
  });
}

function showFormAlert(container, message, type) {
  if (!container) return;
  container.classList.remove('hidden', 'bg-red-50', 'border-red-200', 'text-red-700', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-700');

  if (type === 'error') {
    container.classList.add('bg-red-50', 'border', 'border-red-200', 'text-red-700');
  } else {
    container.classList.add('bg-emerald-50', 'border', 'border-emerald-200', 'text-emerald-700');
  }

  container.textContent = message;
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ==========================================================================
   13. Helper Functions
   ========================================================================== */
function copyHREmail(roleTitle = 'Position') {
  navigator.clipboard.writeText(HR_CONTACT_EMAIL).then(() => {
    showToast(`Copied ${HR_CONTACT_EMAIL} to clipboard! Send your resume with subject: "Application for ${roleTitle}".`, 'success');
  }).catch(() => {
    showToast(`HR Email: ${HR_CONTACT_EMAIL}`, 'info');
  });
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('site-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'site-toast-container';
    toastContainer.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-white border-emerald-300 text-emerald-800 shadow-xl' : 'bg-white border-blue-300 text-blue-900 shadow-xl';
  
  toast.className = `p-4 rounded-xl border shadow-lg text-xs font-medium transition-all duration-300 transform translate-y-2 opacity-0 flex items-start gap-3 ${bgClass}`;
  toast.innerHTML = `
    <span class="text-base">${type === 'success' ? '✅' : 'ℹ️'}</span>
    <div class="flex-1">${escapeHtml(message)}</div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.copyHREmail = copyHREmail;
window.showToast = showToast;
