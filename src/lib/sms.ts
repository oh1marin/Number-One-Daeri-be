/**
 * SMS 발송 서비스
 * - 개발: 콘솔 로그 (실제 발송 없음)
 * - 운영: solapi, aligo, aws (AWS Pinpoint), aws-eum, twilio
 * - AWS SNS는 한국 미지원 → Pinpoint 사용
 */

import * as crypto from 'crypto';

const OTP_EXPIRE_MIN = 5;

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getOtpExpireMinutes(): number {
  return OTP_EXPIRE_MIN;
}

/** 한국 번호를 E.164 형식으로 변환 (01012345678 → +821012345678) */
function toE164(phone: string): string {
  const n = phone.replace(/\D/g, '');
  if (n.startsWith('0')) return '+82' + n.slice(1);
  if (n.startsWith('82')) return '+' + n;
  return '+82' + n;
}

/** 일반 SMS 발송 (관리자 문자 등) */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  const normalized = phone.replace(/\D/g, '');
  if (normalized.length < 10 || normalized.length > 11) {
    throw new Error('유효하지 않은 전화번호 형식');
  }
  if (process.env.SMS_SERVICE === 'aws-eum' && process.env.AWS_SMS_POOL_ID) {
    return sendViaAwsEndUserMessaging(toE164(normalized), message);
  }
  if (process.env.SMS_SERVICE === 'aws' && process.env.AWS_PINPOINT_APPLICATION_ID) {
    return sendViaAwsPinpoint(toE164(normalized), message);
  }
  if (process.env.SMS_SERVICE === 'twilio' && process.env.TWILIO_ACCOUNT_SID) {
    return sendViaTwilio(toE164(normalized), message);
  }
  if (process.env.SMS_SERVICE === 'aligo' && process.env.ALIGO_API_KEY) {
    return sendViaAligo(phone, message);
  }
  if (process.env.SMS_SERVICE === 'solapi' && process.env.SOLAPI_API_KEY) {
    return sendViaSolapi(phone, message);
  }
  console.log(`[SMS DEV] to=${phone} | ${message}`);
  return true;
}

export async function sendSmsOtp(phone: string, code: string): Promise<boolean> {
  const message = `[일등대리] 인증번호 [${code}]를 5분 내에 입력해주세요.`;
  return sendSms(phone, message);
}

/** AWS End User Messaging (Pinpoint SMS Voice v2) - 권장 */
async function sendViaAwsEndUserMessaging(phoneE164: string, content: string): Promise<boolean> {
  const poolId = process.env.AWS_SMS_POOL_ID;
  if (!poolId) {
    console.warn('[SMS] AWS_SMS_POOL_ID 미설정');
    console.log(`[SMS] to=${phoneE164} | ${content}`);
    return true;
  }

  try {
    const { PinpointSMSVoiceV2Client, SendTextMessageCommand } = await import(
      '@aws-sdk/client-pinpoint-sms-voice-v2'
    );
    const client = new PinpointSMSVoiceV2Client({
      region: process.env.AWS_REGION || 'ap-northeast-2',
    });

    const command = new SendTextMessageCommand({
      DestinationPhoneNumber: phoneE164,
      OriginationIdentity: poolId,
      MessageBody: content,
      MessageType: 'TRANSACTIONAL',
    });

    const res = await client.send(command);
    if (!res.MessageId) {
      console.error('[SMS] End User Messaging 응답 이상:', res);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[SMS] End User Messaging 예외:', e);
    return false;
  }
}

async function sendViaAwsPinpoint(phoneE164: string, content: string): Promise<boolean> {
  const appId = process.env.AWS_PINPOINT_APPLICATION_ID;
  if (!appId) {
    console.warn('[SMS] AWS_PINPOINT_APPLICATION_ID 미설정');
    console.log(`[SMS] to=${phoneE164} | ${content}`);
    return true;
  }

  try {
    const { PinpointClient, SendMessagesCommand } = await import('@aws-sdk/client-pinpoint');
    const client = new PinpointClient({
      region: process.env.AWS_REGION || 'ap-northeast-2',
    });

    const command = new SendMessagesCommand({
      ApplicationId: appId,
      MessageRequest: {
        Addresses: {
          [phoneE164]: { ChannelType: 'SMS' },
        },
        MessageConfiguration: {
          SMSMessage: {
            Body: content,
            MessageType: 'TRANSACTIONAL',
          },
        },
      },
    });

    const res = await client.send(command);
    const result = res.MessageResponse?.Result?.[phoneE164];
    if (result?.DeliveryStatus !== 'SUCCESSFUL' && result?.StatusCode !== 200) {
      console.error('[SMS] AWS Pinpoint 오류:', result);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[SMS] AWS Pinpoint 예외:', e);
    return false;
  }
}

/** 알리고 (한국 SMS, 회원가입만 하면 바로 연동 가능) */
async function sendViaAligo(phone: string, content: string): Promise<boolean> {
  const key = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!key || !userId || !sender) {
    console.warn('[SMS] Aligo 미설정 (ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER 필요)');
    console.log(`[SMS] to=${phone} | ${content}`);
    return true;
  }

  try {
    const body = new URLSearchParams({
      key,
      user_id: userId,
      sender,
      receiver: phone.replace(/\D/g, ''),
      msg: content,
      msg_type: 'SMS',
      ...(process.env.ALIGO_TEST_MODE === 'Y' && { testmode_yn: 'Y' }),
    });

    const res = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await res.json()) as { result_code?: number; message?: string };
    if (data.result_code == null || data.result_code < 1) {
      console.error('[SMS] Aligo 오류:', data.message || data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[SMS] Aligo 예외:', e);
    return false;
  }
}

/** 솔라피 (한국 SMS, 개인 인증만으로 API 이용 가능) */
function createSolapiAuthHeader(apiKey: string, apiSecret: string): string {
  const dateTime = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const data = dateTime + salt;
  const signature = crypto.createHmac('sha256', apiSecret).update(data).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${dateTime}, salt=${salt}, signature=${signature}`;
}

async function sendViaSolapi(phone: string, content: string): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    console.warn('[SMS] Solapi 미설정 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER 필요)');
    console.log(`[SMS] to=${phone} | ${content}`);
    return true;
  }

  const SOLAPI_TIMEOUT_MS = 10000; // 10초

  try {
    const body = {
      messages: [
        {
          to: phone.replace(/\D/g, ''),
          from: sender.replace(/\D/g, ''),
          text: content,
        },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SOLAPI_TIMEOUT_MS);

    console.log('[SMS] Solapi 발송 시도:', phone);

    const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        Authorization: createSolapiAuthHeader(apiKey, apiSecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await res.json()) as {
      statusCode?: string;
      errorCode?: string;
      statusMessage?: string;
      groupInfo?: { status?: string; count?: { registeredSuccess?: number } };
      failedMessageList?: unknown[];
    };

    // send-many/detail: groupInfo + failedMessageList 형식 (정상 접수 시)
    const hasGroupInfo = data.groupInfo && (data.groupInfo.status === 'SENDING' || data.groupInfo.status === 'COMPLETED');
    const noFailed = !data.failedMessageList || data.failedMessageList.length === 0;
    const legacySuccess = data.statusCode === '2000';

    if (res.status !== 200 || (!legacySuccess && !(hasGroupInfo && noFailed))) {
      console.error('[SMS] Solapi 오류:', data.errorCode || data.statusMessage || data);
      return false;
    }
    console.log('[SMS] Solapi 발송 성공:', phone);
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      console.error('[SMS] Solapi 타임아웃 (10초 초과):', phone);
    } else {
      console.error('[SMS] Solapi 예외:', e);
    }
    return false;
  }
}

/** 솔라피 메시지 목록 조회 (GET /messages/v4/list) */
export type SolapiListParams = {
  messageId?: string;
  groupId?: string;
  to?: string;
  from?: string;
  type?: string;
  dateCreated?: string;
  dateUpdated?: string;
  dateType?: 'CREATED' | 'UPDATED';
  startDate?: string;
  endDate?: string;
  startKey?: string;
  limit?: number;
  criteria?: string;
  cond?: string;
  value?: string;
};

export async function fetchSolapiMessageList(
  params: SolapiListParams = {}
): Promise<{ list: unknown[]; nextKey?: string }> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('SOLAPI_API_KEY, SOLAPI_API_SECRET 필요');
  }

  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') searchParams.set(k, String(v));
  }

  const url = `https://api.solapi.com/messages/v4/list?${searchParams.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: createSolapiAuthHeader(apiKey, apiSecret),
    },
  });

  const data = (await res.json()) as {
    statusCode?: string;
    errorCode?: string;
    statusMessage?: string;
    messageList?: unknown[];
    nextKey?: string;
  };

  const ok = res.status === 200 && (data.statusCode === '2000' || Array.isArray(data.messageList));
  if (!ok) {
    throw new Error(data.statusMessage || data.errorCode || 'Solapi 목록 조회 실패');
  }

  return {
    list: data.messageList ?? [],
    nextKey: data.nextKey,
  };
}

async function sendViaTwilio(phoneE164: string, content: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn('[SMS] Twilio 미설정');
    console.log(`[SMS] to=${phoneE164} | ${content}`);
    return true;
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneE164,
          From: from,
          Body: content,
        }).toString(),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('[SMS] Twilio 오류:', err);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[SMS] Twilio 예외:', e);
    return false;
  }
}
