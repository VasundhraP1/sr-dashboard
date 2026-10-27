const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'ASPMX.L.GOOGLE.COM',
  port: 25,
  secure: false,
  tls: { rejectUnauthorized: false }
});

async function main() {
  try {
    const info = await transporter.sendMail({
      from: '"Steady Rabbit System" <vasundhra.panwar@steadyrabbit.in>',
      to: 'vasundhra.panwar@steadyrabbit.in',
      subject: 'Test Interview Notification from Steady Rabbit Backend',
      text: 'This is a test notification dispatched directly from the Steady Rabbit Node.js backend.'
    });
    console.log('Send result:', info);
  } catch (err) {
    console.error('Send error:', err);
  }
}

main();
