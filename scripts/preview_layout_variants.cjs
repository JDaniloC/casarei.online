const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const path = require('path');

const variants = [
  {
    name: 'variant_A',
    description: 'Bancada contínua no fundo (geladeira, pia 2x1, fogão), ilha gourmet (2,2) com microondas, lava-louças (0,1), mesa (0,2)',
    positions: {
      fridge: { x: 0, y: 0 },
      dishwasher: { x: 0, y: 1 },
      sink_counter: { x: 1, y: 0 },
      coffee_maker: { x: 1, y: 0 },
      air_fryer: { x: 2, y: 0 },
      stove: { x: 3, y: 0 },
      kitchen_cabinet: { x: 2, y: 2 },
      microwave: { x: 3, y: 2 },
      dining_table: { x: 0, y: 2 },
      // Banheiro
      shower: { x: 4, y: 0 },
      bathroom_sink: { x: 5, y: 0 },
      toilet: { x: 5, y: 1 },
      // Quarto
      bed: { x: 6, y: 0 },
      wardrobe: { x: 8, y: 0 },
      dresser: { x: 8, y: 2 },
      vanity: { x: 6, y: 3 },
      // Lavanderia
      washing_machine: { x: 0, y: 4 },
      dryer: { x: 1, y: 4 },
      laundry_sink: { x: 0, y: 6 },
      // Sala
      tv_rack: { x: 6, y: 4 },
      sofa: { x: 3, y: 5 },
      coffee_table: { x: 5, y: 5 },
      armchair: { x: 7, y: 5 },
      robot_vacuum: { x: 4, y: 6 },
      generic: { x: 8, y: 4 }
    }
  },
  {
    name: 'variant_B',
    description: 'Fundo clássico (geladeira, lava-louças, fogão), ilha da pia (1,1) e armário com microondas (2,2), mesa (0,2)',
    positions: {
      fridge: { x: 0, y: 0 },
      dishwasher: { x: 1, y: 0 },
      stove: { x: 2, y: 0 },
      sink_counter: { x: 0, y: 2 },
      coffee_maker: { x: 0, y: 2 },
      air_fryer: { x: 1, y: 2 },
      kitchen_cabinet: { x: 2, y: 1 },
      microwave: { x: 3, y: 1 },
      dining_table: { x: 1, y: 2 }, // wait, overlaps with sink
      // Banheiro
      shower: { x: 4, y: 0 },
      bathroom_sink: { x: 5, y: 0 },
      toilet: { x: 5, y: 2 },
      // Quarto
      bed: { x: 6, y: 0 },
      wardrobe: { x: 8, y: 0 },
      dresser: { x: 8, y: 2 },
      vanity: { x: 6, y: 2 },
      // Lavanderia
      washing_machine: { x: 0, y: 4 },
      dryer: { x: 1, y: 4 },
      laundry_sink: { x: 0, y: 5 },
      // Sala
      tv_rack: { x: 5, y: 4 },
      sofa: { x: 3, y: 5 },
      coffee_table: { x: 4, y: 6 },
      armchair: { x: 7, y: 4 },
      robot_vacuum: { x: 5, y: 6 },
      generic: { x: 7, y: 5 }
    }
  }
];

console.log('Variants defined:', variants.map(v => v.name));
