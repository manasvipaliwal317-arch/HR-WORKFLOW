/**
 * Tech Innovations Inc. — Corporate Website JavaScript Engine
 * Modern Clean Enterprise Light Theme, Interactive Particle Canvas, Dynamic Careers API, and Form Validation
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
  initNavbar();
  initStickyHeader();
  initScrollAnimations();
  initParticleCanvas();
  initCounterAnimations();
  initContactForm();
  initCareersDynamicFeed();
});

/* ==========================================================================
   1. Navigation & Mobile Drawer
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
      link.classList.add('text-blue-600', 'font-bold');
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
  });
}

/* ==========================================================================
   2. Scroll Reveal Animations (Intersection Observer)
   ========================================================================== */
function initScrollAnimations() {
  const elements = document.querySelectorAll('.reveal-on-scroll');
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
   3. Interactive Particle Canvas (Light Theme: Vibrant Blue & Sky Cyan)
   ========================================================================== */
function initParticleCanvas() {
  const canvas = document.getElementById('hero-particle-canvas');
  if (!canvas) return;

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReducedMotion) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];
  const particleCount = 40;
  const maxDistance = 130;

  function resize() {
    width = canvas.width = canvas.parentElement.offsetWidth;
    height = canvas.height = canvas.parentElement.offsetHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.75;
      this.vy = (Math.random() - 0.5) * 0.75;
      this.radius = Math.random() * 2 + 1.2;
      this.color = Math.random() > 0.4 ? '#2563eb' : '#0ea5e9';
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx = -this.vx;
      if (this.y < 0 || this.y > height) this.vy = -this.vy;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(37, 99, 235, 0.3)';
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
          ctx.strokeStyle = `rgba(14, 165, 233, ${0.18 * (1 - dist / maxDistance)})`;
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
   4. Animated Stat Counters
   ========================================================================== */
function initCounterAnimations() {
  const counters = document.querySelectorAll('.stat-counter');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target') || '100', 10);
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        let start = 0;
        const duration = 1600;
        const stepTime = 25;
        const totalSteps = duration / stepTime;
        const increment = target / totalSteps;

        const timer = setInterval(() => {
          start += increment;
          if (start >= target) {
            el.textContent = `${prefix}${target}${suffix}`;
            clearInterval(timer);
          } else {
            el.textContent = `${prefix}${Math.floor(start)}${suffix}`;
          }
        }, stepTime);

        observer.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  counters.forEach(counter => observer.observe(counter));
}

/* ==========================================================================
   5. Dynamic Careers Feed (Direct Live Sync with HR Recruitment Workflow)
   ========================================================================== */
async function initCareersDynamicFeed() {
  const container = document.getElementById('dynamic-job-openings-grid');
  if (!container) return;

  const statusBadge = document.getElementById('careers-live-status');
  if (statusBadge) {
    statusBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping mr-2"></span> Checking active openings...`;
  }

  let jobRoles = [];

  // Try fetching from production workflow API, then local, then fallback
  for (const url of HR_WORKFLOW_API_URLS) {
    try {
      const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.roles)) {
          jobRoles = data.roles;
          console.log(`✅ Loaded ${jobRoles.length} job roles from HR workflow: ${url}`);
          break;
        }
      }
    } catch (e) {
      // Try next
    }
  }

  if (!jobRoles.length) {
    jobRoles = FALLBACK_JOB_ROLES;
    console.log('ℹ️ Loaded built-in cybersecurity job openings fallback.');
  }

  renderCareers(jobRoles, container, statusBadge);
}

function renderCareers(roles, container, statusBadge) {
  // Filter for currently active job openings
  const activeRoles = roles.filter(r => r.isActive !== false);

  if (statusBadge) {
    statusBadge.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        ${activeRoles.length} Active Job Opening${activeRoles.length === 1 ? '' : 's'} Available
      </span>
    `;
  }

  if (activeRoles.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-2xl">
          💼
        </div>
        <h3 class="text-xl font-bold text-slate-900 mb-2">No Active Openings Right Now</h3>
        <p class="text-slate-600 max-w-md mx-auto mb-6">
          Our team is currently at full capacity, but we always welcome talented cybersecurity professionals and engineers. Send your resume for future opportunities.
        </p>
        <a href="mailto:${HR_CONTACT_EMAIL}?subject=General Application - Future Opportunities" class="btn-cyber-primary">
          Send General Resume to HR Desk
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = activeRoles.map((role) => {
    const skillsList = (role.requiredSkills || []).map(skill => 
      `<span class="text-xs px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-medium">${escapeHtml(skill)}</span>`
    ).join('');

    const emailSubject = encodeURIComponent(`Application for ${role.title} - [Your Full Name]`);
    const emailBody = encodeURIComponent(`Dear Tech Innovations Inc. HR Team,\n\nI am excited to apply for the position of "${role.title}". Please find my attached resume (.pdf/.docx) for your review.\n\nThank you,\n[Your Name]\n[Phone Number]`);
    const mailtoLink = `mailto:${HR_CONTACT_EMAIL}?subject=${emailSubject}&body=${emailBody}`;

    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between hover:border-blue-300 hover:shadow-lg transition-all duration-300 group shadow-sm">
        <div>
          <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 uppercase tracking-wider">
                ${escapeHtml(role.department || 'Cybersecurity & Engineering')}
              </span>
              <h3 class="text-xl sm:text-2xl font-bold text-slate-900 mt-2.5 group-hover:text-blue-600 transition-colors">
                ${escapeHtml(role.title)}
              </h3>
            </div>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active Opening
            </span>
          </div>

          <div class="flex items-center gap-4 text-xs text-slate-500 mb-4 pb-4 border-b border-slate-100">
            <span class="flex items-center gap-1.5 font-medium">
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              ${escapeHtml(role.minExperience || '1+ Years')} Experience
            </span>
            <span class="flex items-center gap-1.5 font-medium">
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Khandwa, MP / Hybrid
            </span>
          </div>

          <p class="text-slate-600 text-sm leading-relaxed mb-6">
            ${escapeHtml(role.description || 'Join our cybersecurity team to build secure architectures and protect enterprise client infrastructure.')}
          </p>

          <div class="mb-6">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">Key Required Competencies</h4>
            <div class="flex flex-wrap gap-1.5">
              ${skillsList}
            </div>
          </div>
        </div>

        <div class="pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div class="text-xs text-slate-500">
            <span>Recruitment Desk:</span> <strong class="text-slate-800 font-mono">${HR_CONTACT_EMAIL}</strong>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="copyHREmail('${role.title}')" class="btn-cyber-secondary text-xs py-2 px-3" title="Copy HR application email address">
              📋 Copy Email
            </button>
            <a href="${mailtoLink}" class="btn-cyber-primary text-xs py-2 px-4">
              ✉️ Apply via Email ➔
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   6. Contact Form Validation & Submission
   ========================================================================== */
function initContactForm() {
  const form = document.getElementById('consultation-contact-form');
  if (!form) return;

  const statusMsg = document.getElementById('contact-form-status');

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
      `🛡️ Thank you, ${name}! Your security consultation request for "${service}" has been recorded in this demo interface. For live inquiries, please reach our team directly at ${HR_CONTACT_EMAIL}.`, 
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
   7. Helper Functions
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
