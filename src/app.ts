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

const adminWebOrigins = (process.env.ADMIN_WEB_ORIGINS || 'http://localhost:3002,http://127.0.0.1:3002')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    /** 브라우저 + credentials: include 이면 Allow-Origin 을 요청 오리진과 정확히 일치시켜야 함(와일드카드 불가) */
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (adminWebOrigins.includes(origin)) {
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

// 공지 (웹 폴백: GET /notices, GET /notices/:id)
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
