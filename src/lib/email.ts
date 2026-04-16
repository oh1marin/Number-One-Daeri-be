import nodemailer from 'nodemailer';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
}

const transporter = getTransporter();

function getToEmail() {
  return process.env.CONTACT_EMAIL || process.env.SMTP_USER;
}

export async function sendContactEmail(data: {
  name: string;
  email: string;
  phone?: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const toEmail = getToEmail();
  if (!toEmail) {
    const msg = 'CONTACT_EMAIL 또는 SMTP_USER 미설정';
    console.warn(msg);
    return { ok: false, error: msg };
  }
  if (!process.env.SMTP_PASS) {
    const msg = 'SMTP_PASS 미설정';
    console.warn(msg);
    return { ok: false, error: msg };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"일등대리" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `[상담문의] ${data.name} (${data.email})`,
      text: [
        `이름: ${data.name}`,
        `이메일: ${data.email}`,
        data.phone ? `연락처: ${data.phone}` : null,
        '',
        '문의내용:',
        data.content,
      ]
        .filter(Boolean)
        .join('\n'),
      html: `
        <p><strong>이름</strong>: ${data.name}</p>
        <p><strong>이메일</strong>: ${data.email}</p>
        ${data.phone ? `<p><strong>연락처</strong>: ${data.phone}</p>` : ''}
        <p><strong>문의내용</strong>:</p>
        <pre style="white-space: pre-wrap;">${data.content}</pre>
      `,
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    const msg = err.message || String(e);
    console.error('이메일 발송 실패:', msg);
    if (err instanceof Error && 'response' in err) {
      console.error('SMTP 응답:', (err as unknown as { response: string }).response);
    }
    return { ok: false, error: msg };
  }
}

/** SMTP 연결·인증 테스트 */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message || String(e) };
  }
}
