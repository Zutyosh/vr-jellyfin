
const fs = require('fs');
const path = require('path');

const axiosPackagePath = path.resolve(__dirname, '../node_modules/axios/package.json');

if (fs.existsSync(axiosPackagePath)) {
    const pkg = require(axiosPackagePath);
    if (pkg.exports) {
        let modified = false;
        if (!pkg.exports['./lib/core/buildFullPath']) {
            pkg.exports['./lib/core/buildFullPath'] = './lib/core/buildFullPath.js';
            modified = true;
        }
        // Also add buildURL just in case, as it appeared in grep
        if (!pkg.exports['./lib/helpers/buildURL']) {
            pkg.exports['./lib/helpers/buildURL'] = './lib/helpers/buildURL.js';
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(axiosPackagePath, JSON.stringify(pkg, null, 2) + '\n');
            console.log('Fixed axios exports in package.json');
        } else {
            console.log('Axios exports already fixed');
        }
    }
} else {
    console.log('Axios package.json not found');
}
