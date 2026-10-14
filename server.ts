import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processSaleWithGemini } from './src/server/parseSaleLogic.ts';
import { processInvoiceWithGemini } from './src/server/parseInvoiceLogic.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

// API Endpoint for Gemini NLP parsing
app.post('/api/gemini/parse-sale', async (req, res) => {
  try {
    const result = await processSaleWithGemini(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error), fallback: true });
  }
});

// API Endpoint for Gemini Invoice photo/text parsing
app.post('/api/gemini/parse-invoice', async (req, res) => {
  try {
    const result = await processInvoiceWithGemini(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error), fallback: true });
  }
});

// Serve Vite build in production
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.resolve(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
