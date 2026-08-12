const path = require('node:path');
const { rcedit } = require('rcedit');

// Set the packaged exe's icon/version without invoking electron-builder's
// winCodeSign tool (which needs admin to extract). Runs after the app dir
// is packaged, before the NSIS installer is built.
exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const exePath = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(packager.projectDir, 'assets', 'icons', 'ds5dongle.ico');
  try {
    await rcedit(exePath, { icon: iconPath });
    console.log(`[afterPack] set exe icon: ${iconPath}`);
  } catch (error) {
    console.error('[afterPack] rcedit failed:', error && error.message ? error.message : error);
  }
};
