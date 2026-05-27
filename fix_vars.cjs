const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

// ---- mercadoPagoPublicKey ----
// Line 586: public_key: mercadoPagoPublicKey,
code = code.replace('public_key: mercadoPagoPublicKey,', 'public_key: config.mercadoPagoPublicKey || "",');
// Line 2018: value={mercadoPagoPublicKey}
code = code.replace('value={mercadoPagoPublicKey}', 'value={config.mercadoPagoPublicKey || ""}');
// Line 2047: disabled={mpValidating || !mercadoPagoPublicKey || !mercadoPagoAccessToken}
code = code.replace('disabled={mpValidating || !mercadoPagoPublicKey || !mercadoPagoAccessToken}', 'disabled={mpValidating || !config.mercadoPagoPublicKey || !mercadoPagoAccessToken}');
// onChange for mercadoPagoPublicKey input
code = code.replace(
  /onChange=\{.*?setMercadoPagoPublicKey\(e\.target\.value\).*?\}/,
  'onChange={(e) => updateConfig({ mercadoPagoPublicKey: e.target.value })}'
);

// ---- paymentCreditCard, paymentPix, paymentBoleto ----
// checked={paymentCreditCard}
code = code.replace('checked={paymentCreditCard}', 'checked={config.paymentCreditCard ?? true}');
code = code.replace('checked={paymentPix}', 'checked={config.paymentPix ?? true}');
code = code.replace('checked={paymentBoleto}', 'checked={config.paymentBoleto ?? true}');
// onCheckedChange handlers
code = code.replace(
  /onCheckedChange=\{.*?setPaymentCreditCard\(checked as boolean\).*?\}/,
  'onCheckedChange={(checked) => updateConfig({ paymentCreditCard: checked as boolean })}'
);
code = code.replace(
  /onCheckedChange=\{.*?setPaymentPix\(checked as boolean\).*?\}/,
  'onCheckedChange={(checked) => updateConfig({ paymentPix: checked as boolean })}'
);
code = code.replace(
  /onCheckedChange=\{.*?setPaymentBoleto\(checked as boolean\).*?\}/,
  'onCheckedChange={(checked) => updateConfig({ paymentBoleto: checked as boolean })}'
);
// {paymentCreditCard && (
code = code.replace('{paymentCreditCard &&', '{config.paymentCreditCard &&');
// {!paymentCreditCard && !paymentPix && !paymentBoleto && (
code = code.replace('{!paymentCreditCard && !paymentPix && !paymentBoleto && (', '{!config.paymentCreditCard && !config.paymentPix && !config.paymentBoleto && (');

// ---- maxInstallments ----
code = code.replace('value={maxInstallments.toString()}', 'value={(config.maxInstallments ?? 12).toString()}');
code = code.replace(
  /onValueChange=\{.*?setMaxInstallments\(parseInt\(val\)\).*?\}/,
  'onValueChange={(val) => updateConfig({ maxInstallments: parseInt(val) })}'
);

// ---- storyPhoto1/2/3 ----
// In handleSave: storyPhotos: [storyPhoto1, storyPhoto2, storyPhoto3].filter(Boolean)
code = code.replace(
  'storyPhotos: [storyPhoto1, storyPhoto2, storyPhoto3].filter(Boolean)',
  'storyPhotos: [config.storyPhotos[0] || "", config.storyPhotos[1] || "", config.storyPhotos[2] || ""].filter(Boolean)'
);
// JSX value and onChange for story photos
code = code.replace('value={storyPhoto1}', 'value={config.storyPhotos[0] || ""}');
code = code.replace('value={storyPhoto2}', 'value={config.storyPhotos[1] || ""}');
code = code.replace('value={storyPhoto3}', 'value={config.storyPhotos[2] || ""}');
// onChange handlers
code = code.replace(
  /onChange=\{.*?setStoryPhoto1\(e\.target\.value\).*?\}/,
  'onChange={(e) => updateConfig({ storyPhotos: [e.target.value, config.storyPhotos[1] || "", config.storyPhotos[2] || ""] })}'
);
code = code.replace(
  /onChange=\{.*?setStoryPhoto2\(e\.target\.value\).*?\}/,
  'onChange={(e) => updateConfig({ storyPhotos: [config.storyPhotos[0] || "", e.target.value, config.storyPhotos[2] || ""] })}'
);
code = code.replace(
  /onChange=\{.*?setStoryPhoto3\(e\.target\.value\).*?\}/,
  'onChange={(e) => updateConfig({ storyPhotos: [config.storyPhotos[0] || "", config.storyPhotos[1] || "", e.target.value] })}'
);
// {storyPhoto1 && (
code = code.replace('{storyPhoto1 && (', '{config.storyPhotos[0] && (');
code = code.replace('{storyPhoto2 && (', '{config.storyPhotos[1] && (');
code = code.replace('{storyPhoto3 && (', '{config.storyPhotos[2] && (');
// <img src={storyPhoto1}
code = code.replace('src={storyPhoto1}', 'src={config.storyPhotos[0]}');
code = code.replace('src={storyPhoto2}', 'src={config.storyPhotos[1]}');
code = code.replace('src={storyPhoto3}', 'src={config.storyPhotos[2]}');

// ---- manualPixType ----
code = code.replace('value={manualPixType}', 'value={config.manualPixType || "cpf"}');
code = code.replace(
  /onValueChange=\{.*?setManualPixType\(val\).*?\}/,
  'onValueChange={(val) => updateConfig({ manualPixType: val })}'
);

// ---- manualPixKey ----
code = code.replace('value={manualPixKey}', 'value={config.manualPixKey || ""}');
code = code.replace(
  /onChange=\{.*?setManualPixKey\(e\.target\.value\).*?\}/,
  'onChange={(e) => updateConfig({ manualPixKey: e.target.value })}'
);

// ---- manualPixQrImageUrl ----
code = code.replace('{manualPixQrImageUrl && (', '{config.manualPixQrImageUrl && (');
code = code.replace('src={manualPixQrImageUrl}', 'src={config.manualPixQrImageUrl}');
// setManualPixQrImageUrl(publicUrl) - in uploadQR function
code = code.replace(
  /setManualPixQrImageUrl\(publicUrl\)/g,
  'updateConfig({ manualPixQrImageUrl: publicUrl })'
);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
console.log('Done! Fixed all stray variable references.');
