import 'dotenv/config';
import http from 'http';
import app from './app';
import { prisma } from './lib/prisma';
import { setupSocket } from './socket';

const BASE_PORT = parseInt(process.env.PORT || '5174', 10);

function assertProductionJwtSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const weak = new Set(['dev-secret-change-in-production', 'dev-refresh-secret']);
  const js = process.env.JWT_SECRET ?? '';
  const jr = process.env.JWT_REFRESH_SECRET ?? '';
  if (weak.has(js) || weak.has(jr) || js.length < 16 || jr.length < 16) {
    console.error(
      '❌ 프로덕션: JWT_SECRET / JWT_REFRESH_SECRET 을 dev 기본값이 아닌 충분히 긴 값으로 설정하세요.'
    );
    process.exit(1);
  }
}

async function main() {
  assertProductionJwtSecrets();
  try {
    await prisma.$connect();
    console.log('✅ DB 연결됨');
  } catch (e) {
    console.error('❌ DB 연결 실패:', e);
    process.exit(1);
  }

  const httpServer = http.createServer(app);
  setupSocket(httpServer);

  httpServer.listen(BASE_PORT, '0.0.0.0', () => {
    console.log(`🚀 서버 실행 중: http://localhost:${BASE_PORT}`);
    console.log(`   실기기 연결: http://<PC_IP>:${BASE_PORT}/api/v1 (ipconfig로 IP 확인)`);
    console.log(`   Socket.io: ws://localhost:${BASE_PORT}`);
  });
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ 포트 ${BASE_PORT} 사용 중. 기존 프로세스를 종료하세요.`);
      process.exit(1);
    }
    throw err;
  });
}

main().catch(console.error);
