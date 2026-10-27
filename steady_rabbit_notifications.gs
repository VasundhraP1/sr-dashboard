/**
 * Steady Rabbit Sheet Notifications
 * Apps Script code to send immediate email notifications
 * whenever a new Requirement or Candidate is added in the spreadsheet directly.
 */

function onEditNotificationTrigger(e) {
  if (!e) return;
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName().toLowerCase().trim();
  
  // Only trigger on Requirement sheets (Requirement Sheet, Requirement sheet new, etc.)
  if (sheetName.indexOf('requirement') === -1) {
    return;
  }
  
  const row = range.getRow();
  if (row <= 1) return; // Skip header row
  
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
  const rowValues = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  
  const getHeaderIdx = (names) => {
    for (let i = 0; i < names.length; i++) {
      const idx = headers.indexOf(names[i].toLowerCase().trim());
      if (idx !== -1) return idx;
    }
    // Substring match fallback
    for (let i = 0; i < names.length; i++) {
      const name = names[i].toLowerCase().trim();
      for (let j = 0; j < headers.length; j++) {
        if (headers[j].indexOf(name) !== -1) return j;
      }
    }
    return -1;
  };
  
  const colReq = getHeaderIdx(['requirement', 'requirement name']);
  const colPriority = getHeaderIdx(['priority', 'requirement priority']);
  const colClient = getHeaderIdx(['client name', 'client name + company profile link', 'client']);
  const colCandidate = getHeaderIdx(['candidate', 'candidate name']);
  const colComments = getHeaderIdx(['comments (hiring team)', 'comments', 'remarks']);
  const colClientBudget = getHeaderIdx(['client budget', 'budget']);
  const colVendorBudget = getHeaderIdx(['vendor budget']);
  const colExp = getHeaderIdx(['experience', 'exp', 'candidate experience']);
  
  const valReq = colReq !== -1 ? rowValues[colReq].toString().trim() : '';
  const valPriority = colPriority !== -1 ? rowValues[colPriority].toString().trim() : '';
  const valClient = colClient !== -1 ? rowValues[colClient].toString().trim() : '';
  const valCandidate = colCandidate !== -1 ? rowValues[colCandidate].toString().trim() : '';
  const valComments = colComments !== -1 ? rowValues[colComments].toString().trim() : '';
  const valClientBudget = colClientBudget !== -1 ? rowValues[colClientBudget].toString().trim() : '';
  const valVendorBudget = colVendorBudget !== -1 ? rowValues[colVendorBudget].toString().trim() : '';
  
  let valExp = '';
  if (colExp !== -1) {
    valExp = rowValues[colExp].toString().trim();
  } else {
    // Extract experience from Hiring Comments if present
    const match = valComments.match(/(?:exp|experience|yr|year|yrs)\s*[:\-]?\s*([0-9\.\+]+\s*(?:yrs|years|yr|year)?)/i);
    if (match) valExp = match[1];
  }
  
  const isFilled = (val) => val && val !== '—' && val !== '';
  
  // 1. New Candidate Notification (HR submission)
  if (isFilled(valCandidate)) {
    const candKey = `cand_sent_${sheetName}_${row}_${valCandidate.replace(/\s+/g, '')}`;
    if (!isNotificationSent(candKey)) {
      // Check if Requirement Name, Priority, Client Name, and Candidate Name are fully typed in
      if (isFilled(valReq) && isFilled(valPriority) && isFilled(valClient)) {
        sendCandidateEmail(valReq, valPriority, valClient, valCandidate, valExp, valClientBudget || valVendorBudget || '—');
        markNotificationSent(candKey);
      }
    }
  } 
  // 2. New Requirement Notification (Only if no candidate has been filled yet)
  else if (isFilled(valReq) && isFilled(valPriority) && isFilled(valClient)) {
    const reqKey = `req_sent_${sheetName}_${row}_${valReq.replace(/\s+/g, '')}`;
    if (!isNotificationSent(reqKey)) {
      sendRequirementEmail(valReq, valPriority, valClient);
      markNotificationSent(reqKey);
    }
  }
}

function isNotificationSent(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) === 'true';
  } catch (e) {
    return false;
  }
}

function markNotificationSent(key) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, 'true');
  } catch (e) {
    Logger.log("Error writing properties: " + e.toString());
  }
}

function sendRequirementEmail(reqName, priority, clientName) {
  const recipients = "partner@steadyrabbit.in, hr@steadyrabbit.in";
  const subject = `🚨 New Job Requirement: ${reqName} (${clientName})`;
  
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #007bff; color: white; padding: 20px; font-size: 18px; font-weight: bold;">
        New Requirement Added
      </div>
      <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Hi Team,</p>
        <p>A new requirement has been posted directly in the sheet:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Requirement:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${reqName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Client Name:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Priority:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <span style="background-color: ${priority.toLowerCase() === 'high' || priority.toLowerCase() === 'very high' ? '#dc3545' : '#ffc107'}; color: ${priority.toLowerCase() === 'high' || priority.toLowerCase() === 'very high' ? 'white' : 'black'}; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                ${priority}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
          This is an automated notification sent via Steady Rabbit Reports.
        </p>
      </div>
    </div>
  `;
  
  sendMail(recipients, subject, htmlBody);
}

function sendCandidateEmail(reqName, priority, clientName, candidateName, experience, budget) {
  const recipients = "partner@steadyrabbit.in, hr@steadyrabbit.in";
  const subject = `👥 New Candidate Submission: ${candidateName} for ${reqName}`;
  
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #28a745; color: white; padding: 20px; font-size: 18px; font-weight: bold;">
        New Candidate Added
      </div>
      <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Hi Team,</p>
        <p>A new candidate has been submitted by HR in the sheet:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Candidate Name:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${candidateName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Requirement:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${reqName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Client Name:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Experience:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${experience || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Budget/CTC:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${budget}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Priority:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
              <span style="background-color: ${priority.toLowerCase() === 'high' || priority.toLowerCase() === 'very high' ? '#dc3545' : '#ffc107'}; color: ${priority.toLowerCase() === 'high' || priority.toLowerCase() === 'very high' ? 'white' : 'black'}; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                ${priority}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
          This is an automated notification sent via Steady Rabbit Reports.
        </p>
      </div>
    </div>
  `;
  
  sendMail(recipients, subject, htmlBody);
}

function sendMail(recipients, subject, htmlBody) {
  try {
    GmailApp.sendEmail(recipients, subject, '', {
      from: "reports@steadyrabbit.in",
      htmlBody: htmlBody
    });
    Logger.log("Email sent successfully from alias reports@steadyrabbit.in: " + subject);
  } catch (e) {
    Logger.log("Failed to send from alias reports@steadyrabbit.in: " + e.toString() + ". Falling back to default sender.");
    try {
      GmailApp.sendEmail(recipients, subject, '', {
        htmlBody: htmlBody
      });
    } catch(err) {
      Logger.log("Failed standard email send: " + err.toString());
    }
  }
}
