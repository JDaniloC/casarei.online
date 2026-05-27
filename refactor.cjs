const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

// 1. Remove initialLoaded
code = code.replace(/const \[initialLoaded, setInitialLoaded\] = useState<boolean>\(\(\) => sessionStorage\.getItem\("dashboard_initial_loaded"\) === "true"\);\n/g, '');

// 2. Remove local states
const statesToRemove = [
  /const \[mercadoPagoPublicKey, setMercadoPagoPublicKey\] = useState\(""\);\n/g,
  /const \[paymentCreditCard, setPaymentCreditCard\] = useState\(true\);\n/g,
  /const \[paymentPix, setPaymentPix\] = useState\(true\);\n/g,
  /const \[paymentBoleto, setPaymentBoleto\] = useState\(true\);\n/g,
  /const \[maxInstallments, setMaxInstallments\] = useState\(12\);\n/g,
  /const \[storyPhoto1, setStoryPhoto1\] = useState\(""\);\n/g,
  /const \[storyPhoto2, setStoryPhoto2\] = useState\(""\);\n/g,
  /const \[storyPhoto3, setStoryPhoto3\] = useState\(""\);\n/g,
  /const \[manualPixType, setManualPixType\] = useState<string>\("cpf"\);\n/g,
  /const \[manualPixKey, setManualPixKey\] = useState<string>\(""\);\n/g,
  /const \[manualPixQrImageUrl, setManualPixQrImageUrl\] = useState<string>\(""\);\n/g,
  /const \[whatsappNumber, setWhatsappNumber\] = useState\(""\);\n/g,
];

statesToRemove.forEach(regex => {
  code = code.replace(regex, '');
});

// 3. Update useEffect
code = code.replace(/if \(!user \|\| initialLoaded\) return;/g, 'if (!user || config.isLoaded) return;');

// 4. Update loadWeddingData parsing
let updateConfigMatch = code.match(/updateConfig\(\{([\s\S]*?)themeDecorations:\s*\(wedding as any\)\.theme_decorations \?\? true,\n\s*\}\);/);
if (updateConfigMatch) {
  let newUpdateConfig = updateConfigMatch[0].replace(/\n\s*\}\);/, `\n          mercadoPagoPublicKey: wedding.mercado_pago_public_key || "",
          paymentCreditCard: (wedding as any).payment_credit_card ?? true,
          paymentPix: (wedding as any).payment_pix ?? true,
          paymentBoleto: (wedding as any).payment_boleto ?? true,
          maxInstallments: (wedding as any).max_installments ?? 12,
          manualPixType: (wedding as any).manual_pix_type || "cpf",
          manualPixKey: (wedding as any).manual_pix_key || "",
          manualPixQrImageUrl: (wedding as any).manual_pix_qr_image_url || "",
          isLoaded: true,
        });`);
  code = code.replace(updateConfigMatch[0], newUpdateConfig);
}

// 5. Remove setters from useEffect
const settersToRemove = [
  /setMercadoPagoPublicKey\(.*?\);\n/g,
  /setPaymentCreditCard\(.*?\);\n/g,
  /setPaymentPix\(.*?\);\n/g,
  /setPaymentBoleto\(.*?\);\n/g,
  /setMaxInstallments\(.*?\);\n/g,
  /setManualPixType\(.*?\);\n/g,
  /setManualPixKey\(.*?\);\n/g,
  /setManualPixQrImageUrl\(.*?\);\n/g,
  /setStoryPhoto1\(.*?\);\n/g,
  /setStoryPhoto2\(.*?\);\n/g,
  /setStoryPhoto3\(.*?\);\n/g,
  /setWhatsappNumber\(.*?\);\n/g,
  /setInitialLoaded\(true\);\n/g,
  /sessionStorage\.setItem\("dashboard_initial_loaded", "true"\);\n/g,
];

settersToRemove.forEach(regex => {
  code = code.replace(regex, '');
});

// 6. Update handleSave
code = code.replace(/mercado_pago_public_key: mercadoPagoPublicKey \|\| null,/g, 'mercado_pago_public_key: config.mercadoPagoPublicKey || null,');
code = code.replace(/payment_credit_card: paymentCreditCard,/g, 'payment_credit_card: config.paymentCreditCard ?? true,');
code = code.replace(/payment_pix: paymentPix,/g, 'payment_pix: config.paymentPix ?? true,');
code = code.replace(/payment_boleto: paymentBoleto,/g, 'payment_boleto: config.paymentBoleto ?? true,');
code = code.replace(/max_installments: maxInstallments,/g, 'max_installments: config.maxInstallments ?? 12,');
code = code.replace(/manual_pix_type: manualPixType,/g, 'manual_pix_type: config.manualPixType || "cpf",');
code = code.replace(/manual_pix_key: manualPixKey \|\| null,/g, 'manual_pix_key: config.manualPixKey || null,');
code = code.replace(/manual_pix_qr_image_url: manualPixQrImageUrl \|\| null,/g, 'manual_pix_qr_image_url: config.manualPixQrImageUrl || null,');
code = code.replace(/story_photo_1: storyPhoto1 \|\| null,/g, 'story_photo_1: config.storyPhotos[0] || null,');
code = code.replace(/story_photo_2: storyPhoto2 \|\| null,/g, 'story_photo_2: config.storyPhotos[1] || null,');
code = code.replace(/story_photo_3: storyPhoto3 \|\| null,/g, 'story_photo_3: config.storyPhotos[2] || null,');
code = code.replace(/whatsapp_number: whatsappNumber \|\| null,/g, 'whatsapp_number: config.whatsappNumber || null,');

// 7. Update validateMercadoPago
code = code.replace(/if \(!mercadoPagoPublicKey \|\| !mercadoPagoAccessToken\)/g, 'if (!config.mercadoPagoPublicKey || !mercadoPagoAccessToken)');
code = code.replace(/publicKey: mercadoPagoPublicKey,/g, 'publicKey: config.mercadoPagoPublicKey || "",');

// 8. Replace form fields values & onChange
// For variables that were global replacing the names in JSX
code = code.replace(/value=\{mercadoPagoPublicKey\}/g, 'value={config.mercadoPagoPublicKey || ""}');
code = code.replace(/onChange=\{\(e\) => setMercadoPagoPublicKey\(e\.target\.value\)\}/g, 'onChange={(e) => updateConfig({ mercadoPagoPublicKey: e.target.value })}');

code = code.replace(/checked=\{paymentCreditCard\}/g, 'checked={config.paymentCreditCard}');
code = code.replace(/onCheckedChange=\{\(checked\) => setPaymentCreditCard\(checked as boolean\)\}/g, 'onCheckedChange={(checked) => updateConfig({ paymentCreditCard: checked as boolean })}');

code = code.replace(/checked=\{paymentPix\}/g, 'checked={config.paymentPix}');
code = code.replace(/onCheckedChange=\{\(checked\) => setPaymentPix\(checked as boolean\)\}/g, 'onCheckedChange={(checked) => updateConfig({ paymentPix: checked as boolean })}');

code = code.replace(/checked=\{paymentBoleto\}/g, 'checked={config.paymentBoleto}');
code = code.replace(/onCheckedChange=\{\(checked\) => setPaymentBoleto\(checked as boolean\)\}/g, 'onCheckedChange={(checked) => updateConfig({ paymentBoleto: checked as boolean })}');

code = code.replace(/value=\{maxInstallments\.toString\(\)\}/g, 'value={(config.maxInstallments || 12).toString()}');
code = code.replace(/onValueChange=\{\(val\) => setMaxInstallments\(parseInt\(val\)\)\}/g, 'onValueChange={(val) => updateConfig({ maxInstallments: parseInt(val) })}');

code = code.replace(/value=\{manualPixType\}/g, 'value={config.manualPixType || "cpf"}');
code = code.replace(/onValueChange=\{\(val\) => setManualPixType\(val\)\}/g, 'onValueChange={(val) => updateConfig({ manualPixType: val })}');

code = code.replace(/value=\{manualPixKey\}/g, 'value={config.manualPixKey || ""}');
code = code.replace(/onChange=\{\(e\) => setManualPixKey\(e\.target\.value\)\}/g, 'onChange={(e) => updateConfig({ manualPixKey: e.target.value })}');

code = code.replace(/whatsappNumber/g, 'config.whatsappNumber');
code = code.replace(/setWhatsappNumber\(e\.target\.value\)/g, 'updateConfig({ whatsappNumber: e.target.value })');

// For story photos, the original code used setStoryPhoto1, etc.
code = code.replace(/value=\{storyPhoto1\}/g, 'value={config.storyPhotos[0] || ""}');
code = code.replace(/onChange=\{\(e\) => setStoryPhoto1\(e\.target\.value\)\}/g, 'onChange={(e) => updateConfig({ storyPhotos: [e.target.value, config.storyPhotos[1] || "", config.storyPhotos[2] || ""] })}');

code = code.replace(/value=\{storyPhoto2\}/g, 'value={config.storyPhotos[1] || ""}');
code = code.replace(/onChange=\{\(e\) => setStoryPhoto2\(e\.target\.value\)\}/g, 'onChange={(e) => updateConfig({ storyPhotos: [config.storyPhotos[0] || "", e.target.value, config.storyPhotos[2] || ""] })}');

code = code.replace(/value=\{storyPhoto3\}/g, 'value={config.storyPhotos[2] || ""}');
code = code.replace(/onChange=\{\(e\) => setStoryPhoto3\(e\.target\.value\)\}/g, 'onChange={(e) => updateConfig({ storyPhotos: [config.storyPhotos[0] || "", config.storyPhotos[1] || "", e.target.value] })}');

code = code.replace(/setManualPixQrImageUrl\(publicUrl\)/g, 'updateConfig({ manualPixQrImageUrl: publicUrl })');
code = code.replace(/manualPixQrImageUrl/g, 'config.manualPixQrImageUrl');
code = code.replace(/config\.config\.manualPixQrImageUrl/g, 'config.manualPixQrImageUrl'); // fix any double config

// fix remaining mercadoPagoPublicKey if any was missed
code = code.replace(/if \(mercadoPagoPublicKey/g, 'if (config.mercadoPagoPublicKey');

fs.writeFileSync('src/pages/Dashboard.tsx', code);
console.log('Refactor complete.');
