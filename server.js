require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTACT_RECEIVER = process.env.CONTACT_RECEIVER || 'manojsairm@gmail.com';

// Allows the API to be called from a different host (e.g. a frontend hosted
// on Google Sites embedding this backend) when ALLOWED_ORIGIN is set in .env.
// With it unset, only same-origin requests are allowed.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || false;

const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');

app.set('trust proxy', 1);
app.use(helmet());
// cors() with no options defaults to Access-Control-Allow-Origin: * (any site).
// Only enable it, scoped to one origin, when the frontend is served from
// elsewhere; otherwise skip it so the browser's same-origin policy applies.
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN }));
}
app.use(express.json({ limit: '20kb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid request body.' });
  }
  next(err);
});
app.use(express.static(path.join(__dirname, 'public')));

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many messages sent - please try again later.' },
});

// Strips newlines/control chars so user input can never inject extra
// headers or lines into outgoing email (defense in depth; nodemailer
// also sanitizes these, but this keeps stored/logged data clean too).
// Used for fields that end up in email headers (name -> subject, email -> replyTo).
function sanitizeHeaderField(value) {
  return String(value).replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim();
}

// Used for the free-text message body: strips control chars but keeps
// the line breaks the user actually typed.
function sanitizeBody(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]+/g, '').trim();
}

// ---- Mailer ----
// Preferred: Resend's HTTP API (travels over port 443, so it works on hosts
// like Render's free tier that block outbound SMTP ports). Falls back to
// SMTP via nodemailer for hosts where that isn't an issue (e.g. local dev).
const RESEND_API_KEY = process.env.RESEND_API_KEY || null;
const RESEND_FROM = process.env.RESEND_FROM || 'MS IT Solutions <onboarding@resend.dev>';

let transporter = null;
if (!RESEND_API_KEY && process.env.SMTP_USER && process.env.SMTP_PASS) {
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465,
    connectionTimeout: 10000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendContactEmail(entry) {
  const subject = `New enquiry from ${entry.name} - MS IT Solutions`;
  const text = `Name: ${entry.name}\nEmail: ${entry.email}\nPhone: ${entry.phone}\n\nMessage:\n${entry.message}`;

  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: CONTACT_RECEIVER,
        reply_to: entry.email,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: `"MS IT Solutions Website" <${process.env.SMTP_USER}>`,
      to: CONTACT_RECEIVER,
      replyTo: entry.email,
      subject,
      text,
    });
  }
}

// ---- Data: services offered (drives the frontend dynamically) ----
const SERVICES = [
  {
    id: 'web-dev',
    icon: 'code',
    title: 'Website Development',
    description:
      'Fast, responsive, SEO-friendly websites for businesses, portfolios and startups - built with modern, lightweight tech.',
  },
  {
    id: 'app-dev',
    icon: 'mobile',
    title: 'App Development',
    description:
      'Android, iOS and cross-platform apps designed around your workflow, from idea to Play Store / App Store launch.',
  },
  {
    id: 'custom-software',
    icon: 'layers',
    title: 'Custom Software',
    description:
      'Internal tools, dashboards, automation scripts and business software tailored to how your team actually works.',
  },
  {
    id: 'cloud-hosting',
    icon: 'cloud',
    title: 'Cloud & Hosting Setup',
    description:
      'Domain, hosting, deployment and cloud configuration (AWS / Azure / GCP) done right the first time.',
  },
  {
    id: 'it-support',
    icon: 'shield',
    title: 'IT Support & Consulting',
    description:
      'Troubleshooting, system setup, network/security basics and honest advice on the right tech for your budget.',
  },
  {
    id: 'maintenance',
    icon: 'headset',
    title: 'Maintenance & Support',
    description:
      'Ongoing updates, bug fixes, backups and monitoring so your website or app keeps running smoothly after launch.',
  },
];

app.get('/api/services', (req, res) => {
  res.json(SERVICES);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---- Contact form ----
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, phone, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Name, email and message are required.' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(sanitizeHeaderField(email))) {
    return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
  }

  const entry = {
    id: Date.now(),
    name: sanitizeHeaderField(name).slice(0, 200),
    email: sanitizeHeaderField(email).slice(0, 200),
    phone: phone ? sanitizeHeaderField(phone).slice(0, 50) : '',
    message: sanitizeBody(message).slice(0, 5000),
    receivedAt: new Date().toISOString(),
  };

  try {
    const existing = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8') || '[]');
    existing.push(entry);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error('Failed to persist message:', err);
  }

  if (RESEND_API_KEY || transporter) {
    try {
      await sendContactEmail(entry);
    } catch (err) {
      console.error('Failed to send email (message was still saved):', err.message);
    }
  }

  res.json({ success: true, message: 'Thanks! Your message has been received - we will get back to you soon.' });
});

app.listen(PORT, () => {
  console.log(`MS IT Solutions website running at http://localhost:${PORT}`);
  if (RESEND_API_KEY) {
    console.log('Email: sending contact form messages via Resend.');
  } else if (transporter) {
    console.log('Email: sending contact form messages via SMTP.');
  } else {
    console.log('(No email method configured - contact messages are saved to data/messages.json only. See .env.example.)');
  }
});
