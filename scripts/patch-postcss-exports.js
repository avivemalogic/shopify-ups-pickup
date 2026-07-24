'use strict';

const fs = require('fs');
const path = require('path');

const postcssDir = path.join(__dirname, '..', 'node_modules', 'postcss');
const postcssPkgPath = path.join(postcssDir, 'package.json');
const postcssJsPath = path.join(postcssDir, 'lib', 'postcss.js');

if (!fs.existsSync(postcssPkgPath)) {
    process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(postcssPkgPath, 'utf8'));

if (pkg.exports) {
    delete pkg.exports;
    fs.writeFileSync(postcssPkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

if (fs.existsSync(postcssJsPath)) {
    let postcssJs = fs.readFileSync(postcssJsPath, 'utf8');

    if (!postcssJs.includes('postcss.vendor =')) {
        const vendorShim = `
postcss.vendor = {
  unprefixed (prop) {
    return prop.replace(/^-\\w+-/, '')
  },
  prefixed (prop, prefix) {
    return \`-\${prefix}-\${prop}\`
  }
}
`;

        postcssJs = postcssJs.replace(
            'LazyResult.registerPostcss(postcss)',
            `${vendorShim}\nLazyResult.registerPostcss(postcss)`
        );
        fs.writeFileSync(postcssJsPath, postcssJs);
    }
}
