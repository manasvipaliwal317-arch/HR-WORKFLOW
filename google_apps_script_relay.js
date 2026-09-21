/**
 * ==============================================================================
 * 🚀 GOOGLE APPS SCRIPT: NATIVE GMAIL HTTPS EMAIL RELAY (PORT 443)
 * ==============================================================================
 * This script runs in Google Cloud Apps Script and acts as an HTTPS REST Webhook
 * allowing your Render.com HR Recruitment system to dispatch emails directly
 * from your Gmail (manasvipaliwal317@gmail.com) over Port 443 without being
 * blocked by Render's Free Tier SMTP firewall!
 *
 * HOW TO DEPLOY IN 60 SECONDS:
 * 1. Open your browser and go to: https://script.google.com
 * 2. Click "+ New Project".
 * 3. Delete any default code in Code.gs, and PASTE THIS ENTIRE FILE.
 * 4. Click "Deploy" (top right blue button) -> "New deployment".
 * 5. Click the Gear icon ⚙️ next to "Select type" -> Choose "Web app".
 * 6. Set:
 *    - Description: "HR Email Relay"
 *    - Execute as: "Me (manasvipaliwal317@gmail.com)"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy". Authorize permissions when prompted by Google.
 * 8. Copy the "Web App URL" (ends in /exec).
 * 9. Paste this URL into your Render Environment Variables as:
 *    EMAIL_RELAY_URL = https://script.google.com/macros/s/.../exec
 * ==============================================================================
 */

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);

    var to = data.to || data.toEmail;
    var subject = data.subject || "Application Update - Tech Innovations Inc.";
    var htmlBody = data.html || data.htmlContent || "";
    var plainBody = data.text || data.body || "Please view this email in an HTML client.";
    var fromName = data.fromName || "Tech Innovations Inc. Recruitment Team";

    if (!to) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing recipient 'to'" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Dispatch directly from the authenticated Google account inbox
    GmailApp.sendEmail(to, subject, plainBody, {
      htmlBody: htmlBody || plainBody,
      name: fromName
    });

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      messageId: "gas_" + new Date().getTime(),
      recipient: to,
      dispatchedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "healthy",
    service: "Nexus HR Gmail HTTPS Relay",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
