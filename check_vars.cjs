const fs = require('fs');
const code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
const lines = code.split('\n');

const badVars = [
  'mercadoPagoPublicKey',
  'paymentCreditCard',
  'paymentPix',
  'paymentBoleto',
  'maxInstallments',
  'storyPhoto1',
  'storyPhoto2',
  'storyPhoto3',
  'manualPixType',
  'manualPixKey',
  'manualPixQrImageUrl',
  'whatsappNumber',
  'initialLoaded',
];

badVars.forEach(v => {
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (
      line.includes(v) &&
      !line.includes('config.' + v) &&
      !trimmed.startsWith('//')
    ) {
      console.log('[' + v + '] L' + (i+1) + ': ' + trimmed.substring(0, 120));
    }
  });
});
