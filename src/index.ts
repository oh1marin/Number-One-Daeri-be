import 'dotenv/config';
import { Server } from 'http';
import app from './app';
import { prisma } from './lib/prisma';

const BASE_PORT = parseInt(process.env.PORT || '5174', 10);

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ DB 연결됨');
  } catch (e) {
    console.error('❌ DB 연결 실패:', e);
    process.exit(1);
  }

  function tryListen(port: number): Server {
    const server = app.listen(port, () => {
      console.log(`🚀 서버 실행 중: http://localhost:${port}`);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ 포트 ${port} 사용 중 → ${port + 1} 시도`);
        server.close();
        tryListen(port + 1);
      } else {
        throw err;
      }
    });
    return server;
  }

  tryListen(BASE_PORT);
}

main().catch(console.error);
