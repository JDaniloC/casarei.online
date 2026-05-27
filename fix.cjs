const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf-8');

// Replace all `:root[data-attr="val"] {` with `:root[data-attr="val"], [data-attr="val"] {`
css = css.replace(/:root\[(data-[^\]]+)\]\s*\{/g, ':root[$1],\n  [$1] {');

fs.writeFileSync('src/index.css', css);
console.log('Successfully fixed index.css selectors!');
