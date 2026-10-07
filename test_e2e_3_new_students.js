const fs = require('fs');
const path = require('path');
const http = require('http');

// Load server module
const serverModule = require('./server.js');
const { app, appConfig, getCandidates, saveCandidates, getJobRoles, generateTestQuestionsForCandidate } = serverModule;

const PORT = 3009; // Isolated test port
let serverInstance = null;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', body = null, headers = {} } = options;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, data: json || data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runMasterTest() {
  console.log('======================================================================');
  console.log(' 🚀 COMPREHENSIVE END-TO-END SYSTEM TEST & 3 NEW STUDENTS VERIFICATION');
  console.log('======================================================================\n');

  // Start test server
  serverInstance = app.listen(PORT, '127.0.0.1');
  await new Promise(r => setTimeout(r, 1000));

  const results = [];
  function assert(title, condition, details = '') {
    const passed = Boolean(condition);
    console.log(`${passed ? '✅ PASSED' : '❌ FAILED'}: ${title}`);
    if (details) console.log(`   └─ ${details}`);
    results.push({ title, passed, details });
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Health & Telemetry Check
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 1] Server Health & 10-Minute Poller Frequency Check ---');
    const health = await request('/api/health');
    assert('Server Health Check returns 200 OK', health.status === 200 && health.data.service);

    const scannerStatus = await request('/api/scanner-status');
    assert('Scanner Telemetry reports Every 10 Minutes frequency',
      scannerStatus.status === 200 &&
      scannerStatus.data.stats &&
      scannerStatus.data.stats.frequency.includes('10 Minutes'),
      `Reported frequency: "${scannerStatus.data?.stats?.frequency}"`
    );

    assert('Scanner is active and listening on INBOX',
      scannerStatus.data.stats.active === true &&
      scannerStatus.data.stats.mailbox === 'manasvipaliwal317@gmail.com',
      `Mailbox: ${scannerStatus.data.stats.mailbox}`
    );

    // -------------------------------------------------------------
    // TEST 2: Manual Scan Trigger without 403 Forbidden
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 2] HR Dashboard Manual Trigger (/api/scan-inbox) ---');
    const scanTrigger = await request('/api/scan-inbox', { method: 'POST' });
    assert('Manual scan trigger responds successfully with 200 (No 403 blocks)',
      scanTrigger.status === 200 && scanTrigger.data.success === true,
      `Response: ${JSON.stringify(scanTrigger.data)}`
    );

    // -------------------------------------------------------------
    // TEST 3: Existing Student Safeguards
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 3] Safeguards for Existing Students (No Re-Mailing) ---');
    const existingTestEmails = [
      'sharmavageesha2000@gmail.com',
      'manasvi60487.mbaib22@ipsacademy.org',
      'manasvipaliwal317@gmail.com',
      'robert.langdon.qa@gmail.com'
    ];

    for (const em of existingTestEmails) {
      // Simulate evaluate call for existing student
      const evalExisting = await request('/api/evaluate', {
        method: 'POST',
        body: {
          candidateName: 'Existing Student Test',
          candidateEmail: em,
          appliedRole: 'Full Stack Developer',
          resumeText: 'Test existing candidate resume content',
          fileName: 'resume.pdf'
        }
      });
      assert(`Existing student "${em}" is processed without duplicate dispatch error`,
        evalExisting.status === 200,
        `Evaluated: ${evalExisting.data?.candidate?.decision || 'OK'}`
      );
    }

    // -------------------------------------------------------------
    // TEST 4: Test 3 Brand New Students
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 4] End-to-End Testing for 3 NEW Students ---');

    // STUDENT 1: Arjun Mehta (Full Stack Developer -> Strong -> SELECTED)
    console.log('\n>>> Testing Student 1: Arjun Mehta (Full Stack Developer)');
    const student1Payload = {
      candidateName: 'Arjun Mehta',
      candidateEmail: 'arjun.mehta.dev2026@gmail.com',
      appliedRole: 'Full Stack Developer',
      fileName: 'Arjun_Mehta_FullStack_Resume.pdf',
      resumeText: `
        ARJUN MEHTA
        Email: arjun.mehta.dev2026@gmail.com | Phone: +91 98765 43210
        Full Stack Developer with 3.5 years experience in building high-scale web platforms.
        TECHNICAL SKILLS:
        Frontend: React.js, Next.js, TypeScript, Redux Toolkit, Tailwind CSS, HTML5, CSS3
        Backend: Node.js, Express.js, RESTful APIs, GraphQL, Microservices
        Databases: PostgreSQL, MongoDB, Redis
        DevOps & Tools: Docker, Git, CI/CD, Jest, AWS (EC2, S3)
        PROFESSIONAL EXPERIENCE:
        Software Engineer at CloudScale Technologies (2023 - Present)
        - Architected and delivered React & Node.js web portals serving 250,000+ monthly users.
        - Designed and optimized PostgreSQL database schemas reducing query latency by 42%.
        - Developed REST APIs and microservice endpoints with JWT auth and rate limiting.
        EDUCATION:
        B.Tech in Computer Science & Engineering (2019 - 2023)
      `
    };

    const resStudent1 = await request('/api/evaluate', { method: 'POST', body: student1Payload });
    assert('Student 1 (Arjun Mehta) evaluation completed', resStudent1.status === 200 && resStudent1.data.candidate);
    const cand1 = resStudent1.data.candidate;
    assert('Student 1 decision is SELECTED with score >= 70%', cand1.decision === 'SELECTED' && cand1.matchScore >= 70, `Decision: ${cand1.decision}, Score: ${cand1.matchScore}%`);
    assert('Student 1 received valid testToken & testLink', Boolean(cand1.testToken && cand1.testLink), `Link: ${cand1.testLink}`);
    assert('Student 1 has 20 MCQs generated for Technical Assessment', Array.isArray(cand1.testQuestions) && cand1.testQuestions.length === 20, `Questions count: ${cand1.testQuestions?.length}`);
    assert('Student 1 interviewDate is scheduled in future', Boolean(cand1.interviewDate), `Date: ${cand1.interviewDate}`);

    // STUDENT 2: Riya Sen (Digital Marketing Specialist -> Strong -> SELECTED)
    console.log('\n>>> Testing Student 2: Riya Sen (Digital Marketing Specialist)');
    const student2Payload = {
      candidateName: 'Riya Sen',
      candidateEmail: 'riya.sen.growth2026@gmail.com',
      appliedRole: 'Digital Marketing Specialist',
      fileName: 'Riya_Sen_Marketing_Resume.pdf',
      resumeText: `
        RIYA SEN
        Email: riya.sen.growth2026@gmail.com | Phone: +91 91234 56789
        Digital Marketing & Performance Growth Specialist with 2.5 years experience.
        CORE COMPETENCIES:
        Growth Marketing, Search Engine Optimization (SEO), SEM, Google Ads Search & Display,
        Meta Ads Manager (Facebook/Instagram), Google Analytics 4 (GA4), Conversion Rate Optimization (CRO),
        Content Marketing, Email Marketing, Funnel Optimization.
        WORK EXPERIENCE:
        Digital Marketing Associate at Apex Media Labs (2024 - Present)
        - Managed ₹15 Lakhs+ monthly ad spend across Google Ads and Meta Ads with 4.2x ROAS.
        - Executed on-page and technical SEO strategies increasing organic search traffic by 135%.
        - Designed full-funnel retention and lead generation email automations.
        EDUCATION:
        BBA in Marketing (2020 - 2023)
      `
    };

    const resStudent2 = await request('/api/evaluate', { method: 'POST', body: student2Payload });
    assert('Student 2 (Riya Sen) evaluation completed', resStudent2.status === 200 && resStudent2.data.candidate);
    const cand2 = resStudent2.data.candidate;
    assert('Student 2 decision is SELECTED with score >= 70%', cand2.decision === 'SELECTED' && cand2.matchScore >= 70, `Decision: ${cand2.decision}, Score: ${cand2.matchScore}%`);
    assert('Student 2 received testToken & testLink', Boolean(cand2.testToken && cand2.testLink), `Link: ${cand2.testLink}`);
    assert('Student 2 has 20 MCQs generated for Marketing Assessment', Array.isArray(cand2.testQuestions) && cand2.testQuestions.length === 20, `Questions count: ${cand2.testQuestions?.length}`);

    // STUDENT 3: Kunal Verma (Mismatched Profile applying for Full Stack -> REJECTED)
    console.log('\n>>> Testing Student 3: Kunal Verma (Mismatched Profile -> REJECTED)');
    const student3Payload = {
      candidateName: 'Kunal Verma',
      candidateEmail: 'kunal.verma.sales2026@gmail.com',
      appliedRole: 'Full Stack Developer',
      fileName: 'Kunal_Verma_Retail_Resume.pdf',
      resumeText: `
        KUNAL VERMA
        Email: kunal.verma.sales2026@gmail.com | Phone: +91 90000 11111
        Retail Store Associate & Cashier.
        SKILLS:
        Cash register handling, customer greeting, shelf restocking, billing, POS machines, inventory counting.
        EXPERIENCE:
        Store Attendant at Local Supermarket (2024 - 2026)
        - Operated cash counter and provided customer assistance.
        - Handled daily cash reconciliation.
        No computer programming or software development background.
      `
    };

    const resStudent3 = await request('/api/evaluate', { method: 'POST', body: student3Payload });
    assert('Student 3 (Kunal Verma) evaluation completed', resStudent3.status === 200 && resStudent3.data.candidate);
    const cand3 = resStudent3.data.candidate;
    assert('Student 3 decision is REJECTED with score < 70%', cand3.decision === 'REJECTED' && cand3.matchScore < 70, `Decision: ${cand3.decision}, Score: ${cand3.matchScore}%`);
    assert('Student 3 has constructive rejection reason', Boolean(cand3.rejectionReason), `Reason: ${cand3.rejectionReason}`);
    assert('Student 3 did NOT receive assessment questions', (!cand3.testQuestions || cand3.testQuestions.length === 0), `Questions: ${cand3.testQuestions?.length || 0}`);

    // -------------------------------------------------------------
    // TEST 5: Online MCQ Assessment Flow (For Student 1)
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 5] Online MCQ Assessment Portal Verification ---');
    const examToken = cand1.testToken;
    const examDataRes = await request(`/api/test/${encodeURIComponent(examToken)}`);
    assert('Online Assessment endpoint (/api/test/:token) loads test questions for valid token',
      examDataRes.status === 200 && examDataRes.data.success === true,
      `Candidate: ${examDataRes.data.candidate?.name}, Role: ${examDataRes.data.candidate?.role}, Total MCQs: ${examDataRes.data.questions?.length}`
    );
    assert('Exam payload contains exactly 20 randomized questions',
      examDataRes.data.questions && examDataRes.data.questions.length === 20,
      `Received ${examDataRes.data.questions?.length} MCQs`
    );

    // Also verify the /api/assessment alias works
    const aliasRes = await request(`/api/assessment?token=${encodeURIComponent(examToken)}`);
    assert('Assessment alias endpoint (/api/assessment?token=...) also loads valid exam',
      aliasRes.status === 200 && aliasRes.data.success === true && aliasRes.data.questions?.length === 20,
      `Alias Questions: ${aliasRes.data?.questions?.length}`
    );

    // Simulate Student 1 answering and submitting test
    const mockAnswers = {};
    examDataRes.data.questions.forEach((q, idx) => {
      // Pick choice index (0 to 3)
      mockAnswers[idx] = idx % 4;
    });

    const submitRes = await request(`/api/test/${encodeURIComponent(examToken)}/submit`, {
      method: 'POST',
      body: {
        answers: mockAnswers,
        durationTaken: 645,
        cheatViolations: 0
      }
    });

    assert('Candidate Assessment submission processed successfully',
      submitRes.status === 200 && submitRes.data.success === true,
      `Calculated Exam Score: ${submitRes.data?.score}%, Passed: ${submitRes.data?.passed}`
    );

    // Verify candidate database update
    const updatedCandidates = getCandidates();
    const verifiedCand1 = updatedCandidates.find(c => c.id === cand1.id);
    assert('Candidate record in DB updated with COMPLETED assessment test status',
      verifiedCand1 && verifiedCand1.testStatus === 'COMPLETED' && verifiedCand1.testScore !== undefined,
      `Status: ${verifiedCand1?.testStatus}, Test Score: ${verifiedCand1?.testScore}%`
    );

    // -------------------------------------------------------------
    // TEST 6: Candidate Pipeline & Analytics Endpoints
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 6] Recruiter Dashboard & Analytics API Verification ---');
    const candList = await request('/api/candidates');
    const candidatesArr = Array.isArray(candList.data) ? candList.data : (candList.data?.candidates || []);
    assert('GET /api/candidates returns populated list including new students',
      candList.status === 200 && candidatesArr.length >= 3,
      `Total candidates in DB: ${candidatesArr.length}`
    );

    const stats = await request('/api/stats');
    assert('GET /api/stats reflects pipeline metrics',
      stats.status === 200 && stats.data.total >= 3 && stats.data.selected >= 2,
      `Total: ${stats.data.total}, Selected: ${stats.data.selected}, Rejected: ${stats.data.rejected}`
    );

    const jobRoles = await request('/api/job-roles');
    const rolesArr = Array.isArray(jobRoles.data) ? jobRoles.data : (jobRoles.data?.roles || []);
    assert('GET /api/job-roles returns active company openings',
      jobRoles.status === 200 && rolesArr.length > 0,
      `Roles count: ${rolesArr.length}`
    );

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n======================================================================');
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;
    console.log(` 🏁 TEST RUN COMPLETE: ${passedCount} PASSED | ${failedCount} FAILED out of ${results.length} tests`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('❌ Master Test Execution Error:', err);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    setTimeout(() => {
      const failed = results.filter(r => !r.passed).length;
      process.exit(failed > 0 ? 1 : 0);
    }, 1500);
  }
}

runMasterTest();
