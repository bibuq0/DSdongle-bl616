const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { rcedit } = require('rcedit');
const appPackage = require('../package.json');

function gitValue(repoDir, args, fallback = 'unknown') {
  try {
    return execSync(`git ${args}`, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function sourceNotice(repoDir) {
  const commit = gitValue(repoDir, 'rev-parse HEAD');
  const dirty = gitValue(repoDir, 'status --porcelain', '') ? 'yes' : 'no';
  return [
    'DS5 Bridge source code:',
    'https://github.com/SundayMoments/DS5_Bridge',
    '',
    `This binary release corresponds to commit: ${commit}`,
    `Working tree dirty at build time: ${dirty}`,
    '',
    'License:',
    'GNU Affero General Public License v3.0 only',
    'See LICENSE and NOTICE.'
  ].join('\n') + '\n';
}

exports.default = async function afterPack(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const repoDir = path.resolve(__dirname, '..', '..');
  const appIcon = path.join(repoDir, 'assets', 'controllers', 'ds5-bridge_app-icon-tile.ico');

  fs.copyFileSync(path.join(repoDir, 'LICENSE'), path.join(context.appOutDir, 'LICENSE'));
  fs.copyFileSync(path.join(repoDir, 'NOTICE'), path.join(context.appOutDir, 'NOTICE'));
  fs.writeFileSync(path.join(context.appOutDir, 'SOURCE.txt'), sourceNotice(repoDir), 'utf8');

  await rcedit(exePath, {
    icon: appIcon,
    'file-version': appPackage.version,
    'product-version': appPackage.version,
    'version-string': {
      FileDescription: 'DS5 Bridge Companion',
      InternalName: 'DS5 Bridge',
      OriginalFilename: 'DS5 Bridge.exe',
      ProductName: 'DS5 Bridge'
    }
  });
};
