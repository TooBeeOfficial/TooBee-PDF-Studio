const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

module.exports = async function(context) {
  if (context.electronPlatformName !== 'win32') return;

  // Give Windows Defender 5 seconds to release the file lock
  console.log('\n⏳ Waiting 5 seconds for Antivirus to release file locks before manual icon injection...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Find the generated executable
  const exeFiles = fs.readdirSync(context.appOutDir).filter(f => f.endsWith('.exe'));
  if (exeFiles.length === 0) return;
  const exePath = path.join(context.appOutDir, exeFiles[0]);
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  // Rcedit from electron-builder's cache
  const rceditPath = 'C:\\Users\\RBT\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\winCodeSign-2.6.0\\rcedit-x64.exe';

  if (fs.existsSync(rceditPath) && fs.existsSync(exePath) && fs.existsSync(iconPath)) {
    try {
      console.log(`Injecting icon into ${exeFiles[0]} manually...`);
      execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`);
      console.log('✅ Successfully injected icon via afterPack hook!');
    } catch (err) {
      console.error('❌ Manual icon injection failed. The file might still be locked.');
    }
  }
};
