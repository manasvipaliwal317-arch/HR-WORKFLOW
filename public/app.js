// Nexus HR — Core Frontend Client Logic

let allCandidates = [];
let filteredCandidates = [];
let selectedCandidate = null;
let allJobRoles = [];
let currentSettings = {};
let activeView = 'cards'; // 'cards' or 'table'

// Sample Strong & Weak Resumes for instant testing
const SAMPLE_STRONG_RESUME = `Candidate: Marcus Sterling
Email: marcus.sterling.lead@gmail.com
Phone: +1 (555) 832-1920
Applied Role: Full Stack Developer

Executive Summary:
Full Stack Developer with 5+ years building scalable web applications. Deep expertise in React, Next.js, Node.js, Express, TypeScript, PostgreSQL, REST APIs, and AWS. Strong focus on clean architecture and high-performance frontend interfaces.

Work History:
- Full Stack Engineer | CloudNexus (2023 - Present)
  * Architected high-performance React/TypeScript web app serving 500k monthly users.
  * Built real-time backend microservices using Node.js, Express, and PostgreSQL.
  * Decreased page load latency by 55% using SSR, code splitting, and Redis caching.
- Web Application Developer | Apex Tech (2021 - 2023)
  * Designed resilient REST & GraphQL APIs with 99.9% uptime SLA.
  * Implemented automated CI/CD pipelines with Docker and GitHub Actions.

Education:
B.S. in Computer Science, State University (2017 - 2021)

Core Skills:
React, TypeScript, Node.js, Express, PostgreSQL, MongoDB, REST APIs, Docker, Git, Tailwind CSS`;

const SAMPLE_MARKETING_RESUME = `Candidate: Sneha Verma
Email: sneha.verma.marketing@gmail.com
Phone: +91 98765 43210
Applied Role: Digital Marketing Specialist

Executive Summary:
Data-driven Digital Marketing Specialist with 4+ years leading omnichannel growth campaigns, Performance Marketing (Google & Meta Ads), SEO/SEM, and Conversion Rate Optimization (CRO). Managed $350k+ annual ad budgets with an average 4.2x ROAS.

Work History:
- Senior Performance Marketing Lead | GrowthScale Media (2022 - Present)
  * Scaled organic search traffic by 180% via technical SEO audits and high-intent content strategy.
  * Managed Google Ads (Search/Shopping) and Meta Ads campaigns generating $1.8M in attributed pipeline.
  * Set up Google Analytics 4 (GA4), GTM tracking, and conversion funnels.
- Digital Marketing Associate | Pulse Digital (2020 - 2022)
  * Executed email marketing automation nurturing sequences with a 38% open rate.
  * Coordinated social media brand strategy across LinkedIn, Instagram, and Twitter/X.

Education:
Bachelor of Business Administration (Marketing), Delhi University (2017 - 2020)

Core Skills:
Google Ads, Meta Ads Manager, Technical SEO, SEMrush, Google Analytics 4, Content Strategy, Email Marketing, CRO, Copywriting`;

const SAMPLE_MISMATCH_RESUME = `Candidate: Toby Flenderson
Email: toby.flenderson.sales@yahoo.com
Phone: +1 (555) 123-9876
Applied Role: Full Stack Developer

Summary:
Energetic retail store associate and event coordinator with 1 year experience in cashier management, basic MS Word, and email correspondence. Looking for a high-paying Developer role.

Experience:
- Store Clerk | Valley Supermarket (2024 - Present)
  * Handled checkout register, customer questions, and inventory restocking.
- Receptionist | City Gym (2023 - 2024)
  * Answered phone inquiries and scheduled fitness classes.

Education:
High School Diploma, Scranton High

Skills:
Customer Support, Cash Register, Microsoft Office, Typing (50 WPM)`;

// DOM Ready Init
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTheme();
  initDropzone();
  initFilters();
  initScanner();
  initSettings();
  initModal();
  initJobRoles();
  initRealtimeScanner();
  
  // Load initial data
  loadJobRoles();
  loadCandidates();
  loadStats();
  loadSettings();

  // Active Openings Chip Click -> Switch to Settings & scroll to roles
  const chipOpenings = document.getElementById('chip-active-openings');
  if (chipOpenings) {
    chipOpenings.addEventListener('click', () => {
      switchTab('settings');
      setTimeout(() => {
        const target = document.getElementById('roles-manager-list');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    });
  }

  // Sync button
  const syncBtn = document.getElementById('btn-sync-refresh');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.classList.add('loading');
      await Promise.all([loadJobRoles(), loadCandidates(), loadStats()]);
      showToast('Synced candidates, stats & active job openings!', 'success');
      setTimeout(() => {
        syncBtn.disabled = false;
        syncBtn.classList.remove('loading');
      }, 500);
    });
  }

  // Open scanner CTA
  const openScannerBtn = document.getElementById('btn-open-scanner');
  if (openScannerBtn) {
    openScannerBtn.addEventListener('click', () => {
      switchTab('scanner');
    });
  }

  // View toggle
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');
  if (btnCards) btnCards.addEventListener('click', () => setViewMode('cards'));
  if (btnTable) btnTable.addEventListener('click', () => setViewMode('table'));
});

// Real-Time Inbox Scanner & Live Updates
function initRealtimeScanner() {
  const btnScan = document.getElementById('btn-force-scan');
  
  if (btnScan) {
    btnScan.addEventListener('click', async () => {
      btnScan.disabled = true;
      btnScan.innerHTML = `🔄 Scanning...`;
      try {
        const res = await fetch('/api/scan-inbox', { method: 'POST', cache: 'no-store' });
        const data = await res.json();
        showToast(data.message || 'Scanning INBOX for candidate resumes...', 'info');
        setTimeout(() => {
          loadCandidates();
          loadStats();
          btnScan.disabled = false;
          btnScan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Scan Mail Now`;
        }, 2000);
      } catch (err) {
        btnScan.disabled = false;
        btnScan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Scan Mail Now`;
      }
    });
  }

  // Server-Sent Events (SSE) for instant live push
  initSSE();

  // Background auto-refresh every 2.5s to ensure zero stale state
  setInterval(() => {
    loadCandidatesSilently();
    updateScannerTelemetry();
  }, 2500);
}

// Live SSE Stream Connector with Automatic Reconnection
let liveEventSource = null;
let sseReconnectTimer = null;

function initSSE() {
  if (!window.EventSource) {
    console.warn("EventSource not supported by browser, falling back to high-frequency polling");
    return;
  }

  if (liveEventSource) {
    try { liveEventSource.close(); } catch(e) {}
  }

  try {
    liveEventSource = new EventSource('/api/live-events');

    liveEventSource.onopen = () => {
      const badge = document.getElementById('scanner-last-sync');
      if (badge) badge.innerHTML = `⚡ Live Stream Connected (Every 5s)`;
    };

    liveEventSource.addEventListener('candidate_added', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.candidate) {
          handleLiveCandidateArrival(data.candidate);
        } else if (data && Array.isArray(data.candidates)) {
          allCandidates = data.candidates;
          updateMetrics(allCandidates);
          updateRoleDropdown(allCandidates);
          applyFilters();
          renderEmailLogs();
          loadStats();
        } else {
          loadCandidates();
          loadStats();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
        loadCandidates();
      }
    });

    liveEventSource.addEventListener('candidate_updated', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.candidate) {
          handleLiveCandidateArrival(data.candidate);
        }
      } catch(err) {}
      loadCandidates();
      loadStats();
    });

    liveEventSource.addEventListener('candidate_deleted', () => {
      loadCandidates();
      loadStats();
    });

    liveEventSource.addEventListener('job_roles_updated', () => {
      loadJobRoles();
    });

    liveEventSource.onerror = () => {
      try { liveEventSource.close(); } catch(e) {}
      clearTimeout(sseReconnectTimer);
      sseReconnectTimer = setTimeout(initSSE, 3000);
    };
  } catch (e) {
    console.warn("SSE init error, using poller:", e);
  }
}

// Instant Live Candidate Dispatcher: Immediate in-memory injection & instant UI re-render
function handleLiveCandidateArrival(cand) {
  if (!cand) return;

  const existingIdx = allCandidates.findIndex(c => 
    c.id === cand.id || 
    (c.email && cand.email && c.email.toLowerCase() === cand.email.toLowerCase() && c.role === cand.role) ||
    (c.name && cand.name && c.name.toLowerCase() === cand.name.toLowerCase() && c.role === cand.role)
  );

  if (existingIdx >= 0) {
    allCandidates[existingIdx] = cand;
  } else {
    allCandidates.unshift(cand);
  }

  // Update all UI components instantly without network delay
  updateMetrics(allCandidates);
  updateRoleDropdown(allCandidates);
  applyFilters();
  renderEmailLogs();
  loadStats();

  const isSelected = cand.decision === 'SELECTED';
  const statusHtml = isSelected
    ? `<span style="color:#10b981;font-weight:700;">SELECTED (Interview Invite Dispatched)</span>`
    : `<span style="color:#ef4444;font-weight:700;">REJECTED (Constructive Feedback Sent)</span>`;

  showToast(`
    <div style="text-align:left;">
      <div style="font-weight:700;font-size:0.95rem;margin-bottom:2px;">⚡ Live Email Resume Processed</div>
      <div><strong>${escapeHtml(cand.name)}</strong> (${escapeHtml(cand.role)}) — <strong>${cand.matchScore}% Match</strong></div>
      <div>Status: ${statusHtml}</div>
    </div>
  `, isSelected ? 'success' : 'info');

  // Flash highlight newly arrived card
  setTimeout(() => {
    const firstCard = document.querySelector('.candidate-card');
    if (firstCard) {
      firstCard.classList.add('flash-highlight');
      setTimeout(() => firstCard.classList.remove('flash-highlight'), 3500);
    }
  }, 50);

  // Subtle audio chime
  try { playChime(isSelected); } catch (e) {}

  // Follow-up background sync
  loadCandidates();
  loadStats();
}

function playChime(isSuccess) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.12); // F4
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {}
}

// Silent poller that preserves active user filter selections with deep fingerprinting
async function loadCandidatesSilently() {
  try {
    const res = await fetch('/api/candidates', { cache: 'no-store' });
    const data = await res.json();
    if (data.success && Array.isArray(data.candidates)) {
      const newFingerprint = data.candidates.map(c => `${c.id}_${c.decision}_${c.status}_${c.matchScore}_${c.updatedAt || c.createdAt}`).join('|');
      const oldFingerprint = allCandidates.map(c => `${c.id}_${c.decision}_${c.status}_${c.matchScore}_${c.updatedAt || c.createdAt}`).join('|');
      
      if (newFingerprint !== oldFingerprint || data.candidates.length !== allCandidates.length) {
        allCandidates = data.candidates;
        updateMetrics(allCandidates);
        updateRoleDropdown(allCandidates);
        applyFilters();
        renderEmailLogs();
        loadStats();
      }
    }
  } catch (e) {}
}

async function updateScannerTelemetry() {
  try {
    const res = await fetch('/api/scanner-status', { cache: 'no-store' });
    const data = await res.json();
    if (data.success && data.stats) {
      const badgeSync = document.getElementById('scanner-last-sync');
      if (badgeSync) {
        badgeSync.textContent = `⚡ Live (Scans: ${data.stats.totalScans} | Resumes: ${data.stats.resumesProcessed})`;
      }
    }
  } catch (e) {}
}

// Toast Utility
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Tab Switching
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  if (tabId === 'analytics') loadStats();
  if (tabId === 'emails') renderEmailLogs();
}

// Theme Toggle
function initTheme() {
  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (!toggleBtn) return;
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('nexus_theme', isLight ? 'light' : 'dark');
  });
  if (localStorage.getItem('nexus_theme') === 'light') {
    document.body.classList.add('light-theme');
  }
}

// View Mode
function setViewMode(mode) {
  activeView = mode;
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');
  const gridContainer = document.getElementById('candidate-grid-container');
  const tableContainer = document.getElementById('candidate-table-container');

  if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
  if (btnTable) btnTable.classList.toggle('active', mode === 'table');
  if (gridContainer) gridContainer.style.display = mode === 'cards' ? 'grid' : 'none';
  if (tableContainer) tableContainer.style.display = mode === 'table' ? 'block' : 'none';
}

// Load Candidates from API
async function loadCandidates() {
  try {
    const res = await fetch('/api/candidates', { cache: 'no-store' });
    const data = await res.json();
    if (data.success && Array.isArray(data.candidates)) {
      allCandidates = data.candidates;
      updateMetrics(allCandidates);
      updateRoleDropdown(allCandidates);
      applyFilters();
      renderEmailLogs();
    }
  } catch (e) {
    console.error('Failed to load candidates:', e);
  }
}

// Instant Filter Application
function applyFilters() {
  const searchInput = document.getElementById('pipeline-search');
  const decisionSelect = document.getElementById('filter-decision');
  const statusSelect = document.getElementById('filter-status');
  const roleSelect = document.getElementById('filter-role');

  const search = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const decision = decisionSelect ? decisionSelect.value : 'ALL';
  const status = statusSelect ? statusSelect.value : 'ALL';
  const role = roleSelect ? roleSelect.value : 'ALL';

  filteredCandidates = allCandidates.filter(c => {
    // Decision filter
    if (decision !== 'ALL' && c.decision !== decision) {
      return false;
    }
    // Pipeline Status filter
    if (status !== 'ALL' && c.status !== status) {
      return false;
    }
    // Role filter
    if (role !== 'ALL' && c.role !== role) {
      return false;
    }
    // Search query filter
    if (search) {
      const name = (c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const cRole = (c.role || '').toLowerCase();
      const edu = (c.education || '').toLowerCase();
      const summary = (c.evaluationSummary || '').toLowerCase();
      const skills = (c.topSkills || []).map(s => String(s).toLowerCase()).join(' ');

      const matches = name.includes(search) || 
                      email.includes(search) || 
                      cRole.includes(search) || 
                      edu.includes(search) || 
                      summary.includes(search) || 
                      skills.includes(search);

      if (!matches) return false;
    }

    return true;
  });

  const countDisplay = document.getElementById('candidate-count-display');
  if (countDisplay) {
    countDisplay.textContent = filteredCandidates.length;
  }

  renderCandidates(filteredCandidates);
}

// Filter listeners
function initFilters() {
  const searchInput = document.getElementById('pipeline-search');
  const decisionSelect = document.getElementById('filter-decision');
  const statusSelect = document.getElementById('filter-status');
  const roleSelect = document.getElementById('filter-role');

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  if (decisionSelect) {
    decisionSelect.addEventListener('change', applyFilters);
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', applyFilters);
  }

  if (roleSelect) {
    roleSelect.addEventListener('change', applyFilters);
  }
}

// Render Candidate Cards & Table
function renderCandidates(candidates) {
  const grid = document.getElementById('candidate-grid-container');
  const tbody = document.getElementById('candidate-table-body');
  if (!grid || !tbody) return;

  grid.innerHTML = '';
  tbody.innerHTML = '';

  if (candidates.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
        <p style="color: var(--text-secondary); font-size: 1rem; margin-bottom: 1rem;">No candidates match your current search/filter criteria.</p>
        <button class="btn-primary" onclick="resetFilters()">Reset Filters</button>
      </div>
    `;
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-secondary);">
          No candidates found for selected filters.
        </td>
      </tr>
    `;
    return;
  }

  candidates.forEach(cand => {
    const isSelected = cand.decision === 'SELECTED';
    const initials = (cand.name || 'Candidate').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'CD';
    const scoreClass = cand.matchScore >= 70 ? 'high' : 'low';
    const dateStr = cand.createdAt ? new Date(cand.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today';

    // Card View
    const card = document.createElement('div');
    card.className = `candidate-card ${isSelected ? 'selected' : 'rejected'}`;
    card.innerHTML = `
      <div>
        <div class="card-top">
          <div class="candidate-profile-short">
            <div class="avatar-initials">${initials}</div>
            <div>
              <div class="card-name">${escapeHtml(cand.name)}</div>
              <div class="card-role">${escapeHtml(cand.role || 'Software Engineer')}</div>
            </div>
          </div>
          <div class="score-badge-circle ${scoreClass}">
            ${cand.matchScore}
            <span>match</span>
          </div>
        </div>

        <div class="card-badges-row">
          <span class="badge-decision ${isSelected ? 'selected' : 'rejected'}">
            ${isSelected ? '✓ SELECTED' : '✕ REJECTED'}
          </span>
          <span class="badge-status">
            ${formatStatus(cand.status)}
          </span>
        </div>

        <p class="card-summary-snippet">
          ${escapeHtml(cand.evaluationSummary || 'Candidate resume scanned and analyzed.')}
        </p>

        <div class="card-skills-row">
          ${(cand.topSkills || []).slice(0, 4).map(s => `<span class="skill-pill">${escapeHtml(s)}</span>`).join('')}
          ${(cand.topSkills || []).length > 4 ? `<span class="skill-pill">+${cand.topSkills.length - 4}</span>` : ''}
        </div>
      </div>

      <div class="card-footer">
        <span>Applied ${dateStr}</span>
        <button class="btn-card-inspect">View AI Analysis ➔</button>
      </div>
    `;
    card.addEventListener('click', () => openCandidateModal(cand));
    grid.appendChild(card);

    // Table View
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(cand.name)}</strong><br>
        <small style="color:var(--text-muted);">${escapeHtml(cand.email)}</small>
      </td>
      <td>${escapeHtml(cand.role)}</td>
      <td>
        <span class="badge-decision ${isSelected ? 'selected' : 'rejected'}">
          ${cand.decision}
        </span>
      </td>
      <td>
        <strong style="color: ${cand.matchScore >= 70 ? 'var(--success-text)' : 'var(--danger-text)'}">${cand.matchScore}%</strong>
      </td>
      <td><span class="badge-status">${formatStatus(cand.status)}</span></td>
      <td>
        ${(cand.topSkills || []).slice(0, 3).map(s => `<span class="skill-pill">${escapeHtml(s)}</span>`).join(' ')}
      </td>
      <td>${dateStr}</td>
      <td>
        <button class="btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Inspect</button>
      </td>
    `;
    tr.addEventListener('click', () => openCandidateModal(cand));
    tbody.appendChild(tr);
  });
}

function resetFilters() {
  const searchInput = document.getElementById('pipeline-search');
  const decisionSelect = document.getElementById('filter-decision');
  const statusSelect = document.getElementById('filter-status');
  const roleSelect = document.getElementById('filter-role');

  if (searchInput) searchInput.value = '';
  if (decisionSelect) decisionSelect.value = 'ALL';
  if (statusSelect) statusSelect.value = 'ALL';
  if (roleSelect) roleSelect.value = 'ALL';

  applyFilters();
}

// Role Dropdown Populator
function updateRoleDropdown(candidates) {
  const roleSelect = document.getElementById('filter-role');
  if (!roleSelect) return;
  const currentVal = roleSelect.value;
  const roles = Array.from(new Set(candidates.map(c => c.role).filter(Boolean))).sort();

  roleSelect.innerHTML = `<option value="ALL">All Roles</option>`;
  roles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    if (r === currentVal) opt.selected = true;
    roleSelect.appendChild(opt);
  });
}

// Instant KPI Calculation & UI Update from Candidates Array
function updateMetrics(candidates) {
  const total = candidates.length;
  const selected = candidates.filter(c => c.decision === 'SELECTED').length;
  const rejected = candidates.filter(c => c.decision === 'REJECTED').length;
  const interviewScheduled = candidates.filter(c => c.status === 'INTERVIEW_SCHEDULED').length;
  const offerExtended = candidates.filter(c => c.status === 'OFFER_EXTENDED').length;

  const totalScore = candidates.reduce((acc, c) => acc + (Number(c.matchScore) || 0), 0);
  const avgScore = total > 0 ? Math.round(totalScore / total) : 0;
  const selectionRate = total > 0 ? Math.round((selected / total) * 100) : 0;

  const elTotal = document.getElementById('metric-total');
  if (elTotal) elTotal.textContent = total;

  const elSelected = document.getElementById('metric-selected');
  if (elSelected) elSelected.textContent = selected;

  const elRate = document.getElementById('metric-selection-rate');
  if (elRate) elRate.textContent = `${selectionRate}% Rate`;

  const elAvg = document.getElementById('metric-avg-score');
  if (elAvg) elAvg.textContent = avgScore;

  const elInterviews = document.getElementById('metric-interviews');
  if (elInterviews) elInterviews.textContent = interviewScheduled;

  const elRejected = document.getElementById('metric-rejected');
  if (elRejected) elRejected.textContent = rejected;

  // Funnel Data
  renderFunnel({
    total,
    selected,
    interviewScheduled,
    offerExtended,
    rejected
  });

  // Top Skills
  const skillCounts = {};
  candidates.forEach(c => {
    (c.topSkills || []).forEach(s => {
      const trimmed = (s || '').trim();
      if (trimmed) skillCounts[trimmed] = (skillCounts[trimmed] || 0) + 1;
    });
  });
  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));
  renderSkillsCloud(topSkills);

  // Role Breakdown
  const roleMap = {};
  candidates.forEach(c => {
    const r = c.role || 'Unspecified';
    roleMap[r] = (roleMap[r] || 0) + 1;
  });
  renderRoleBreakdown(roleMap);
}

// Load KPI Stats from Backend
async function loadStats() {
  try {
    const res = await fetch('/api/analytics', { cache: 'no-store' });
    const data = await res.json();
    if (data.success) {
      const elTotal = document.getElementById('metric-total');
      if (elTotal) elTotal.textContent = data.total;

      const elSelected = document.getElementById('metric-selected');
      if (elSelected) elSelected.textContent = data.selected;

      const elRate = document.getElementById('metric-selection-rate');
      if (elRate) elRate.textContent = `${data.selectionRate}% Rate`;

      const elAvg = document.getElementById('metric-avg-score');
      if (elAvg) elAvg.textContent = data.avgScore;

      const elInterviews = document.getElementById('metric-interviews');
      if (elInterviews) elInterviews.textContent = data.interviewScheduled;

      const elRejected = document.getElementById('metric-rejected');
      if (elRejected) elRejected.textContent = data.rejected;

      renderFunnel(data);
      renderSkillsCloud(data.topSkills || []);
      renderRoleBreakdown(data.roleDistribution || {});
    }
  } catch (e) {
    console.warn('API Analytics fallback, using local candidates');
    updateMetrics(allCandidates);
  }
}

function renderFunnel(stats) {
  const container = document.getElementById('funnel-container');
  if (!container) return;
  const total = stats.total || 1;

  const items = [
    { label: 'Total Applications Received', count: stats.total || 0, color: '#6366f1' },
    { label: 'AI Selected (Score ≥ 70%)', count: stats.selected || 0, color: '#10b981' },
    { label: 'Interviews Scheduled', count: stats.interviewScheduled || 0, color: '#ec4899' },
    { label: 'Offer Extended / Hired', count: stats.offerExtended || 0, color: '#8b5cf6' },
    { label: 'Constructively Rejected', count: stats.rejected || 0, color: '#ef4444' }
  ];

  container.innerHTML = items.map(item => {
    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
    return `
      <div class="funnel-bar-item">
        <div class="funnel-bar-meta">
          <span>${item.label}</span>
          <span><strong>${item.count}</strong> (${pct}%)</span>
        </div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width: ${Math.max(pct, 2)}%; background: ${item.color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSkillsCloud(skills) {
  const container = document.getElementById('skills-cloud-container');
  if (!container) return;
  if (!skills || skills.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">No skill data available yet.</p>`;
    return;
  }
  container.innerHTML = skills.map(s => `
    <span class="skill-tag-badge">
      ${escapeHtml(s.skill)}
      <span class="skill-count-chip">${s.count}</span>
    </span>
  `).join('');
}

function renderRoleBreakdown(roleDist) {
  const container = document.getElementById('roles-breakdown-container');
  if (!container) return;
  const entries = Object.entries(roleDist || {});
  if (entries.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">No roles data available yet.</p>`;
    return;
  }
  container.innerHTML = entries.map(([role, count]) => `
    <div class="role-stat-item">
      <strong>${escapeHtml(role)}</strong>
      <span class="role-stat-badge">${count} applicants</span>
    </div>
  `).join('');
}

// Render Email Logs Tab
function renderEmailLogs() {
  const container = document.getElementById('email-logs-container');
  if (!container) return;
  const list = allCandidates.filter(c => c.emailBody);
  if (list.length === 0) {
    container.innerHTML = `<div class="info-card"><p>No email logs found yet. Resumes evaluated will record sent emails here.</p></div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const isSelected = c.decision === 'SELECTED';
    const sentDate = c.emailSentAt ? new Date(c.emailSentAt).toLocaleString() : 'Recently';
    return `
      <div class="email-log-item">
        <div class="email-log-header">
          <div class="email-recipient">
            To: <strong>${escapeHtml(c.name)}</strong> &lt;${escapeHtml(c.email)}&gt;
            <span class="badge-decision ${isSelected ? 'selected' : 'rejected'}" style="margin-left:8px;">
              ${isSelected ? 'Interview Invitation' : 'Rejection Letter'}
            </span>
          </div>
          <span class="email-date">${sentDate}</span>
        </div>
        <div class="email-subject-line"><strong>Subject:</strong> ${escapeHtml(c.emailSubject || 'Update on your application')}</div>
        <div class="email-body-snippet">${escapeHtml(c.emailBody)}</div>
      </div>
    `;
  }).join('');
}

// Dropzone & File Upload Logic
let selectedFile = null;
function initDropzone() {
  const dropzone = document.getElementById('resume-dropzone');
  const fileInput = document.getElementById('resume-file-input');
  const pill = document.getElementById('file-selected-pill');
  const fileNameDisplay = document.getElementById('selected-file-name');
  const removeBtn = document.getElementById('btn-remove-file');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !removeBtn?.contains(e.target)) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      fileInput.value = '';
      if (pill) pill.style.display = 'none';
      const title = document.getElementById('dropzone-title');
      if (title) title.textContent = 'Drag & drop candidate resume here';
    });
  }

  function handleFileSelected(file) {
    selectedFile = file;
    if (fileNameDisplay) fileNameDisplay.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    if (pill) pill.style.display = 'inline-flex';
    const title = document.getElementById('dropzone-title');
    if (title) title.textContent = 'File attached:';
  }
}

// Scanner Form & Samples
function initScanner() {
  const roleSelect = document.getElementById('scan-applied-role');
  const customRoleGroup = document.getElementById('custom-role-group');

  if (roleSelect && customRoleGroup) {
    roleSelect.addEventListener('change', () => {
      customRoleGroup.style.display = roleSelect.value === 'Custom Role' ? 'block' : 'none';
    });
  }

  const btnSampleStrong = document.getElementById('btn-load-sample-resume');
  if (btnSampleStrong) {
    btnSampleStrong.addEventListener('click', () => {
      document.getElementById('scan-candidate-name').value = 'Marcus Sterling';
      document.getElementById('scan-candidate-email').value = 'marcus.sterling.lead@gmail.com';
      if (roleSelect) roleSelect.value = 'Full Stack Developer';
      if (customRoleGroup) customRoleGroup.style.display = 'none';
      document.getElementById('scan-resume-text').value = SAMPLE_STRONG_RESUME;
      showToast('Loaded sample Full Stack Developer resume!', 'info');
    });
  }

  const btnSampleMarketing = document.getElementById('btn-load-sample-marketing');
  if (btnSampleMarketing) {
    btnSampleMarketing.addEventListener('click', () => {
      document.getElementById('scan-candidate-name').value = 'Sneha Verma';
      document.getElementById('scan-candidate-email').value = 'sneha.verma.marketing@gmail.com';
      if (roleSelect) roleSelect.value = 'Digital Marketing Specialist';
      if (customRoleGroup) customRoleGroup.style.display = 'none';
      document.getElementById('scan-resume-text').value = SAMPLE_MARKETING_RESUME;
      showToast('Loaded sample Digital Marketing Specialist resume!', 'info');
    });
  }

  const btnSampleMismatch = document.getElementById('btn-load-sample-reject');
  if (btnSampleMismatch) {
    btnSampleMismatch.addEventListener('click', () => {
      document.getElementById('scan-candidate-name').value = 'Toby Flenderson';
      document.getElementById('scan-candidate-email').value = 'toby.flenderson.sales@yahoo.com';
      if (roleSelect) roleSelect.value = 'Full Stack Developer';
      if (customRoleGroup) customRoleGroup.style.display = 'none';
      document.getElementById('scan-resume-text').value = SAMPLE_MISMATCH_RESUME;
      showToast('Loaded sample mismatch resume!', 'info');
    });
  }

  // Submit scan
  const form = document.getElementById('scanner-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-run-evaluation');
      const btnText = btn?.querySelector('.btn-text');

      const candidateName = document.getElementById('scan-candidate-name')?.value || '';
      const candidateEmail = document.getElementById('scan-candidate-email')?.value || '';
      let appliedRole = roleSelect ? roleSelect.value : 'Full Stack Developer';
      if (appliedRole === 'Custom Role') {
        appliedRole = document.getElementById('scan-custom-role')?.value || 'Custom Role';
      }
      const resumeText = document.getElementById('scan-resume-text')?.value || '';

      if (!selectedFile && !resumeText.trim()) {
        showToast('Please attach a resume document or paste resume text.', 'error');
        return;
      }

      // Set loading state
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = '✨ Gemini AI Analyzing Resume...';

      const formData = new FormData();
      formData.append('candidateName', candidateName);
      formData.append('candidateEmail', candidateEmail);
      formData.append('appliedRole', appliedRole);
      formData.append('resumeText', resumeText);
      formData.append('resumeTextInput', resumeText);
      if (selectedFile) {
        formData.append('resume', selectedFile);
        formData.append('resumeFile', selectedFile);
      }

      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.candidate) {
          showToast(`AI Evaluation Complete! Decision: ${data.candidate.decision} (${data.candidate.matchScore}%)`, 'success');
          // Reset form
          form.reset();
          selectedFile = null;
          const pill = document.getElementById('file-selected-pill');
          if (pill) pill.style.display = 'none';

          // Reload data and switch to pipeline
          await loadCandidates();
          await loadStats();
          switchTab('pipeline');
          // Open modal for this candidate
          openCandidateModal(data.candidate);
        } else {
          showToast(`Scan failed: ${data.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = '🚀 Run AI Evaluation & Auto-Process';
      }
    });
  }

  // Test trigger n8n sample button
  const btnN8n = document.getElementById('btn-trigger-n8n-sample');
  if (btnN8n) {
    btnN8n.addEventListener('click', async () => {
      try {
        showToast('Triggering n8n webhook on localhost:5678...', 'info');
        const res = await fetch('/api/test-n8n', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(`n8n Webhook executed successfully!`, 'success');
          loadCandidates();
          loadStats();
        } else {
          showToast(`n8n notice: ${data.error || data.message}`, 'info');
        }
      } catch (err) {
        showToast(`Could not connect to n8n: ${err.message}`, 'error');
      }
    });
  }
}

// Modal Logic
function initModal() {
  const modal = document.getElementById('candidate-modal');
  const closeBtn = document.getElementById('btn-close-modal');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Copy Google Meet link
  const copyMeetBtn = document.getElementById('btn-copy-meet-link');
  if (copyMeetBtn) {
    copyMeetBtn.addEventListener('click', () => {
      const link = document.getElementById('modal-meeting-link')?.value;
      if (!link) {
        showToast('No meeting link available', 'warning');
        return;
      }
      navigator.clipboard.writeText(link).then(() => {
        showToast('Google Meet link copied to clipboard: ' + link, 'success');
      });
    });
  }

  // Open Meet Link
  const openMeetBtn = document.getElementById('btn-open-meet');
  if (openMeetBtn) {
    openMeetBtn.addEventListener('click', () => {
      const link = document.getElementById('modal-meeting-link')?.value;
      if (link && link.startsWith('http')) {
        window.open(link, '_blank');
      } else {
        showToast('Please enter a valid meeting URL (e.g. https://meet.google.com/...)', 'warning');
      }
    });
  }

  // Generate New Meet Link
  const genMeetBtn = document.getElementById('btn-generate-meet');
  if (genMeetBtn) {
    genMeetBtn.addEventListener('click', () => {
      const rand1 = Math.random().toString(36).substring(2, 5);
      const rand2 = Math.random().toString(36).substring(2, 6);
      const rand3 = Math.random().toString(36).substring(2, 5);
      const newLink = `https://meet.google.com/${rand1}-${rand2}-${rand3}`;
      const input = document.getElementById('modal-meeting-link');
      if (input) input.value = newLink;
      showToast('Generated new Google Meet link: ' + newLink, 'info');
    });
  }

  // Copy interview questions
  const copyBtn = document.getElementById('btn-copy-questions');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!selectedCandidate || !selectedCandidate.interviewQuestions) return;
      const text = selectedCandidate.interviewQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('Interview questions copied to clipboard!', 'success');
      });
    });
  }

  // Dynamic Hiring Box Visibility on Status Change
  const updateStatusSelect = document.getElementById('modal-update-status');
  const hiringBox = document.getElementById('modal-hiring-box');
  if (updateStatusSelect && hiringBox) {
    updateStatusSelect.addEventListener('change', () => {
      const val = updateStatusSelect.value;
      if (val === 'HIRED' || val === 'OFFER_EXTENDED') {
        hiringBox.style.display = 'block';
      } else {
        hiringBox.style.display = 'none';
      }
    });
  }

  // Dispatch / Resend Interview Invitation Email with Google Meet Link
  const dispatchInviteBtn = document.getElementById('btn-dispatch-interview-invite');
  if (dispatchInviteBtn) {
    dispatchInviteBtn.addEventListener('click', async () => {
      if (!selectedCandidate) return;
      
      const interviewDate = document.getElementById('modal-interview-date')?.value;
      const interviewTime = document.getElementById('modal-interview-time')?.value;
      const meetingLink = document.getElementById('modal-meeting-link')?.value;
      const interviewRound = document.getElementById('modal-interview-round')?.value;
      const interviewerName = document.getElementById('modal-interviewer')?.value;

      dispatchInviteBtn.disabled = true;
      dispatchInviteBtn.textContent = '⏳ Dispatching Interview Invitation...';

      try {
        const res = await fetch(`/api/candidates/${selectedCandidate.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'INTERVIEW_SCHEDULED',
            interviewDate,
            interviewTime,
            meetingLink,
            interviewRound,
            interviewerName,
            sendUpdateEmail: true
          })
        });

        const data = await res.json();
        if (data.success && data.candidate) {
          selectedCandidate = data.candidate;
          const idx = allCandidates.findIndex(c => c.id === selectedCandidate.id);
          if (idx !== -1) allCandidates[idx] = selectedCandidate;

          showToast(`Interview invitation with Google Meet link dispatched to ${selectedCandidate.email}!`, 'success');
          
          const modalStatus = document.getElementById('modal-status');
          if (modalStatus) modalStatus.textContent = 'INTERVIEW_SCHEDULED';

          updateMetrics(allCandidates);
          applyFilters();
        } else {
          showToast(data.error || 'Failed to dispatch interview email', 'error');
        }
      } catch (err) {
        showToast('Error dispatching invitation: ' + err.message, 'error');
      } finally {
        dispatchInviteBtn.disabled = false;
        dispatchInviteBtn.textContent = '✉️ Send / Resend Interview Invitation Email with Google Meet Link';
      }
    });
  }

  // Save full candidate status update
  const saveStatusBtn = document.getElementById('btn-save-candidate-status');
  if (saveStatusBtn) {
    saveStatusBtn.addEventListener('click', async () => {
      if (!selectedCandidate) return;
      
      const newStatus = document.getElementById('modal-update-status')?.value;
      const newRole = document.getElementById('modal-update-role')?.value;
      const interviewDate = document.getElementById('modal-interview-date')?.value;
      const interviewTime = document.getElementById('modal-interview-time')?.value;
      const meetingLink = document.getElementById('modal-meeting-link')?.value;
      const interviewRound = document.getElementById('modal-interview-round')?.value;
      const interviewerName = document.getElementById('modal-interviewer')?.value;
      const joiningDate = document.getElementById('modal-joining-date')?.value;
      const salaryOffer = document.getElementById('modal-salary-offer')?.value;
      const hrNotes = document.getElementById('modal-hr-notes')?.value;

      saveStatusBtn.disabled = true;
      saveStatusBtn.textContent = '⏳ Saving & Processing Automation...';

      try {
        const res = await fetch(`/api/candidates/${selectedCandidate.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            role: newRole,
            interviewDate,
            interviewTime,
            meetingLink,
            interviewRound,
            interviewerName,
            joiningDate,
            salaryOffer,
            hrNotes
          })
        });

        const data = await res.json();
        if (data.success && data.candidate) {
          selectedCandidate = data.candidate;
          const idx = allCandidates.findIndex(c => c.id === selectedCandidate.id);
          if (idx !== -1) allCandidates[idx] = selectedCandidate;

          if (newStatus === 'HIRED') {
            showToast(`🎉 SUCCESS: Candidate HIRED! Formal Offer Letter dispatched automatically to ${selectedCandidate.email}!`, 'success');
          } else {
            showToast(data.message || 'Candidate updated successfully!', 'success');
          }

          const modalStatus = document.getElementById('modal-status');
          if (modalStatus) {
            modalStatus.textContent = newStatus;
            modalStatus.className = `status-badge status-${newStatus.toLowerCase()}`;
          }

          const modalRole = document.getElementById('modal-role-meta');
          if (modalRole) {
            modalRole.textContent = `${selectedCandidate.role} • ${selectedCandidate.email} • ${selectedCandidate.phone || 'No phone'}`;
          }

          updateMetrics(allCandidates);
          applyFilters();
        } else {
          showToast(data.error || 'Failed to update candidate', 'error');
        }
      } catch (err) {
        showToast(`Update error: ${err.message}`, 'error');
      } finally {
        saveStatusBtn.disabled = false;
        saveStatusBtn.textContent = '💾 Save Changes & Update Candidate Status';
      }
    });
  }

  // Resend email
  const resendEmailBtn = document.getElementById('btn-resend-email');
  if (resendEmailBtn) {
    resendEmailBtn.addEventListener('click', async () => {
      if (!selectedCandidate) return;
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId: selectedCandidate.id,
            toEmail: selectedCandidate.email,
            subject: selectedCandidate.emailSubject,
            body: selectedCandidate.emailBody
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Live email dispatched to ' + selectedCandidate.email, 'success');
        } else {
          showToast('Email dispatch error: ' + (data.error || 'Failed'), 'error');
        }
      } catch (err) {
        showToast('Email error: ' + err.message, 'error');
      }
    });
  }
}

function openCandidateModal(cand) {
  selectedCandidate = cand;
  const isSelected = cand.decision === 'SELECTED';
  const isHired = cand.status === 'HIRED' || cand.status === 'OFFER_EXTENDED';
  const initials = (cand.name || 'Candidate').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'CD';

  const elAvatar = document.getElementById('modal-avatar');
  if (elAvatar) elAvatar.textContent = initials;

  const elName = document.getElementById('modal-name');
  if (elName) elName.textContent = cand.name;

  const elRoleMeta = document.getElementById('modal-role-meta');
  if (elRoleMeta) elRoleMeta.textContent = `${cand.role} • ${cand.email} • ${cand.phone || 'No phone'}`;

  const decisionBadge = document.getElementById('modal-decision');
  if (decisionBadge) {
    decisionBadge.textContent = isSelected ? '✓ SELECTED' : '✕ REJECTED';
    decisionBadge.className = `decision-badge ${isSelected ? 'selected' : 'rejected'}`;
  }

  const statusBadge = document.getElementById('modal-status');
  if (statusBadge) {
    statusBadge.textContent = formatStatus(cand.status || 'APPLICATION_RECEIVED');
    statusBadge.className = `status-badge status-${(cand.status || 'new').toLowerCase()}`;
  }

  // Score circle
  const scoreCircle = document.getElementById('modal-score-circle');
  if (scoreCircle) {
    scoreCircle.className = `score-circle ${isSelected ? 'selected' : 'rejected'}`;
    const elScoreNum = document.getElementById('modal-score-num');
    if (elScoreNum) elScoreNum.textContent = cand.matchScore;
  }

  const elExp = document.getElementById('modal-exp');
  if (elExp) elExp.textContent = cand.yearsOfExperience || 'N/A';

  const elEdu = document.getElementById('modal-edu');
  if (elEdu) elEdu.textContent = cand.education || 'N/A';

  const elSource = document.getElementById('modal-source');
  if (elSource) elSource.textContent = cand.source || 'Direct Submission';

  const elSummary = document.getElementById('modal-evaluation-summary');
  if (elSummary) elSummary.textContent = cand.evaluationSummary || 'No summary available.';

  // Strengths
  const strengthsUl = document.getElementById('modal-strengths-list');
  if (strengthsUl) {
    strengthsUl.innerHTML = (cand.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>Standard qualifications.</li>';
  }

  // Improvements
  const improvementsUl = document.getElementById('modal-improvements-list');
  if (improvementsUl) {
    improvementsUl.innerHTML = (cand.areasForImprovement || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>None noted.</li>';
  }

  // Skills
  const skillsTags = document.getElementById('modal-skills-tags');
  if (skillsTags) {
    skillsTags.innerHTML = (cand.topSkills || []).map(s => `<span>${escapeHtml(s)}</span>`).join('') || '<span>General Skills</span>';
  }

  // Interview Schedule & Google Meet Fields
  const interviewDateInput = document.getElementById('modal-interview-date');
  if (interviewDateInput) {
    interviewDateInput.value = cand.interviewDate || cand.proposedInterviewDate || 'Thursday, September 3, 2026';
  }

  const interviewTimeInput = document.getElementById('modal-interview-time');
  if (interviewTimeInput) {
    interviewTimeInput.value = cand.interviewTime || '2:30 PM - 3:15 PM IST (45 Mins)';
  }

  const meetingLinkInput = document.getElementById('modal-meeting-link');
  if (meetingLinkInput) {
    meetingLinkInput.value = cand.meetingLink || `https://meet.google.com/nex-${(cand.id || 'abc').substring(5, 9)}-meet`;
  }

  const interviewRoundInput = document.getElementById('modal-interview-round');
  if (interviewRoundInput) {
    interviewRoundInput.value = cand.interviewRound || (cand.role === 'Digital Marketing Specialist' 
      ? 'Round 1: Marketing Strategy & Campaign Review' 
      : 'Round 1: Technical & System Architecture');
  }

  const interviewerInput = document.getElementById('modal-interviewer');
  if (interviewerInput) {
    interviewerInput.value = cand.interviewerName || 'Tech Innovations Hiring Panel';
  }

  // Questions
  const questionsOl = document.getElementById('modal-interview-questions');
  if (questionsOl) {
    if (cand.interviewQuestions && cand.interviewQuestions.length > 0) {
      questionsOl.innerHTML = cand.interviewQuestions.map(q => `<li>${escapeHtml(q)}</li>`).join('');
    } else {
      questionsOl.innerHTML = `<li>No interview questions generated (Candidate marked as ${cand.decision}).</li>`;
    }
  }

  // Status & Role Form Fields
  const updateStatusSelect = document.getElementById('modal-update-status');
  if (updateStatusSelect) updateStatusSelect.value = cand.status || 'INTERVIEW_SCHEDULED';

  const updateRoleSelect = document.getElementById('modal-update-role');
  if (updateRoleSelect) updateRoleSelect.value = cand.role || 'Full Stack Developer';

  // Hiring Offer Fields
  const hiringBox = document.getElementById('modal-hiring-box');
  if (hiringBox) {
    hiringBox.style.display = isHired ? 'block' : 'none';
  }

  const joiningDateInput = document.getElementById('modal-joining-date');
  if (joiningDateInput) joiningDateInput.value = cand.joiningDate || 'Within 2-4 weeks';

  const salaryOfferInput = document.getElementById('modal-salary-offer');
  if (salaryOfferInput) salaryOfferInput.value = cand.salaryOffer || 'Competitive Market Rate';

  const hrNotesInput = document.getElementById('modal-hr-notes');
  if (hrNotesInput) hrNotesInput.value = cand.hrNotes || '';

  // Email Preview
  const emailSubj = document.getElementById('modal-email-subject');
  if (emailSubj) emailSubj.textContent = cand.emailSubject || 'N/A';

  const emailBody = document.getElementById('modal-email-body');
  if (emailBody) emailBody.textContent = cand.emailBody || 'No email generated.';

  const modal = document.getElementById('candidate-modal');
  if (modal) modal.style.display = 'flex';
}

// Settings Logic
function initSettings() {
  const slider = document.getElementById('setting-threshold');
  const label = document.getElementById('threshold-val-label');
  if (slider && label) {
    slider.addEventListener('input', () => {
      label.textContent = `${slider.value}%`;
    });
  }

  const form = document.getElementById('settings-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hrEmail = document.getElementById('setting-hr-email')?.value || '';
      const gmailAppPassword = document.getElementById('setting-app-password')?.value || '';
      const geminiApiKey = document.getElementById('setting-gemini-key')?.value || '';
      const selectionScoreThreshold = slider ? slider.value : 70;
      const autoSendEmails = document.getElementById('setting-auto-email')?.checked || false;
      const companyName = document.getElementById('setting-company-name')?.value || '';

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hrEmail,
            gmailAppPassword,
            geminiApiKey,
            selectionScoreThreshold,
            autoSendEmails,
            companyName
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Settings & Credentials saved successfully!', 'success');
          const headerEmail = document.getElementById('header-email-label');
          if (headerEmail) headerEmail.textContent = hrEmail;
          const bannerEmail = document.getElementById('banner-inbox-email');
          if (bannerEmail) bannerEmail.textContent = hrEmail;
        }
      } catch (err) {
        showToast('Failed to save settings: ' + err.message, 'error');
      }
    });
  }

  const openN8nBtn = document.getElementById('btn-open-n8n-editor');
  if (openN8nBtn) {
    openN8nBtn.addEventListener('click', () => {
      window.open('http://localhost:5678', '_blank');
    });
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.config) {
      currentSettings = data.config;
      const hrEmailInput = document.getElementById('setting-hr-email');
      if (hrEmailInput) hrEmailInput.value = currentSettings.hrEmail || '';

      const headerEmail = document.getElementById('header-email-label');
      if (headerEmail) headerEmail.textContent = currentSettings.hrEmail || 'manasvipaliwal317@gmail.com';

      const bannerEmail = document.getElementById('banner-inbox-email');
      if (bannerEmail) bannerEmail.textContent = currentSettings.hrEmail || 'manasvipaliwal317@gmail.com';

      const slider = document.getElementById('setting-threshold');
      if (slider) slider.value = currentSettings.selectionScoreThreshold || 70;

      const label = document.getElementById('threshold-val-label');
      if (label) label.textContent = `${currentSettings.selectionScoreThreshold || 70}%`;

      const autoEmailCheck = document.getElementById('setting-auto-email');
      if (autoEmailCheck) autoEmailCheck.checked = !!currentSettings.autoSendEmails;

      const companyInput = document.getElementById('setting-company-name');
      if (companyInput) companyInput.value = currentSettings.companyName || '';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Helpers
function formatStatus(status) {
  if (!status) return 'New';
  return status.replace(/_/g, ' ');
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

// ----------------- JOB ROLES & ACTIVE OPENINGS MANAGER ----------------- //
function initJobRoles() {
  // Add Modal Elements
  const btnOpenAddModal = document.getElementById('btn-open-add-role-modal');
  const addModal = document.getElementById('add-role-modal');
  const btnCloseAddModal = document.getElementById('btn-close-add-role-modal');
  const btnCancelAdd = document.getElementById('btn-cancel-add-role');
  const formAddRole = document.getElementById('form-add-role');

  // Edit Modal Elements
  const editModal = document.getElementById('edit-role-modal');
  const btnCloseEditModal = document.getElementById('btn-close-edit-role-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit-role');
  const formEditRole = document.getElementById('form-edit-role');

  if (btnOpenAddModal && addModal) {
    btnOpenAddModal.addEventListener('click', () => {
      if (formAddRole) formAddRole.reset();
      addModal.style.display = 'flex';
      setTimeout(() => document.getElementById('new-role-title')?.focus(), 50);
    });
  }

  const closeAddModal = () => {
    if (addModal) addModal.style.display = 'none';
  };

  const closeEditModal = () => {
    if (editModal) editModal.style.display = 'none';
  };

  if (btnCloseAddModal) btnCloseAddModal.addEventListener('click', closeAddModal);
  if (btnCancelAdd) btnCancelAdd.addEventListener('click', closeAddModal);
  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) closeAddModal();
    });
  }

  if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditModal);
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });
  }

  // Create New Role Form
  if (formAddRole) {
    formAddRole.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('new-role-title')?.value || '';
      const department = document.getElementById('new-role-dept')?.value || '';
      const minExperience = document.getElementById('new-role-exp')?.value || '';
      const skillsStr = document.getElementById('new-role-skills')?.value || '';
      const description = document.getElementById('new-role-desc')?.value || '';
      const isActive = document.getElementById('new-role-is-active')?.checked || false;

      const requiredSkills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

      try {
        const res = await fetch('/api/job-roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            department,
            minExperience,
            requiredSkills,
            description,
            isActive
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(`Job role "${title}" created successfully!`, 'success');
          closeAddModal();
          formAddRole.reset();
          await loadJobRoles();
        } else {
          showToast(data.error || 'Failed to create job role', 'error');
        }
      } catch (err) {
        showToast('Error creating role: ' + err.message, 'error');
      }
    });
  }

  // Edit Existing Role Form
  if (formEditRole) {
    formEditRole.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roleId = document.getElementById('edit-role-id')?.value || '';
      const title = document.getElementById('edit-role-title')?.value || '';
      const department = document.getElementById('edit-role-dept')?.value || '';
      const minExperience = document.getElementById('edit-role-exp')?.value || '';
      const skillsStr = document.getElementById('edit-role-skills')?.value || '';
      const description = document.getElementById('edit-role-desc')?.value || '';
      const isActive = document.getElementById('edit-role-is-active')?.checked || false;

      const requiredSkills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

      try {
        const res = await fetch(`/api/job-roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            department,
            minExperience,
            requiredSkills,
            description,
            isActive
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(`Job opening "${title}" updated successfully!`, 'success');
          closeEditModal();
          await loadJobRoles();
        } else {
          showToast(data.error || 'Failed to update job role', 'error');
        }
      } catch (err) {
        showToast('Error updating role: ' + err.message, 'error');
      }
    });
  }
}

function openEditRoleModal(roleId) {
  const role = allJobRoles.find(r => r.id === roleId);
  if (!role) {
    showToast('Role not found', 'error');
    return;
  }

  const editModal = document.getElementById('edit-role-modal');
  if (!editModal) return;

  const idInput = document.getElementById('edit-role-id');
  const titleInput = document.getElementById('edit-role-title');
  const deptInput = document.getElementById('edit-role-dept');
  const expInput = document.getElementById('edit-role-exp');
  const skillsInput = document.getElementById('edit-role-skills');
  const descInput = document.getElementById('edit-role-desc');
  const activeInput = document.getElementById('edit-role-is-active');

  if (idInput) idInput.value = role.id;
  if (titleInput) titleInput.value = role.title || '';
  if (deptInput) deptInput.value = role.department || '';
  if (expInput) expInput.value = role.minExperience || '';
  if (skillsInput) skillsInput.value = (role.requiredSkills || []).join(', ');
  if (descInput) descInput.value = role.description || '';
  if (activeInput) activeInput.checked = !!role.isActive;

  editModal.style.display = 'flex';
  setTimeout(() => titleInput?.focus(), 50);
}

async function loadJobRoles() {
  try {
    const res = await fetch('/api/job-roles');
    const data = await res.json();
    if (data.success && Array.isArray(data.roles)) {
      allJobRoles = data.roles;
      renderJobRolesManager();
      updateActiveOpeningsBadge();
      populateScannerAndFilterRoles();
    }
  } catch (err) {
    console.error('Failed to load job roles:', err);
  }
}

function updateActiveOpeningsBadge() {
  const activeRoles = allJobRoles.filter(r => r.isActive);
  const count = activeRoles.length;
  const badgeText = document.getElementById('header-active-roles-text');
  if (badgeText) {
    badgeText.textContent = `${count} Active Role${count === 1 ? '' : 's'}`;
  }
}

function renderJobRolesManager() {
  const container = document.getElementById('roles-manager-list');
  if (!container) return;

  if (allJobRoles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-secondary);">No job roles defined. Click "Add New Job Role" above to create one.</p>`;
    return;
  }

  container.innerHTML = allJobRoles.map(r => {
    const isCustom = r.id && r.id.startsWith('role_custom_');
    const skillsHtml = (r.requiredSkills || []).slice(0, 6).map(s => `<span class="role-skill-chip">${escapeHtml(s)}</span>`).join('');
    
    return `
      <div class="role-item-card ${r.isActive ? 'is-active' : ''}">
        <div>
          <div class="role-item-top">
            <div>
              <h4 class="role-item-title">${escapeHtml(r.title)}</h4>
              <span class="role-dept-tag">${escapeHtml(r.department || 'General')} • ${escapeHtml(r.minExperience || '1+ Yrs')}</span>
            </div>
            <div class="role-actions-group">
              <button class="btn-edit-role" onclick="openEditRoleModal('${r.id}')" title="Edit role requirements, skills, and experience">
                ✏️ Edit
              </button>
              ${isCustom ? `
                <button class="btn-delete-role" onclick="deleteCustomRole('${r.id}')" title="Delete custom role">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>

          <p class="role-item-desc">${escapeHtml(r.description || 'Target position for candidate analysis and evaluation.')}</p>

          <div class="role-skills-pill-row">
            ${skillsHtml}
          </div>
        </div>

        <div class="role-item-bottom">
          <label class="switch-label ${r.isActive ? 'active-label' : 'inactive-label'}">
            <span class="ios-switch">
              <input type="checkbox" ${r.isActive ? 'checked' : ''} onchange="toggleRoleActive('${r.id}', this.checked)">
              <span class="switch-slider"></span>
            </span>
            <span>${r.isActive ? '🟢 ACTIVE OPENING' : '⚪ INACTIVE (PAUSED)'}</span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

async function toggleRoleActive(roleId, isChecked) {
  const role = allJobRoles.find(r => r.id === roleId);
  if (role) role.isActive = isChecked;

  const activeRoleIds = allJobRoles.filter(r => r.isActive).map(r => r.id);

  try {
    const res = await fetch('/api/job-roles/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeRoleIds })
    });
    const data = await res.json();
    if (data.success) {
      const activeTitles = allJobRoles.filter(r => r.isActive).map(r => r.title);
      showToast(`Hiring openings updated! (${activeTitles.length} active roles)`, 'success');
      renderJobRolesManager();
      updateActiveOpeningsBadge();
      populateScannerAndFilterRoles();
    }
  } catch (err) {
    showToast('Failed to update active roles: ' + err.message, 'error');
  }
}

async function deleteCustomRole(roleId) {
  if (!confirm('Are you sure you want to delete this custom job role?')) return;

  try {
    const res = await fetch(`/api/job-roles/${roleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Role deleted', 'info');
      loadJobRoles();
    }
  } catch (err) {
    showToast('Failed to delete role: ' + err.message, 'error');
  }
}

function populateScannerAndFilterRoles() {
  const activeRoles = allJobRoles.filter(r => r.isActive);
  
  // 1. Scanner dropdown
  const scanRoleSelect = document.getElementById('scan-applied-role');
  if (scanRoleSelect) {
    const currentScanVal = scanRoleSelect.value;
    let html = `<option value="">🤖 Auto-Detect Best Matching Active Opening</option>`;
    if (activeRoles.length > 0) {
      html += `<optgroup label="Active Company Openings (${activeRoles.length})">`;
      activeRoles.forEach(r => {
        html += `<option value="${escapeHtml(r.title)}" ${r.title === currentScanVal ? 'selected' : ''}>${escapeHtml(r.title)} (${escapeHtml(r.department)})</option>`;
      });
      html += `</optgroup>`;
    }
    scanRoleSelect.innerHTML = html;
  }

  // 2. Filter dropdown in pipeline
  const filterRoleSelect = document.getElementById('filter-role');
  if (filterRoleSelect) {
    const currentFilterVal = filterRoleSelect.value;
    let html = `<option value="ALL">All Roles</option>`;
    const allTitles = Array.from(new Set(allJobRoles.map(r => r.title))).sort();
    allTitles.forEach(t => {
      html += `<option value="${escapeHtml(t)}" ${t === currentFilterVal ? 'selected' : ''}>${escapeHtml(t)}</option>`;
    });
    filterRoleSelect.innerHTML = html;
  }

  // 3. Modal candidate editor role dropdown
  const modalRoleSelect = document.getElementById('modal-update-role');
  if (modalRoleSelect) {
    const currentModalVal = modalRoleSelect.value;
    let html = '';
    allJobRoles.forEach(r => {
      html += `<option value="${escapeHtml(r.title)}" ${r.title === currentModalVal ? 'selected' : ''}>${escapeHtml(r.title)}</option>`;
    });
    modalRoleSelect.innerHTML = html;
  }
}

// Attach globally for inline event handlers
window.openEditRoleModal = openEditRoleModal;
window.toggleRoleActive = toggleRoleActive;
window.deleteCustomRole = deleteCustomRole;

