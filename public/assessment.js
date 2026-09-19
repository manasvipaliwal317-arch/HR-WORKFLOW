/**
 * AI-PROCTORED TECHNICAL ASSESSMENT PORTAL ENGINE
 * Tech Innovations Inc. | Nexus Recruitment Automation
 */

(function() {
  'use strict';

  // State
  let candidate = null;
  let questions = [];
  let currentIndex = 0;
  let answers = {}; // { 0: 2, 1: 0, ... }
  let flagged = {}; // { 0: true, ... }
  let totalTimeSeconds = 30 * 60; // 30 minutes (1800s)
  let timeRemaining = totalTimeSeconds;
  let timerInterval = null;
  let isTestActive = false;
  let isSubmitting = false;
  let cheatViolations = 0;
  const MAX_CHEAT_VIOLATIONS = 3;

  // DOM Elements
  const cheatWarningModal = document.getElementById('cheatWarningModal');
  const cheatCountDisplay = document.getElementById('cheatCountDisplay');
  const resumeTestBtn = document.getElementById('resumeTestBtn');

  const overviewModal = document.getElementById('overviewModal');
  const closeOverviewBtn = document.getElementById('closeOverviewBtn');
  const backToExamBtn = document.getElementById('backToExamBtn');
  const overviewSubmitBtn = document.getElementById('overviewSubmitBtn');
  const openOverviewBtn = document.getElementById('openOverviewBtn');

  const submitConfirmModal = document.getElementById('submitConfirmModal');
  const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
  const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');
  const openSubmitBtn = document.getElementById('openSubmitBtn');
  const submitConfirmSummary = document.getElementById('submitConfirmSummary');
  const submitWarningBox = document.getElementById('submitWarningBox');

  const startScreen = document.getElementById('startScreen');
  const beginTestBtn = document.getElementById('beginTestBtn');
  const activeTestPanel = document.getElementById('activeTestPanel');
  const bottomActionBar = document.getElementById('bottomActionBar');
  const resultScreen = document.getElementById('resultScreen');

  const candidateAvatar = document.getElementById('candidateAvatar');
  const candidateName = document.getElementById('candidateName');
  const candidateRole = document.getElementById('candidateRole');
  const startCandidateName = document.getElementById('startCandidateName');
  const startRoleName = document.getElementById('startRoleName');
  const startTitle = document.getElementById('startTitle');

  const timerBadge = document.getElementById('timerBadge');
  const timerDisplay = document.getElementById('timerDisplay');

  const currentQuestionNum = document.getElementById('currentQuestionNum');
  const questionText = document.getElementById('questionText');
  const optionsContainer = document.getElementById('optionsContainer');
  const prevQuestionBtn = document.getElementById('prevQuestionBtn');
  const nextQuestionBtn = document.getElementById('nextQuestionBtn');
  const flagQuestionBtn = document.getElementById('flagQuestionBtn');
  const flagBtnText = document.getElementById('flagBtnText');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  const answeredStatusText = document.getElementById('answeredStatusText');

  const paletteGrid = document.getElementById('paletteGrid');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const paletteAttemptedSummary = document.getElementById('paletteAttemptedSummary');
  const paletteRemainingSummary = document.getElementById('paletteRemainingSummary');
  const bottomStatusSummary = document.getElementById('bottomStatusSummary');

  // Parse Token from URL
  function getCandidateToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || urlParams.get('id') || urlParams.get('candidateId');
  }

  // 1. Initialize Assessment on Page Load
  async function init() {
    setupSecurityListeners();
    const token = getCandidateToken();

    if (!token) {
      renderErrorScreen('Missing Assessment Token', 'Please use the official test link sent to your email.');
      return;
    }

    try {
      const res = await fetch(`/api/test/${encodeURIComponent(token)}`);
      const data = await res.json();

      if (!data.success) {
        renderErrorScreen('Assessment Link Invalid', data.error || 'This test link is invalid or expired.');
        return;
      }

      candidate = data.candidate;
      questions = data.questions || [];

      // Check if already completed
      if (candidate.testStatus === 'COMPLETED' || candidate.status === 'HIRED' || (candidate.decision === 'REJECTED' && candidate.testScore !== undefined)) {
        renderAlreadyCompletedScreen(candidate);
        return;
      }

      // Populate Candidate Info
      candidateName.textContent = candidate.name || 'Candidate';
      candidateRole.textContent = candidate.role || 'Technical Role';
      candidateAvatar.textContent = (candidate.name || 'C').charAt(0).toUpperCase();

      startCandidateName.textContent = candidate.name || 'Candidate';
      startRoleName.textContent = candidate.role || 'Applied Role';
      startTitle.textContent = `${candidate.role || 'Domain'} Technical Assessment`;

      // Event Listeners for Start
      beginTestBtn.addEventListener('click', startExam);

    } catch (err) {
      console.error('Init Error:', err);
      renderErrorScreen('Network Connection Issue', 'Failed to connect to assessment server. Please check your internet connection.');
    }
  }

  // 2. Start Exam
  function startExam() {
    if (!questions || questions.length === 0) {
      alert('Unable to load questions. Please refresh or contact HR.');
      return;
    }

    isTestActive = true;
    startScreen.classList.add('hidden');
    activeTestPanel.classList.remove('hidden');
    bottomActionBar.classList.remove('hidden');

    // Notify backend test has started
    const token = getCandidateToken();
    fetch(`/api/test/${encodeURIComponent(token)}/start`, { method: 'POST' }).catch(() => {});

    buildPaletteGrid();
    renderQuestion(currentIndex);
    startTimer();
  }

  // 3. 30-Minute Strict Countdown Timer
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (!isTestActive) return;
      timeRemaining--;

      updateTimerDisplay();

      // Warning thresholds
      if (timeRemaining <= 300 && timeRemaining > 60) {
        timerBadge.classList.add('warning');
      } else if (timeRemaining <= 60) {
        timerBadge.classList.remove('warning');
        timerBadge.classList.add('danger');
      }

      // Auto submit at 00:00
      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        timeRemaining = 0;
        updateTimerDisplay();
        alert('⏰ Time has expired! Your assessment is being submitted automatically.');
        submitExam(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timerDisplay.textContent = formatted;
    
    const overviewTimer = document.getElementById('overviewTimeRemaining');
    if (overviewTimer) overviewTimer.textContent = formatted;
  }

  // 4. Render Current Question
  function renderQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    currentIndex = index;

    const q = questions[index];
    currentQuestionNum.textContent = index + 1;
    questionText.textContent = `${index + 1}. ${q.question}`;

    // Options rendering
    optionsContainer.innerHTML = '';
    const prefixes = ['A', 'B', 'C', 'D'];
    const chosenAnswer = answers[index];

    (q.options || []).forEach((opt, optIdx) => {
      const optItem = document.createElement('div');
      optItem.className = `option-item ${chosenAnswer === optIdx ? 'selected' : ''}`;
      optItem.innerHTML = `
        <div class="option-prefix">${prefixes[optIdx] || optIdx + 1}</div>
        <div class="option-text">${escapeHtml(opt)}</div>
      `;

      optItem.addEventListener('click', () => {
        selectOption(index, optIdx);
      });

      optionsContainer.appendChild(optItem);
    });

    // Navigation Buttons State
    prevQuestionBtn.disabled = index === 0;
    if (index === questions.length - 1) {
      nextQuestionBtn.textContent = 'Review & Submit →';
    } else {
      nextQuestionBtn.textContent = 'Next →';
    }

    // Flag State
    if (flagged[index]) {
      flagQuestionBtn.classList.add('flagged');
      flagBtnText.textContent = 'Flagged for Review';
    } else {
      flagQuestionBtn.classList.remove('flagged');
      flagBtnText.textContent = 'Mark for Review';
    }

    // Status text
    if (chosenAnswer !== undefined) {
      answeredStatusText.textContent = `Selected: Option ${prefixes[chosenAnswer]}`;
      answeredStatusText.style.color = 'var(--success)';
    } else {
      answeredStatusText.textContent = 'Not Answered Yet';
      answeredStatusText.style.color = 'var(--text-muted)';
    }

    updatePaletteState();
    updateProgressSummary();
  }

  // Option selection
  function selectOption(qIdx, optIdx) {
    answers[qIdx] = optIdx;
    renderQuestion(qIdx);
  }

  // Clear selection
  clearSelectionBtn.addEventListener('click', () => {
    delete answers[currentIndex];
    renderQuestion(currentIndex);
  });

  // Flag toggle
  flagQuestionBtn.addEventListener('click', () => {
    flagged[currentIndex] = !flagged[currentIndex];
    renderQuestion(currentIndex);
  });

  // Prev / Next Navigation
  prevQuestionBtn.addEventListener('click', () => {
    if (currentIndex > 0) renderQuestion(currentIndex - 1);
  });

  nextQuestionBtn.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      renderQuestion(currentIndex + 1);
    } else {
      openOverviewModal();
    }
  });

  // 5. Palette Grid 1-20
  function buildPaletteGrid() {
    paletteGrid.innerHTML = '';
    for (let i = 0; i < questions.length; i++) {
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.id = `palette-btn-${i}`;
      btn.textContent = i + 1;
      btn.title = `Question ${i + 1}`;
      btn.addEventListener('click', () => {
        renderQuestion(i);
      });
      paletteGrid.appendChild(btn);
    }
  }

  function updatePaletteState() {
    for (let i = 0; i < questions.length; i++) {
      const btn = document.getElementById(`palette-btn-${i}`);
      if (!btn) continue;

      btn.className = 'palette-btn';
      if (answers[i] !== undefined) {
        btn.classList.add('attempted');
      }
      if (flagged[i]) {
        btn.classList.add('flagged');
      }
      if (i === currentIndex) {
        btn.classList.add('current');
      }
    }
  }

  function updateProgressSummary() {
    const attemptedCount = Object.keys(answers).length;
    const totalCount = questions.length || 20;
    const remainingCount = totalCount - attemptedCount;
    const percent = Math.round((attemptedCount / totalCount) * 100);

    progressBarFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    paletteAttemptedSummary.textContent = `${attemptedCount} answered`;
    paletteRemainingSummary.textContent = `${remainingCount} remaining`;
    bottomStatusSummary.textContent = `Proctored Session Active • ${attemptedCount}/${totalCount} Answered (${timeRemaining > 0 ? Math.floor(timeRemaining/60) + 'm left' : 'Time Expired'})`;
  }

  // 6. Overview Modal
  openOverviewBtn.addEventListener('click', openOverviewModal);
  closeOverviewBtn.addEventListener('click', closeOverviewModal);
  backToExamBtn.addEventListener('click', closeOverviewModal);
  overviewSubmitBtn.addEventListener('click', () => {
    closeOverviewModal();
    openSubmitConfirmModal();
  });

  function openOverviewModal() {
    const attemptedCount = Object.keys(answers).length;
    const totalCount = questions.length || 20;
    const skippedCount = totalCount - attemptedCount;
    const flaggedCount = Object.keys(flagged).filter(k => flagged[k]).length;

    document.getElementById('overviewAttemptedCount').textContent = attemptedCount;
    document.getElementById('overviewSkippedCount').textContent = skippedCount;
    document.getElementById('overviewFlaggedCount').textContent = flaggedCount;
    document.getElementById('overviewTimeRemaining').textContent = timerDisplay.textContent;

    const grid = document.getElementById('overviewQuestionGrid');
    grid.innerHTML = '';

    for (let i = 0; i < questions.length; i++) {
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.textContent = i + 1;
      
      if (answers[i] !== undefined) btn.classList.add('attempted');
      if (flagged[i]) btn.classList.add('flagged');
      if (i === currentIndex) btn.classList.add('current');

      btn.addEventListener('click', () => {
        closeOverviewModal();
        renderQuestion(i);
      });

      grid.appendChild(btn);
    }

    overviewModal.classList.remove('hidden');
  }

  function closeOverviewModal() {
    overviewModal.classList.add('hidden');
  }

  // 7. Submit Confirmation Modal
  openSubmitBtn.addEventListener('click', openSubmitConfirmModal);
  cancelSubmitBtn.addEventListener('click', closeSubmitConfirmModal);
  confirmSubmitBtn.addEventListener('click', () => {
    closeSubmitConfirmModal();
    submitExam(false);
  });

  function openSubmitConfirmModal() {
    const attemptedCount = Object.keys(answers).length;
    const totalCount = questions.length || 20;
    submitConfirmSummary.innerHTML = `You have answered <strong>${attemptedCount}</strong> out of <strong>${totalCount}</strong> questions.`;

    if (attemptedCount < totalCount) {
      submitWarningBox.classList.remove('hidden');
    } else {
      submitWarningBox.classList.add('hidden');
    }

    submitConfirmModal.classList.remove('hidden');
  }

  function closeSubmitConfirmModal() {
    submitConfirmModal.classList.add('hidden');
  }

  // 8. Submit Assessment to Backend
  async function submitExam(isAutoTimeout = false) {
    if (isSubmitting) return;
    isSubmitting = true;
    isTestActive = false;
    clearInterval(timerInterval);

    // Show loading state
    activeTestPanel.classList.add('hidden');
    bottomActionBar.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    resultScreen.innerHTML = `
      <div class="result-card">
        <div class="result-icon">⚙️</div>
        <h2 class="result-title">Grading Your Assessment...</h2>
        <p class="result-desc">Please wait while the automated evaluation engine grades your 20 responses and calculates your domain score.</p>
      </div>
    `;

    const token = getCandidateToken();
    const durationTaken = totalTimeSeconds - timeRemaining;

    try {
      const res = await fetch(`/api/test/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          durationTaken,
          isAutoTimeout,
          cheatViolations
        })
      });

      const data = await res.json();
      if (!data.success) {
        renderErrorScreen('Submission Error', data.error || 'An error occurred during submission.');
        return;
      }

      renderFinalResult(data);

    } catch (err) {
      console.error('Submission failed:', err);
      renderErrorScreen('Network Error', 'Submission could not reach server. Please inform HR.');
    }
  }

  // 9. Render Final Result Screen
  function renderFinalResult(result) {
    const isPass = result.passed; // Score >= 80%
    const score = result.score;
    const correctCount = result.correctCount;
    const totalCount = result.totalCount || 20;
    const candName = result.candidateName || candidate.name || 'Candidate';
    const candRole = result.appliedRole || candidate.role || 'Applied Role';

    resultScreen.innerHTML = `
      <div class="result-card ${isPass ? 'pass' : 'fail'}">
        <div class="result-icon">${isPass ? '🎉' : '📋'}</div>
        <div class="result-tag">${isPass ? 'HIRED • ASSESSMENT PASSED' : 'ASSESSMENT COMPLETED'}</div>
        <h2 class="result-title">${isPass ? `Congratulations, ${escapeHtml(candName)}!` : `Thank You, ${escapeHtml(candName)}`}</h2>
        
        <p class="result-desc">
          ${isPass 
            ? `Outstanding performance! You scored <strong>${score}%</strong> in the <strong>${escapeHtml(candRole)}</strong> competency test, exceeding the 80% hiring threshold.`
            : `You scored <strong>${score}%</strong> in the <strong>${escapeHtml(candRole)}</strong> assessment. The qualifying threshold for this position is <strong>80%</strong>.`
          }
        </p>

        <!-- SCORE METRICS CARD -->
        <div class="result-score-box">
          <div class="score-main-num">${score}%</div>
          <div class="score-sub-details">
            <div>Correct Answers: <strong>${correctCount} / ${totalCount}</strong></div>
            <div>Passing Threshold: <strong>80% (16/20)</strong></div>
            <div>Decision: <strong>${isPass ? 'HIRED / SELECTED' : 'NOT QUALIFIED'}</strong></div>
          </div>
        </div>

        ${isPass ? `
          <!-- PASS / OFFER DISPATCH NOTIFICATION -->
          <div class="next-steps-card">
            <h4>✉️ Official Job Offer Letter Dispatched!</h4>
            <p>
              Your formal <strong>Job Offer Letter</strong> with joining schedule, compensation breakdown, and onboarding instructions has been sent to <strong>${escapeHtml(candidate.email || 'your email')}</strong>. Please check your inbox and reply to confirm your acceptance.
            </p>
          </div>
        ` : `
          <!-- FAIL / FEEDBACK NOTIFICATION -->
          <div class="next-steps-card" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.25);">
            <h4 style="color: var(--danger);">📧 Application Status Update Dispatched</h4>
            <p>
              A formal update email with constructive domain feedback has been dispatched to <strong>${escapeHtml(candidate.email || 'your email')}</strong>. We appreciate your interest and encourage you to re-apply in future recruitment cycles.
            </p>
          </div>
        `}

        <div style="margin-top: 24px; font-size: 13px; color: var(--text-muted);">
          Tech Innovations Inc. Automated HR Recruitment Platform • Session ID: ${escapeHtml(getCandidateToken())}
        </div>
      </div>
    `;
  }

  // Render Already Completed Screen
  function renderAlreadyCompletedScreen(cand) {
    const isHired = cand.status === 'HIRED' || (cand.testScore !== undefined && cand.testScore >= 80);
    const score = cand.testScore !== undefined ? cand.testScore : (isHired ? 85 : 60);

    resultScreen.classList.remove('hidden');
    startScreen.classList.add('hidden');

    resultScreen.innerHTML = `
      <div class="result-card ${isHired ? 'pass' : 'fail'}">
        <div class="result-icon">${isHired ? '🏆' : '📋'}</div>
        <div class="result-tag">${isHired ? 'TEST COMPLETED • OFFER EXTENDED' : 'TEST COMPLETED'}</div>
        <h2 class="result-title">Assessment Already Completed</h2>
        <p class="result-desc">
          Hello <strong>${escapeHtml(cand.name)}</strong>, your assessment for <strong>${escapeHtml(cand.role)}</strong> has already been submitted and graded.
        </p>

        <div class="result-score-box">
          <div class="score-main-num">${score}%</div>
          <div class="score-sub-details">
            <div>Final Score: <strong>${score}%</strong></div>
            <div>Status: <strong>${isHired ? 'HIRED (Offer Letter Sent)' : 'REJECTED (Score < 80%)'}</strong></div>
          </div>
        </div>

        <p style="font-size: 14px; color: var(--text-secondary);">
          If you have questions regarding your application, please reach out to <a href="mailto:manasvipaliwal317@gmail.com" style="color: var(--primary);">manasvipaliwal317@gmail.com</a>.
        </p>
      </div>
    `;
  }

  function renderErrorScreen(title, message) {
    startScreen.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    resultScreen.innerHTML = `
      <div class="result-card fail">
        <div class="result-icon">⚠️</div>
        <h2 class="result-title">${escapeHtml(title)}</h2>
        <p class="result-desc">${escapeHtml(message)}</p>
        <p style="font-size: 13px; color: var(--text-muted);">Please check the link provided in your interview invitation email.</p>
      </div>
    `;
  }

  // 10. Strict Anti-Cheating & Security Handlers
  function setupSecurityListeners() {
    // A. Disable Context Menu
    document.addEventListener('contextmenu', (e) => {
      if (isTestActive) {
        e.preventDefault();
        return false;
      }
    });

    // B. Disable Copy / Cut / Paste
    document.addEventListener('copy', (e) => {
      if (isTestActive) {
        e.preventDefault();
        triggerCheatWarning('Copying test content is strictly prohibited.');
      }
    });
    document.addEventListener('cut', (e) => {
      if (isTestActive) e.preventDefault();
    });
    document.addEventListener('paste', (e) => {
      if (isTestActive) e.preventDefault();
    });

    // C. Trap DevTools Shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
    document.addEventListener('keydown', (e) => {
      if (!isTestActive) return;

      if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
        triggerCheatWarning('Developer inspection tools are disabled during proctored testing.');
        return false;
      }
    });

    // D. Window Blur & Tab Switch Detection
    window.addEventListener('blur', () => {
      if (isTestActive && !cheatWarningModal.classList.contains('hidden') === false) {
        handleTabSwitch();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isTestActive) {
        handleTabSwitch();
      }
    });

    resumeTestBtn.addEventListener('click', () => {
      cheatWarningModal.classList.add('hidden');
    });
  }

  function handleTabSwitch() {
    if (!isTestActive) return;
    cheatViolations++;
    triggerCheatWarning('Tab or window switch detected. Please stay inside the assessment window.');

    if (cheatViolations >= MAX_CHEAT_VIOLATIONS) {
      alert('🚨 Maximum security violations reached (3/3). Auto-submitting assessment now.');
      cheatWarningModal.classList.add('hidden');
      submitExam(true);
    }
  }

  function triggerCheatWarning(customMsg) {
    if (!isTestActive) return;
    cheatCountDisplay.textContent = `${cheatViolations} / ${MAX_CHEAT_VIOLATIONS}`;
    if (customMsg) {
      document.getElementById('cheatWarningText').textContent = customMsg;
    }
    cheatWarningModal.classList.remove('hidden');
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

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
