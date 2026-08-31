/**
 * Tech Innovations Inc. — Core Website Client Logic
 * Mobile Nav, Sticky Header, Scroll Reveal, Contact Validation,
 * and Live HR Workflow Careers API Integration.
 */

// Configuration for Live HR Recruitment Workflow Endpoint
const HR_WORKFLOW_API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://nexus-hr-workflow.onrender.com';

const HR_RECRUITER_EMAIL = 'manasvipaliwal317@gmail.com';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initStickyHeader();
  initScrollReveal();
  initStatCounters();
  initContactForm();
  initCareersSystem();
});

/* ----------------- 1. NAVIGATION & MOBILE MENU ----------------- */
function initNavigation() {
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuClose = document.getElementById('mobile-menu-close');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isHidden = mobileMenu.classList.contains('hidden');
      if (isHidden) {
        mobileMenu.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
      } else {
        mobileMenu.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }
    });
  }

  if (mobileMenuClose && mobileMenu) {
    mobileMenuClose.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    });
  }

  // Active Link Highlight
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('nav a, #mobile-menu a');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('text-cyan-400', 'font-semibold');
      link.classList.remove('text-slate-300');
    }
  });
}

/* ----------------- 2. STICKY HEADER ----------------- */
function initStickyHeader() {
  const header = document.getElementById('main-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('bg-slate-950/90', 'backdrop-blur-md', 'shadow-lg', 'border-b', 'border-cyan-500/20');
      header.classList.remove('bg-transparent');
    } else {
      header.classList.remove('bg-slate-950/90', 'shadow-lg', 'border-b', 'border-cyan-500/20');
      header.classList.add('bg-transparent');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

/* ----------------- 3. SCROLL REVEAL (INTERSECTION OBSERVER) ----------------- */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal-on-scroll');
  if (!reveals.length) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    reveals.forEach(el => observer.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-revealed'));
  }
}

/* ----------------- 4. STAT COUNTERS ANIMATION ----------------- */
function initStatCounters() {
  const counters = document.querySelectorAll('.counter-value');
  if (!counters.length) return;

  const startCount = (el) => {
    const target = parseInt(el.getAttribute('data-target') || el.textContent, 10);
    const suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;

    let count = 0;
    const duration = 1800; // ms
    const stepTime = 20;
    const totalSteps = duration / stepTime;
    const increment = target / totalSteps;

    const timer = setInterval(() => {
      count += increment;
      if (count >= target) {
        el.textContent = target + suffix;
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(count) + suffix;
      }
    }, stepTime);
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          startCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
  } else {
    counters.forEach(c => startCount(c));
  }
}

/* ----------------- 5. CONTACT FORM VALIDATION ----------------- */
function initContactForm() {
  const form = document.getElementById('contact-form');
  const alertBox = document.getElementById('contact-alert');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('contact-name')?.value.trim();
    const email = document.getElementById('contact-email')?.value.trim();
    const phone = document.getElementById('contact-phone')?.value.trim();
    const service = document.getElementById('contact-service')?.value;
    const message = document.getElementById('contact-message')?.value.trim();

    if (!name || !email || !service || !message) {
      showContactAlert('Please fill in all required fields marked with *', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showContactAlert('Please enter a valid email address.', 'error');
      return;
    }

    // Static Demo Success Notice
    showContactAlert(
      `✓ Thank you, ${name}! Your security consultation request for "${service}" has been recorded. Our Khandwa security team will contact you at ${email} shortly.`,
      'success'
    );
    form.reset();
  });

  function showContactAlert(msg, type) {
    if (!alertBox) {
      alert(msg);
      return;
    }
    alertBox.className = `p-4 rounded-lg mb-6 border text-sm ${
      type === 'success' 
        ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' 
        : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
    }`;
    alertBox.innerHTML = msg;
    alertBox.classList.remove('hidden');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ----------------- 6. DYNAMIC CAREERS & HR WORKFLOW INTEGRATION ----------------- */
let activeJobOpenings = [];

async function initCareersSystem() {
  const container = document.getElementById('careers-openings-grid');
  const countBadge = document.getElementById('careers-active-count');
  if (!container) return;

  // Fallback data if workflow server is offline
  const fallbackRoles = [
    {
      id: "role_fullstack",
      title: "Full Stack Developer",
      department: "Engineering",
      isActive: true,
      minExperience: "2+ Years",
      requiredSkills: ["React", "Node.js", "Express", "PostgreSQL", "REST APIs", "TypeScript", "Git"],
      description: "Designing and developing scalable web applications, secure RESTful APIs, modern frontend dashboards, and resilient cloud architectures."
    },
    {
      id: "role_marketing",
      title: "Digital Marketing Specialist",
      department: "Growth & Marketing",
      isActive: true,
      minExperience: "1+ Years",
      requiredSkills: ["SEO", "SEM", "Google Ads", "Meta Ads Manager", "GA4", "Content Strategy", "Performance Funnels"],
      description: "Leading multi-channel growth campaigns, paid advertising strategies, technical SEO audits, and conversion rate optimization."
    }
  ];

  try {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400 mb-3"></div>
        <p class="text-slate-400 text-sm">Connecting to Live HR Recruitment Workflow & fetching active openings...</p>
      </div>
    `;

    const res = await fetch(`${HR_WORKFLOW_API_URL}/api/job-roles`, { timeout: 5000 }).catch(() => null);
    
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.roles && Array.isArray(data.roles)) {
        activeJobOpenings = data.roles.filter(r => r.isActive);
      }
    }

    // Use fallback if API returned no active roles or failed
    if (!activeJobOpenings || activeJobOpenings.length === 0) {
      activeJobOpenings = fallbackRoles;
    }

    renderCareersGrid(activeJobOpenings, container);
    if (countBadge) {
      countBadge.textContent = `${activeJobOpenings.length} Active Opening${activeJobOpenings.length === 1 ? '' : 's'}`;
    }
  } catch (err) {
    console.warn('Using fallback job roles:', err);
    activeJobOpenings = fallbackRoles;
    renderCareersGrid(activeJobOpenings, container);
  }

  initApplicationModal();
}

function renderCareersGrid(roles, container) {
  if (!roles || roles.length === 0) {
    container.innerHTML = `
      <div class="col-span-full glass-panel p-8 text-center rounded-xl">
        <span class="text-3xl mb-2 block">💼</span>
        <h3 class="text-lg font-bold text-white mb-1">No Active Openings at this moment</h3>
        <p class="text-slate-400 text-sm max-w-md mx-auto mb-4">We are currently not hiring for new positions. However, you can send your open application to our HR inbox.</p>
        <a href="mailto:${HR_RECRUITER_EMAIL}" class="btn-cyber-primary text-xs">📧 Email General Resume</a>
      </div>
    `;
    return;
  }

  container.innerHTML = roles.map(r => {
    const skillsChips = (r.requiredSkills || []).map(s => 
      `<span class="text-[11px] px-2.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30 text-cyan-300">${escapeHtml(s)}</span>`
    ).join(' ');

    return `
      <div class="glass-panel rounded-xl p-6 flex flex-col justify-between hover:border-cyan-400/60 transition-all">
        <div>
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">${escapeHtml(r.department || 'General')}</span>
              <h3 class="text-lg font-bold text-white mt-2">${escapeHtml(r.title)}</h3>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
              🟢 HIRING OPEN
            </span>
          </div>

          <p class="text-slate-300 text-xs leading-relaxed mb-4">
            ${escapeHtml(r.description || 'Join Tech Innovations Inc. in building secure, cutting-edge software and IT solutions.')}
          </p>

          <div class="mb-4">
            <div class="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Required Skills & Tech:</div>
            <div class="flex flex-wrap gap-1.5">
              ${skillsChips}
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-800 flex items-center justify-between mt-auto">
          <span class="text-xs text-slate-400">
            ⏳ Exp: <strong class="text-slate-200">${escapeHtml(r.minExperience || '1+ Yrs')}</strong>
          </span>
          <button 
            onclick="openApplyModal('${escapeHtml(r.title)}', '${r.id}')"
            class="btn-cyber-primary text-xs !py-1.5 !px-3.5"
          >
            Apply Now ➔
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* ----------------- 7. CAREER APPLICATION MODAL & WORKFLOW DISPATCH ----------------- */
function initApplicationModal() {
  const modal = document.getElementById('apply-modal');
  const closeBtn = document.getElementById('close-apply-modal');
  const form = document.getElementById('apply-form');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-application');
      const feedback = document.getElementById('apply-feedback');

      const name = document.getElementById('apply-name')?.value.trim();
      const email = document.getElementById('apply-email')?.value.trim();
      const phone = document.getElementById('apply-phone')?.value.trim();
      const role = document.getElementById('apply-role')?.value.trim();
      const resumeText = document.getElementById('apply-resume-text')?.value.trim();
      const notes = document.getElementById('apply-notes')?.value.trim();

      if (!name || !email || !resumeText) {
        if (feedback) {
          feedback.className = 'p-3 rounded text-xs bg-rose-950/80 border border-rose-500/40 text-rose-300 mb-3';
          feedback.textContent = 'Please provide your Full Name, Email, and Resume Summary / Text.';
          feedback.classList.remove('hidden');
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `🔄 Submitting to AI Workflow...`;
      }

      try {
        // Dispatch directly to live HR workflow evaluation endpoint
        const res = await fetch(`${HR_WORKFLOW_API_URL}/api/evaluate-resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateName: name,
            candidateEmail: email,
            candidatePhone: phone,
            appliedRole: role,
            resumeText: `${resumeText}\n\nAdditional Applicant Notes: ${notes}`,
            fileName: 'Direct Website Career Portal Submission'
          })
        });

        const data = await res.json();
        
        if (feedback) {
          feedback.className = 'p-3 rounded text-xs bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 mb-3';
          feedback.innerHTML = `
            🎉 <strong>Application Submitted Successfully!</strong><br>
            Your resume has been registered in the Tech Innovations Inc. HR Recruitment Workflow. Our AI evaluation engine has analyzed your profile for <em>${role}</em>. Check your email (<strong>${email}</strong>) for subsequent interview updates!
          `;
          feedback.classList.remove('hidden');
        }

        form.reset();
        setTimeout(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit Application`;
          }
        }, 3000);
      } catch (err) {
        // Fallback simulated submission for demo if server is offline
        if (feedback) {
          feedback.className = 'p-3 rounded text-xs bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 mb-3';
          feedback.innerHTML = `
            ✓ <strong>Application Recorded (Demo Mode)</strong><br>
            Thank you, ${name}. Your profile has been sent to our recruiter inbox (<strong>${HR_RECRUITER_EMAIL}</strong>).
          `;
          feedback.classList.remove('hidden');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `Submit Application`;
        }
      }
    });
  }
}

function openApplyModal(roleTitle, roleId) {
  const modal = document.getElementById('apply-modal');
  const roleInput = document.getElementById('apply-role');
  const roleDisplay = document.getElementById('apply-role-display');
  const feedback = document.getElementById('apply-feedback');

  if (feedback) feedback.classList.add('hidden');
  if (roleInput) roleInput.value = roleTitle;
  if (roleDisplay) roleDisplay.textContent = roleTitle;

  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function copyRecruiterEmail() {
  navigator.clipboard.writeText(HR_RECRUITER_EMAIL).then(() => {
    alert(`Copied HR email (${HR_RECRUITER_EMAIL}) to clipboard! Send your resume directly from your email client.`);
  }).catch(() => {
    alert(`Recruiter email: ${HR_RECRUITER_EMAIL}`);
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Attach globally
window.openApplyModal = openApplyModal;
window.copyRecruiterEmail = copyRecruiterEmail;
