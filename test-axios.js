try {
    const buildFullPath = require('axios/lib/core/buildFullPath');
    console.log('Success: loaded buildFullPath');
} catch (e) {
    console.error('Failed to load:', e.message);
    if (e.code) console.error('Code:', e.code);
}
