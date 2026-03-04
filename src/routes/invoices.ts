import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// docNo 6자리 자동 생성
async function generateDocNo(): Promise<string> {
  const last = await prisma.invoice.findFirst({
    orderBy: { docNo: 'desc' },
  });
  const next = last ? parseInt(last.docNo, 10) + 1 : 1;
  return String(next).padStart(6, '0');
}

// GET /invoices/settings — :id보다 먼저
router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.invoiceSettings.findFirst();
    if (!settings) {
      settings = await prisma.invoiceSettings.create({
        data: {},
      });
    }
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /invoices/settings
router.put('/settings', async (req, res) => {
  try {
    const body = req.body;
    let settings = await prisma.invoiceSettings.findFirst();
    if (!settings) {
      settings = await prisma.invoiceSettings.create({
        data: {},
      });
    }

    settings = await prisma.invoiceSettings.update({
      where: { id: settings.id },
      data: {
        ...(body.bizNo !== undefined && { bizNo: body.bizNo }),
        ...(body.companyName !== undefined && { companyName: body.companyName }),
        ...(body.ceoName !== undefined && { ceoName: body.ceoName }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.businessType !== undefined && { businessType: body.businessType }),
        ...(body.businessCategory !== undefined && { businessCategory: body.businessCategory }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(typeof body.itemKorean === 'boolean' && { itemKorean: body.itemKorean }),
        ...(typeof body.specKorean === 'boolean' && { specKorean: body.specKorean }),
        ...(typeof body.blankZeroQty === 'boolean' && { blankZeroQty: body.blankZeroQty }),
        ...(typeof body.blankZeroSupply === 'boolean' && { blankZeroSupply: body.blankZeroSupply }),
        ...(typeof body.printSpecAsUnit === 'boolean' && { printSpecAsUnit: body.printSpecAsUnit }),
        ...(typeof body.printTradeDate === 'boolean' && { printTradeDate: body.printTradeDate }),
        ...(typeof body.noDocNo === 'boolean' && { noDocNo: body.noDocNo }),
        ...(typeof body.printFooter1 === 'boolean' && { printFooter1: body.printFooter1 }),
        ...(body.printFooter1Text !== undefined && { printFooter1Text: body.printFooter1Text }),
        ...(typeof body.printFooter2 === 'boolean' && { printFooter2: body.printFooter2 }),
        ...(body.printFooter2Text !== undefined && { printFooter2Text: body.printFooter2Text }),
      },
    });
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /invoices
router.get('/', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { items: true },
      orderBy: { tradeDate: 'desc' },
    });
    res.json({ success: true, data: invoices });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /invoices/:id
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /invoices
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const items = body.items ?? [];
    const type = body.type ?? 'tax';

    let totalSupply = 0;
    let totalVat = 0;
    const createdItems = [];

    for (const it of items) {
      const supplyAmt = it.unitPrice * (it.quantity ?? 1);
      const vatRate = it.vatRate ?? 10;
      const vatAmt = Math.floor(supplyAmt * (vatRate / 100));
      totalSupply += supplyAmt;
      totalVat += vatAmt;
      createdItems.push({
        name: it.name,
        spec: it.spec,
        unitPrice: it.unitPrice ?? 0,
        quantity: it.quantity ?? 1,
        supplyAmt,
        vatRate,
        vatAmt,
      });
    }

    const totalAmt = totalSupply + totalVat;
    const docNo = body.docNo ?? (await generateDocNo());

    const invoice = await prisma.invoice.create({
      data: {
        docNo,
        tradeDate: body.tradeDate ?? new Date().toISOString().slice(0, 10),
        type,
        totalSupply,
        totalVat,
        totalAmt,
        vatIncluded: body.vatIncluded ?? false,
        memo: body.memo,
        items: { create: createdItems },
      },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: invoice });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /invoices/:id
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const items = body.items;

    if (items && Array.isArray(items)) {
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: req.params.id },
      });

      let totalSupply = 0;
      let totalVat = 0;
      for (const it of items) {
        const supplyAmt = it.unitPrice * (it.quantity ?? 1);
        const vatRate = it.vatRate ?? 10;
        const vatAmt = Math.floor(supplyAmt * (vatRate / 100));
        totalSupply += supplyAmt;
        totalVat += vatAmt;
      }
      const totalAmt = totalSupply + totalVat;

      await prisma.invoice.update({
        where: { id: req.params.id },
        data: {
          ...(body.tradeDate && { tradeDate: body.tradeDate }),
          ...(body.type && { type: body.type }),
          totalSupply,
          totalVat,
          totalAmt,
          ...(typeof body.vatIncluded === 'boolean' && { vatIncluded: body.vatIncluded }),
          ...(body.memo !== undefined && { memo: body.memo }),
          items: {
            create: items.map((it: { name: string; spec?: string; unitPrice: number; quantity?: number; vatRate?: number }) => {
              const supplyAmt = (it.unitPrice ?? 0) * (it.quantity ?? 1);
              const vatRate = it.vatRate ?? 10;
              return {
                name: it.name,
                spec: it.spec,
                unitPrice: it.unitPrice ?? 0,
                quantity: it.quantity ?? 1,
                supplyAmt,
                vatRate,
                vatAmt: Math.floor(supplyAmt * (vatRate / 100)),
              };
            }),
          },
        },
      });
    } else {
      await prisma.invoice.update({
        where: { id: req.params.id },
        data: {
          ...(body.tradeDate && { tradeDate: body.tradeDate }),
          ...(body.type && { type: body.type }),
          ...(body.totalSupply !== undefined && { totalSupply: body.totalSupply }),
          ...(body.totalVat !== undefined && { totalVat: body.totalVat }),
          ...(body.totalAmt !== undefined && { totalAmt: body.totalAmt }),
          ...(typeof body.vatIncluded === 'boolean' && { vatIncluded: body.vatIncluded }),
          ...(body.memo !== undefined && { memo: body.memo }),
        },
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    res.json({ success: true, data: invoice });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /invoices/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.invoice.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
