import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /admin/me
router.get('/', async (req, res) => {
  try {
    const adminId = req.admin!.id;

    const [admin, invoiceSettings] = await Promise.all([
      prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true, email: true, name: true },
      }),
      prisma.invoiceSettings.findFirst(),
    ]);

    if (!admin) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const settings = invoiceSettings ?? null;
    const extra = (settings?.extraSettings as Record<string, unknown> | null) ?? {};

    const portFromEnv = Number(process.env.PORT || 5174);
    const port = typeof extra.port === 'number' ? extra.port : portFromEnv;

    res.json({
      success: true,
      data: {
        // 회사 / 관리자 정보
        id: admin.email, // 로그인 ID는 이메일로 사용
        email: admin.email,
        name: '관리자',
        companyName: settings?.companyName ?? '',
        ceoName: settings?.ceoName ?? (admin.name || '관리자'),
        phone: settings?.phone ?? '',
        tel: settings?.phone ?? '',
        programName: (extra.programName as string) ?? '로지소프트',
        port,
        appVersion: (extra.appVersion as string) ?? '',
        soundEnabled: (extra.soundEnabled as boolean | undefined) ?? true,

        // 설정 / 안내 정보
        workStartTime: (extra.workStartTime as string) ?? '',
        workEndTime: (extra.workEndTime as string) ?? '',
        address: settings?.address ?? '',
        androidInstallUrl: (extra.androidInstallUrl as string) ?? '',
        iosInstallUrl: (extra.iosInstallUrl as string) ?? '',
        homepageUrl: (extra.homepageUrl as string) ?? '',
        mainNotice: (extra.mainNotice as string) ?? '',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/me
router.patch('/', async (req, res) => {
  try {
    const adminId = req.admin!.id;
    const {
      name,
      password,
      currentPassword,
      companyName,
      ceoName,
      phone,
      address,
      programName,
      port,
      appVersion,
      soundEnabled,
      workStartTime,
      workEndTime,
      androidInstallUrl,
      iosInstallUrl,
      homepageUrl,
      mainNotice,
    } = req.body;

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const adminData: { name?: string; password?: string } = {};
    if (name != null) adminData.name = String(name).trim();

    if (password) {
      if (!currentPassword) {
        res.status(400).json({ success: false, error: '현재 비밀번호 필수' });
        return;
      }
      const valid = await bcrypt.compare(String(currentPassword), admin.password);
      if (!valid) {
        res.status(400).json({ success: false, error: '현재 비밀번호가 일치하지 않습니다.' });
        return;
      }
      adminData.password = await bcrypt.hash(String(password), 10);
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: adminId },
      data: adminData,
      select: { id: true, email: true, name: true },
    });

    const existing = await prisma.invoiceSettings.findFirst();
    let updatedInvoiceSettings;
    if (existing) {
      const currentExtra = (existing.extraSettings as Record<string, unknown> | null) ?? {};
      const nextExtra: Record<string, unknown> = {
        ...currentExtra,
      };
      if (programName !== undefined) nextExtra.programName = String(programName);
      if (port !== undefined) {
        const n = Number(port);
        if (!Number.isNaN(n)) nextExtra.port = n;
      }
      if (appVersion !== undefined) nextExtra.appVersion = String(appVersion);
      if (soundEnabled !== undefined) nextExtra.soundEnabled = Boolean(soundEnabled);
      if (workStartTime !== undefined) nextExtra.workStartTime = String(workStartTime);
      if (workEndTime !== undefined) nextExtra.workEndTime = String(workEndTime);
      if (androidInstallUrl !== undefined) nextExtra.androidInstallUrl = String(androidInstallUrl);
      if (iosInstallUrl !== undefined) nextExtra.iosInstallUrl = String(iosInstallUrl);
      if (homepageUrl !== undefined) nextExtra.homepageUrl = String(homepageUrl);
      if (mainNotice !== undefined) nextExtra.mainNotice = String(mainNotice);

      updatedInvoiceSettings = await prisma.invoiceSettings.update({
        where: { id: existing.id },
        data: {
          ...(companyName != null && { companyName: String(companyName).trim() || null }),
          ...(ceoName != null && { ceoName: String(ceoName).trim() || null }),
          ...(phone != null && { phone: String(phone).trim() || null }),
          ...(address != null && { address: String(address).trim() || null }),
          ...(Object.keys(nextExtra).length > 0 && { extraSettings: nextExtra as Prisma.InputJsonValue }),
        },
      });
    } else {
      const extraSettings: Record<string, unknown> = {};
      if (programName !== undefined) extraSettings.programName = String(programName);
      if (port !== undefined) {
        const n = Number(port);
        if (!Number.isNaN(n)) extraSettings.port = n;
      }
      if (appVersion !== undefined) extraSettings.appVersion = String(appVersion);
      if (soundEnabled !== undefined) extraSettings.soundEnabled = Boolean(soundEnabled);
      if (workStartTime !== undefined) extraSettings.workStartTime = String(workStartTime);
      if (workEndTime !== undefined) extraSettings.workEndTime = String(workEndTime);
      if (androidInstallUrl !== undefined) extraSettings.androidInstallUrl = String(androidInstallUrl);
      if (iosInstallUrl !== undefined) extraSettings.iosInstallUrl = String(iosInstallUrl);
      if (homepageUrl !== undefined) extraSettings.homepageUrl = String(homepageUrl);
      if (mainNotice !== undefined) extraSettings.mainNotice = String(mainNotice);

      updatedInvoiceSettings = await prisma.invoiceSettings.create({
        data: {
          companyName: companyName != null ? String(companyName).trim() || null : null,
          ceoName: ceoName != null ? String(ceoName).trim() || null : null,
          phone: phone != null ? String(phone).trim() || null : null,
          address: address != null ? String(address).trim() || null : null,
          ...(Object.keys(extraSettings).length > 0 && { extraSettings: extraSettings as Prisma.InputJsonValue }),
        },
      });
    }

    res.json({
      success: true,
      data: {
        id: updatedAdmin.email,
        email: updatedAdmin.email,
        name: '관리자',
        companyName: updatedInvoiceSettings.companyName ?? '',
        ceoName: updatedInvoiceSettings.ceoName ?? (updatedAdmin.name || '관리자'),
        phone: updatedInvoiceSettings.phone ?? '',
        tel: updatedInvoiceSettings.phone ?? '',
        programName: ((updatedInvoiceSettings.extraSettings as any)?.programName as string) ?? '로지소프트',
        port:
          ((updatedInvoiceSettings.extraSettings as any)?.port as number | undefined) ??
          Number(process.env.PORT || 5174),
        appVersion: ((updatedInvoiceSettings.extraSettings as any)?.appVersion as string) ?? '',
        soundEnabled: ((updatedInvoiceSettings.extraSettings as any)?.soundEnabled as boolean | undefined) ?? true,
        workStartTime: ((updatedInvoiceSettings.extraSettings as any)?.workStartTime as string) ?? '',
        workEndTime: ((updatedInvoiceSettings.extraSettings as any)?.workEndTime as string) ?? '',
        address: updatedInvoiceSettings.address ?? '',
        androidInstallUrl: ((updatedInvoiceSettings.extraSettings as any)?.androidInstallUrl as string) ?? '',
        iosInstallUrl: ((updatedInvoiceSettings.extraSettings as any)?.iosInstallUrl as string) ?? '',
        homepageUrl: ((updatedInvoiceSettings.extraSettings as any)?.homepageUrl as string) ?? '',
        mainNotice: ((updatedInvoiceSettings.extraSettings as any)?.mainNotice as string) ?? '',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
