import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';

export function setupSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('인증 필요'));
    try {
      const payload = verifyAccessToken(token);
      if (payload.userId) {
        (socket as unknown as { userId: string }).userId = payload.userId;
      } else if (payload.driverId) {
        (socket as unknown as { driverId: string }).driverId = payload.driverId;
      } else {
        return next(new Error('유효하지 않은 토큰'));
      }
      next();
    } catch {
      next(new Error('유효하지 않은 토큰'));
    }
  });

  io.on('connection', (socket) => {
    const s = socket as unknown as { userId?: string; driverId?: string };
    if (s.userId) {
      socket.join(`user:${s.userId}`);
    }
    if (s.driverId) {
      socket.join(`driver:${s.driverId}`);
    }

    socket.on('ride:join', (rideId: string) => {
      socket.join(`ride:${rideId}`);
    });

    socket.on('disconnect', () => {});
  });

  (global as unknown as { io: Server }).io = io;
  return io;
}
