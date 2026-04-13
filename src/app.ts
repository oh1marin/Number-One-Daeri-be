import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import apiRouter from './routes';
import appNotices from './routes/app/notices';
import { jsonServerError } from './lib/jsonError';

const app = express();

/** 리버스 프록시 뒤에서 `X-Forwarded-*` / 클라이언트 IP 신뢰 */
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

/** JSON API 용 — CSP 비활성, CORS 크로스 오리진 API 응답과 충돌하지 않게 CORP 완화 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

function parseOriginList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 관리자 웹 + 공개 홈(공지 등) 등 브라우저에서 API를 부를 수 있는 Origin 목록 */
const browserAllowedOrigins = [
  ...new Set([
    ...parseOriginList(process.env.ADMIN_WEB_ORIGINS),
    ...parseOriginList(process.env.PUBLIC_WEB_ORIGINS),
    // 기본값: 로컬 관리자 (ADMIN 미설정 시)
    ...(process.env.ADMIN_WEB_ORIGINS?.trim()
      ? []
      : ['http://localhost:3002', 'http://127.0.0.1:3002']),
  ]),
];

app.use(
  cors({
    /** 브라우저 + credentials: include 이면 Allow-Origin 을 요청 오리진과 정확히 일치시켜야 함(와일드카드 불가) */
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (browserAllowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.use((req, _res, next) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress;
  console.log(`[REQ] ${req.method} ${req.path} | IP: ${ip}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// 공지 — Flutter/웹 홈 호환: 루트 `/notices` (nginx가 /api/v1 만 넘길 때 대비). 동일 라우터가 `/api/v1/notices`에도 마운트됨.
app.use('/notices', appNotices);

// API v1
app.use('/api/v1', apiRouter);

// JSON 파싱 오류·동기 예외 등 — 일관된 JSON 바디 (프로덕션에서는 상세 숨김)
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const parseFailed =
      (err as { type?: string; status?: number }).type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && 'body' in err && (err as { status?: number }).status === 400);
    if (parseFailed) {
      res.status(400).json({
        success: false,
        error: '요청 본문 형식이 올바르지 않습니다.',
        message: '요청 본문 형식이 올바르지 않습니다.',
      });
      return;
    }
    console.error('[API]', err);
    jsonServerError(res, err);
  }
);

export default app;
