/**
 * Copia os dados do casamento do CLIENTE para o casamento de TESTE, para que
 * mudanças possam ser validadas sem tocar em produção.
 *
 * Segurança: o destino é uma constante, toda escrita é filtrada por ele, e o
 * script aborta se o slug do destino não for o esperado. Origem é só leitura.
 *
 *   node scripts/clone-wedding-to-test.mjs             # dry-run
 *   node scripts/clone-wedding-to-test.mjs --apply     # copia (mantém o que já existe)
 *   node scripts/clone-wedding-to-test.mjs --apply --replace  # limpa o destino antes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SOURCE_WID = '771e4eca-45ae-41c8-8120-0cfef3699613'; // carla-e-ewerton (CLIENTE)
const TEST_WID = '290ececf-5dc1-48d2-86e5-8eec4a9cdda4'; // casal-wgj4s2 (TESTE)
const TEST_SLUG = 'casal-wgj4s2';

if (SOURCE_WID === TEST_WID) {
  console.error('ABORTADO: origem e destino são o mesmo casamento.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const replace = process.argv.includes('--replace');

// Trava: o destino tem que ser mesmo o casamento de teste.
const { data: dest, error: destErr } = await db
  .from('weddings').select('id, slug').eq('id', TEST_WID).maybeSingle();
if (destErr || !dest) {
  console.error('ABORTADO: casamento de destino não encontrado.', destErr?.message ?? '');
  process.exit(1);
}
if (dest.slug !== TEST_SLUG) {
  console.error(`ABORTADO: slug do destino é "${dest.slug}", esperado "${TEST_SLUG}".`);
  process.exit(1);
}

// Campos de apresentação. Fora: id, user_id, slug, created_at, e tudo que é
// credencial ou dado financeiro (Mercado Pago, chave PIX).
const WEDDING_FIELDS = [
  'couple_name', 'partner1_name', 'partner2_name', 'wedding_date', 'tagline', 'layout',
  'section_about', 'section_wedding_info', 'section_gifts', 'section_rsvp',
  'section_message_wall', 'section_gallery', 'section_video', 'section_dress_code',
  'section_virtual_house', 'hero_image_url', 'video_url',
  'ceremony_date', 'ceremony_time', 'ceremony_location', 'ceremony_address',
  'reception_location', 'reception_address', 'reception_time', 'same_location',
  'about_text', 'dress_code_text', 'colors_to_avoid', 'additional_info',
  'story_photo_1', 'story_photo_2', 'story_photo_3',
  'theme_color', 'theme_font', 'theme_decorations', 'background_color',
  'invite_message', 'public_message', 'allow_guest_count',
];
const GIFT_FIELDS = [
  'name', 'category', 'price', 'image_url', 'external_link',
  'is_open_price', 'is_vaquinha', 'stock', 'total_quotas',
];
const GUEST_FIELDS = ['name', 'phone', 'status'];

const { data: src } = await db
  .from('weddings').select(WEDDING_FIELDS.join(',')).eq('id', SOURCE_WID).single();
const { data: gifts } = await db
  .from('gifts').select(GIFT_FIELDS.join(',')).eq('wedding_id', SOURCE_WID);
const { data: guests } = await db
  .from('guests').select(GUEST_FIELDS.join(',')).eq('wedding_id', SOURCE_WID);

console.log(`origem  : ${SOURCE_WID} (somente leitura)`);
console.log(`destino : ${TEST_WID} (${dest.slug})`);
console.log(`presentes a copiar: ${gifts?.length ?? 0}`);
console.log(`convidados a copiar: ${guests?.length ?? 0}`);
console.log(`modo: ${apply ? (replace ? 'APPLY + REPLACE' : 'APPLY') : 'DRY-RUN'}`);

if (!apply) {
  console.log('\nDry-run. Nada foi escrito. Rode com --apply para copiar.');
  process.exit(0);
}

if (replace) {
  // Ambos os deletes são filtrados pelo destino. Nunca remova esse .eq().
  await db.from('gifts').delete().eq('wedding_id', TEST_WID);
  await db.from('guests').delete().eq('wedding_id', TEST_WID);
  console.log('destino limpo (gifts e guests do casamento de teste).');
}

const { error: upErr } = await db.from('weddings').update(src).eq('id', TEST_WID);
if (upErr) { console.error('erro ao atualizar o casamento de teste:', upErr.message); process.exit(1); }

if (gifts?.length) {
  const { error } = await db.from('gifts').insert(gifts.map((g) => ({ ...g, wedding_id: TEST_WID })));
  if (error) { console.error('erro ao inserir presentes:', error.message); process.exit(1); }
}
if (guests?.length) {
  const { error } = await db.from('guests').insert(guests.map((g) => ({ ...g, wedding_id: TEST_WID })));
  if (error) { console.error('erro ao inserir convidados:', error.message); process.exit(1); }
}

console.log('\nCópia concluída no casamento de teste.');
