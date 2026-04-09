/**
 * 초기 관리자 계정 생성
 * 사용: npx ts-node scripts/create-admin.ts [email] [password] [name]
 * 예:  npx ts-node scripts/create-admin.ts admin@test.com password123 관리자
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@test.com';
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'admin1234!';
  const name = process.argv[4] || process.env.ADMIN_NAME || '관리자';

  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await prisma.admin.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    console.log('⚠️  이미 존재하는 이메일입니다:', normalizedEmail);
    console.log('   로그인 페이지에서 비밀번호로 로그인하세요.');
    process.exit(0);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const admin = await prisma.admin.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      name: String(name).trim(),
    },
  });

  console.log('✅ 관리자 계정 생성 완료');
  console.log('   이메일:', admin.email);
  console.log('   이름:', admin.name);
  console.log('');
  console.log('   웹 어드민에서 위 이메일/비밀번호로 로그인하세요.');
}

main()
  .catch((e) => {
    console.error('❌ 오류:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
