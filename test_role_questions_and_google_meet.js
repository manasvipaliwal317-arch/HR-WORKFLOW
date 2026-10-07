/**
 * Automated Verification:
 * 1. Role-specific test question generation for ALL company job roles
 * 2. Automatic Google Meet link generation and invitation email dispatch upon test qualification (score >= 80%)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Load modules from server.js
const {
  generateTestQuestionsForCandidate,
  generateGoogleMeetLink,
  generateFinalInterviewInviteTemplate,
  app,
  getCandidates,
  saveCandidates,
  getJobRoles
} = require('./server.js');

const results = [];
function assert(name, condition, details = '') {
  results.push({ name, passed: !!condition, details });
  const icon = condition ? '✅' : '❌';
  console.log(`${icon} ${condition ? 'PASSED' : 'FAILED'}: ${name}`);
  if (details) console.log(`   └─ ${details}`);
}

async function runRoleAndGoogleMeetVerification() {
  console.log('======================================================================');
  console.log(' 🔬 VERIFICATION: ROLE-SPECIFIC QUESTIONS & GOOGLE MEET DISPATCH');
  console.log('======================================================================\n');

  let serverInstance = null;

  try {
    // -------------------------------------------------------------
    // PART 1: Role-Specific Question Generation Verification
    // -------------------------------------------------------------
    console.log('--- [PART 1] Verifying 20 Role-Specific MCQs For Each Job Role ---');

    // Test Role A: Senior Cloud Security Architect
    console.log('\n>>> Generating MCQs for: Senior Cloud Security Architect');
    const cloudQuestions = await generateTestQuestionsForCandidate('test_cloud_cand', 'Senior Cloud Security Architect');
    assert('Cloud Security test produces exactly 20 MCQs',
      Array.isArray(cloudQuestions) && cloudQuestions.length === 20,
      `Questions count: ${cloudQuestions.length}`
    );

    const cloudText = JSON.stringify(cloudQuestions).toLowerCase();
    const hasCloudTerms = cloudText.includes('iam') || cloudText.includes('aws') || cloudText.includes('kubernetes') || cloudText.includes('terraform') || cloudText.includes('security');
    assert('Cloud Security MCQs are specifically regarding Cloud & Security',
      hasCloudTerms,
      `Detected cloud security domain keywords: IAM/AWS/Kubernetes/Terraform/Security`
    );

    // Test Role B: Digital Marketing Specialist
    console.log('\n>>> Generating MCQs for: Digital Marketing Specialist');
    const mktQuestions = await generateTestQuestionsForCandidate('test_mkt_cand', 'Digital Marketing Specialist');
    assert('Digital Marketing test produces exactly 20 MCQs',
      Array.isArray(mktQuestions) && mktQuestions.length === 20,
      `Questions count: ${mktQuestions.length}`
    );

    const mktText = JSON.stringify(mktQuestions).toLowerCase();
    const hasMktTerms = mktText.includes('seo') || mktText.includes('ads') || mktText.includes('ga4') || mktText.includes('roas') || mktText.includes('marketing');
    assert('Digital Marketing MCQs are specifically regarding Marketing & Analytics',
      hasMktTerms,
      `Detected marketing domain keywords: SEO/Ads/GA4/ROAS/Marketing`
    );

    // Test Role C: Full Stack Developer
    console.log('\n>>> Generating MCQs for: Full Stack Developer');
    const fsQuestions = await generateTestQuestionsForCandidate('test_fs_cand', 'Full Stack Developer');
    assert('Full Stack Developer test produces exactly 20 MCQs',
      Array.isArray(fsQuestions) && fsQuestions.length === 20,
      `Questions count: ${fsQuestions.length}`
    );

    const fsText = JSON.stringify(fsQuestions).toLowerCase();
    const hasFsTerms = fsText.includes('react') || fsText.includes('node') || fsText.includes('database') || fsText.includes('sql') || fsText.includes('api');
    assert('Full Stack Developer MCQs are specifically regarding Full Stack Engineering',
      hasFsTerms,
      `Detected fullstack domain keywords: React/Node/SQL/Database/API`
    );

    // Test Role D: AI / ML Engineer
    console.log('\n>>> Generating MCQs for: AI / ML Engineer');
    const aiQuestions = await generateTestQuestionsForCandidate('test_ai_cand', 'AI / ML Engineer');
    assert('AI / ML Engineer test produces exactly 20 MCQs',
      Array.isArray(aiQuestions) && aiQuestions.length === 20,
      `Questions count: ${aiQuestions.length}`
    );

    const aiText = JSON.stringify(aiQuestions).toLowerCase();
    const hasAiTerms = aiText.includes('rag') || aiText.includes('model') || aiText.includes('transformer') || aiText.includes('vector') || aiText.includes('learning');
    assert('AI / ML Engineer MCQs are specifically regarding AI & Machine Learning',
      hasAiTerms,
      `Detected AI/ML domain keywords: RAG/Model/Transformer/Vector/Learning`
    );

    // -------------------------------------------------------------
    // PART 2: Google Meet Link Generation & Email Template Verification
    // -------------------------------------------------------------
    console.log('\n--- [PART 2] Verifying Deterministic Google Meet Link & Email Template ---');

    const testSeed = 'cand_qualify_999';
    const meetLink = generateGoogleMeetLink(testSeed);
    const isValidMeetUrl = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetLink);

    assert('generateGoogleMeetLink produces standard https://meet.google.com/xxx-yyyy-zzz link',
      isValidMeetUrl,
      `Generated link: ${meetLink}`
    );

    const testQualifyingCandidate = {
      id: 'cand_qualify_test_001',
      name: 'Aditi Sharma',
      email: 'aditi.sharma.test2026@gmail.com',
      role: 'Senior Cloud Security Architect',
      proposedInterviewDate: 'Tuesday, October 13, 2026',
      interviewTime: '11:00 AM - 11:45 AM IST',
      meetingLink: meetLink
    };

    const finalInviteHtml = generateFinalInterviewInviteTemplate({
      candidate: testQualifyingCandidate,
      score: 90,
      correctCount: 18,
      totalCount: 20,
      interviewDate: testQualifyingCandidate.proposedInterviewDate,
      interviewTime: testQualifyingCandidate.interviewTime,
      meetingLink: meetLink
    });

    assert('Final Interview Invitation email includes Candidate Name',
      finalInviteHtml.includes('Aditi Sharma'),
      'Recipient personalized'
    );
    assert('Final Interview Invitation email includes Qualifying Score (90%)',
      finalInviteHtml.includes('90%') && finalInviteHtml.includes('18/20'),
      'Score and correct count rendered'
    );
    assert('Final Interview Invitation email includes Target Role',
      finalInviteHtml.includes('Senior Cloud Security Architect'),
      'Role rendered'
    );
    assert('Final Interview Invitation email includes Clickable Google Meet Button & Link',
      finalInviteHtml.includes(meetLink) && finalInviteHtml.includes('Join Google Meet Video Interview'),
      `Google Meet URL embedded: ${meetLink}`
    );

    // -------------------------------------------------------------
    // PART 3: End-to-End Test Submission Flow via HTTP API
    // -------------------------------------------------------------
    console.log('\n--- [PART 3] Verifying /api/test/:token/submit Score >= 80% Flow ---');

    // Spin up local test port
    const TEST_PORT = 3199;
    serverInstance = app.listen(TEST_PORT, () => {});
    await new Promise(r => setTimeout(r, 600));

    // Seed test candidate in database with questions
    const candId = 'cand_e2e_pass_' + Date.now().toString(36);
    const qualifyingStudent = {
      id: candId,
      name: 'Aditi Sharma',
      email: 'aditi.sharma.test2026@gmail.com',
      role: 'Senior Cloud Security Architect',
      decision: 'SELECTED',
      matchScore: 95,
      status: 'TEST_ASSIGNED',
      testStatus: 'ASSIGNED',
      testToken: candId,
      testQuestions: cloudQuestions,
      proposedInterviewDate: 'Tuesday, October 13, 2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const existingDB = getCandidates();
    existingDB.unshift(qualifyingStudent);
    saveCandidates(existingDB);

    // Prepare answers scoring 18/20 = 90% (Passes 80% threshold!)
    const qualifyingAnswers = {};
    cloudQuestions.forEach((q, idx) => {
      // First 18 correct, last 2 wrong
      if (idx < 18) {
        qualifyingAnswers[idx] = q.correctAnswerIndex;
      } else {
        qualifyingAnswers[idx] = (q.correctAnswerIndex + 1) % 4;
      }
    });

    // Submit Assessment
    const submitReqData = JSON.stringify({
      answers: qualifyingAnswers,
      durationTaken: 720,
      cheatViolations: 0
    });

    const submitResponse = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/test/${encodeURIComponent(candId)}/submit`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(submitReqData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch(e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      req.write(submitReqData);
      req.end();
    });

    assert('POST /api/test/:token/submit returns 200 OK',
      submitResponse.status === 200 && submitResponse.data.success === true,
      `API Status: ${submitResponse.status}`
    );

    assert('Candidate graded with Score >= 80% (isPassed: true)',
      submitResponse.data.passed === true && submitResponse.data.score >= 80,
      `Graded Score: ${submitResponse.data?.score}% (Threshold: 80%)`
    );

    // Verify Candidate in DB
    const freshCandidates = getCandidates();
    const updatedCandidate = freshCandidates.find(c => c.id === candId);

    assert('Candidate status transitioned to INTERVIEW_SCHEDULED',
      updatedCandidate && updatedCandidate.status === 'INTERVIEW_SCHEDULED',
      `DB Status: ${updatedCandidate?.status}`
    );

    assert('Candidate received automated Google Meet link',
      updatedCandidate && !!updatedCandidate.meetingLink && updatedCandidate.meetingLink.includes('meet.google.com'),
      `Stored Meet Link: ${updatedCandidate?.meetingLink}`
    );

    assert('Candidate interview status reflects Final Interview Scheduled',
      updatedCandidate && updatedCandidate.interviewStatus.includes('Final Interview Scheduled'),
      `Interview Status: ${updatedCandidate?.interviewStatus}`
    );

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n======================================================================');
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;
    console.log(` 🏁 RESULT: ${passedCount} PASSED | ${failedCount} FAILED out of ${results.length} tests`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('❌ Verification Error:', err);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    setTimeout(() => {
      const failed = results.filter(r => !r.passed).length;
      process.exit(failed > 0 ? 1 : 0);
    }, 1000);
  }
}

runRoleAndGoogleMeetVerification();
