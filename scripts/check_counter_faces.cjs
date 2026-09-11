const sharp = require('sharp');

async function checkFaces() {
  const metaSink = await sharp('public/assets/iso/furniture_sink_counter.png').metadata();
  const metaCab = await sharp('public/assets/iso/furniture_kitchen_cabinet.png').metadata();
  const metaStove = await sharp('public/assets/iso/furniture_stove.png').metadata();
  const metaDish = await sharp('public/assets/iso/furniture_dishwasher.png').metadata();

  console.log('sink_counter:', metaSink.width, 'x', metaSink.height);
  console.log('kitchen_cabinet:', metaCab.width, 'x', metaCab.height);
  console.log('stove:', metaStove.width, 'x', metaStove.height);
  console.log('dishwasher:', metaDish.width, 'x', metaDish.height);
}

checkFaces().catch(console.error);
