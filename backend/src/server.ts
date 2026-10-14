import 'dotenv/config';
import express from 'express';
// Patches Express 4's router so a rejected promise from an async route handler
// reaches errorHandler via next(err) instead of crashing the whole process as
// an unhandled rejection (confirmed live under concurrent load while adding
// atomic series-number allocation — a single duplicate-key race would otherwise
// take the entire backend down for every user, not just fail that one request).
import 'express-async-errors';
import cors from 'cors';
import './models/index';
import { errorHandler } from './middleware/errorHandler';

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import invitationRoutes from './routes/invitations';
import poLineRoutes from './routes/poLines';
import invoiceRoutes from './routes/invoices';
import deliveryNoteRoutes from './routes/deliveryNotes';
import paymentRoutes from './routes/payments';
import issueRoutes from './routes/issues';
import seriesConfigRoutes from './routes/seriesConfig';
import customerSeriesBookRoutes from './routes/customerSeriesBooks';
import attachmentRoutes, { ATTACHMENTS_DIR } from './routes/attachments';
import databaseRoutes from './routes/database';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// CORS_ORIGIN can be a single origin or a comma-separated list (e.g. the
// production domain plus its www variant, or a staging domain) — `cors`
// only accepts one exact string per request, so a plain string here would
// force picking just one and breaking the others.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // no Origin header (curl, server-to-server, same-origin) — allow
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} is not allowed`));
      }
    },
  })
);
app.use(express.json({ limit: '50mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/po-lines', poLineRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/delivery-notes', deliveryNoteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/series-config', seriesConfigRoutes);
app.use('/api/customer-series-books', customerSeriesBookRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/attachments', express.static(ATTACHMENTS_DIR));
app.use('/api/database', databaseRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`FAMOLA ERP backend listening on http://localhost:${PORT}`);
});
