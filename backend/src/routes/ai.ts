import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const fmt = (n: unknown) => (Number(n) || 0).toLocaleString();

let aiClient: any = null;
async function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function buildFallbackReport(moduleLabel: string, unitLabel: string, m: any) {
  const totalVal = fmt(m.totalFinancialValue);
  const poVal = fmt(m.totalPoCommitted);
  const compRate = m.completionRate || 0;
  const openIss = m.openIssues || 0;
  const unit = unitLabel.toLowerCase();
  return {
    reportTitle: `Executive Management Audit & Performance Report: ${moduleLabel}`,
    executiveNarrative: `This management report provides an operational and financial performance audit of ${moduleLabel} across ${m.totalCustomers || 0} customer accounts. Total executed value stands at TZS ${totalVal} against active Purchase Order commitments of TZS ${poVal}, resulting in an operational variance of TZS ${fmt(m.variance)}.\n\nFrom a document integrity and audit standpoint, tracking covers ${m.totalBooks || 0} physical 50-leaflet series books. Overall leaflet sequence completion is currently ${compRate}%, with ${fmt(m.totalRecorded)} leaves verified and recorded in the database, while ${fmt(m.totalMissing)} leaf slots remain unrecorded across active book ranges.\n\nRegarding quality control and exception tracking, ${m.totalIssues || 0} issues have been logged across customer files, of which ${openIss} require active management resolution. Immediate operational focus is required on accounts with missing leaflets and outstanding reconciliation gaps.`,
    operationalHighlights: [
      `Achieved TZS ${totalVal} in total verified ${unit} volume across active customer accounts.`,
      `Maintained a ${compRate}% sequence completion rate across ${m.totalBooks || 0} physical 50-leaflet books.`,
      `${fmt(m.totalRecorded)} physical leaves accounted for, with ${fmt(m.totalMissing)} gaps flagged for immediate physical audit.`,
      `Logged ${openIss} active exceptions requiring cross-departmental coordination between operations, audit, and finance.`,
    ],
    sequenceAuditInsights: 'The 50-leaflet tracker audit establishes verifiable physical continuity across serial registers. Books showing complete 50/50 retention demonstrate disciplined warehouse and billing recordkeeping. For books exhibiting missing numbers within the sequence, reconciliation prevents skipped leaf numbers and maintains strict audit readiness.',
    reconciliationAssessment: `Comparing Purchase Order commitments of TZS ${poVal} against recorded ${unit} values of TZS ${totalVal} highlights account-level fulfillment dynamics. Accounts with positive fulfillment indicate on-schedule contract execution, while substantial variances require verification against outstanding delivery orders or customer credit terms.`,
    issuesAndRisksSummary: `There are currently ${m.totalIssues || 0} documented issues on record (${openIss} pending/open). High-priority exceptions center around unit price discrepancies, unlinked PO lines, and missing physical delivery verification notes.`,
    strategicRecommendations: [
      'Mandate a weekly missing-leaf audit review for customer books displaying incomplete sequence slots.',
      'Reconcile uninvoiced and undelivered Purchase Order line items prior to month-end financial closing.',
      "Assign priority review to open issues flagged as 'PENDING' to accelerate billing dispute resolutions.",
      'Export and archive quarterly management audit PDFs for executive review and statutory compliance.',
    ],
  };
}

router.post('/management-report', async (req, res) => {
  const {
    moduleType = 'INVOICE',
    overallMetrics = {},
    customerBooks = [],
    customerReconciliations = [],
    customerIssues = [],
  } = req.body || {};

  const moduleLabel = moduleType === 'INVOICE' ? 'Invoices' : moduleType === 'DELIVERY' ? 'Delivery Notes' : 'Payments & Collections';
  const unitLabel = moduleType === 'INVOICE' ? 'Billed' : moduleType === 'DELIVERY' ? 'Delivered' : 'Settled';

  const ai = await getAIClient();
  if (ai) {
    const prompt = `You are the Senior Executive Management Consultant and Financial Auditor for FAMOLA ERP.
Generate an executive-level Management Report Narrative for the **${moduleLabel}** operations (currency: TZS).

Metrics: ${JSON.stringify(overallMetrics)}
Top customer performance: ${JSON.stringify(customerBooks.slice(0, 10))}
PO reconciliation sample: ${JSON.stringify(customerReconciliations.slice(0, 10))}
Issues sample: ${JSON.stringify(customerIssues.slice(0, 8))}

Return a raw JSON object (no markdown, no backticks) with exactly these keys:
reportTitle (string), executiveNarrative (3 paragraphs, string), operationalHighlights (4 strings), sequenceAuditInsights (string), reconciliationAssessment (string), issuesAndRisksSummary (string), strategicRecommendations (4 strings).`;
    try {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      return res.json({ success: true, aiGenerated: true, data: JSON.parse((response.text || '{}').trim()) });
    } catch (err: any) {
      console.warn('Gemini generation failed, using algorithmic report:', err?.message);
    }
  }

  res.json({ success: true, aiGenerated: false, data: buildFallbackReport(moduleLabel, unitLabel, overallMetrics) });
});

export default router;
