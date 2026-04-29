/**
 * electron-builder config for Fathom.
 *
 * v1 is distributed without an Apple Developer ID. We do, however, consistently
 * ad-hoc sign the full app bundle ourselves in the `afterSign` hook below —
 * without that, the linker-level signature Apple applies to arm64 Mach-O
 * binaries at build time disagrees with the unsigned bundle state, and
 * Gatekeeper reports the downloaded app as "damaged and can't be opened"
 * (a hard block with no right-click → Open escape on macOS Ventura+).
 *
 * With the afterSign hook in place the app reports as "unidentified developer"
 * instead, which users can approve once via System Settings → Privacy &
 * Security → Open Anyway. This is Apple's sanctioned user-approval path for
 * apps distributed outside the Developer Program.
 *
 * When an Apple Developer ID becomes available, set `mac.identity` to the
 * certificate's Common Name, flip `hardenedRuntime` to true, and add notarize
 * credentials — the afterSign hook becomes redundant and should be removed.
 */

const { execSync } = require('node:child_process');

module.exports = {
  appId: 'com.ashrya.fathom',
  productName: 'Fathom',
  directories: {
    output: 'dist',
    buildResources: 'resources',
  },
  // Bundle the welcome/sample paper so the first-run dialog can offer it,
  // and the install/update script so the in-app updater can spawn it.
  extraResources: [
    { from: 'resources/sample-paper.pdf', to: 'sample-paper.pdf' },
    { from: 'install.sh', to: 'install.sh' },
  ],
  // Register Fathom as a handler for .pdf files so Finder shows "Open With → Fathom"
  // and the user can drop a PDF onto the app icon.
  fileAssociations: [
    {
      ext: 'pdf',
      name: 'PDF Document',
      description: 'Portable Document Format',
      role: 'Viewer',
    },
  ],
  files: [
    'out/**',
    'package.json',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*.d.ts',
    '!**/node_modules/.bin',
    '!**/*.{iml,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}',
    '!.editorconfig',
    '!**/._*',
    '!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitattributes,.gitignore,.gitkeep}',
  ],
  asarUnpack: [
    // better-sqlite3 needs its prebuilt .node binary unpacked so it can dlopen at runtime.
    'node_modules/better-sqlite3/**',
    // Claude Agent SDK spawns the `claude` binary and needs access to its mjs files.
    'node_modules/@anthropic-ai/claude-agent-sdk/**',
    // fathom-whiteboard's vendored excalidraw-mcp is launched via
    // child_process.spawn(process.execPath, [<path>]); paths inside
    // app.asar can be read via Electron's fs hook but cannot be
    // executed by spawned children. Unpack so spawn has a real-disk
    // file to invoke.
    'node_modules/fathom-whiteboard/vendor/**',
  ],
  // Versionless asset names so the stable /releases/latest/download/<asset>
  // URL always resolves to the current DMG/zip across releases.
  artifactName: 'Fathom-${arch}.${ext}',
  mac: {
    category: 'public.app-category.productivity',
    target: [
      { target: 'dmg' },
      { target: 'zip' },
    ],
    identity: null,             // We handle ad-hoc signing ourselves in afterSign.
    hardenedRuntime: false,
    gatekeeperAssess: false,
    icon: 'resources/icon.icns',
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    icon: 'resources/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'Fathom-Setup-${version}-${arch}.${ext}',
  },
  dmg: {
    title: 'Fathom ${version}',
    sign: false,
    icon: 'resources/icon.icns',
    background: 'resources/dmg-background.png',
    window: { width: 680, height: 460 },
    contents: [
      // Coordinates must align with the drop-zones drawn in dmg-background.svg.
      { x: 180, y: 180, type: 'file' },
      { x: 500, y: 180, type: 'link', path: '/Applications' },
    ],
  },
  // Bundle native modules for the target Electron version.
  npmRebuild: true,
  // Drives electron-updater — produces latest-mac.yml alongside the artifacts so the
  // in-app auto-updater can discover new releases and swap the app bundle on restart.
  publish: [
    {
      provider: 'github',
      owner: 'ashryaagr',
      repo: 'Fathom',
      releaseType: 'release',
    },
  ],
  // electron-builder's signing pass is a no-op (identity: null); this hook runs
  // right after it, before the DMG is assembled, and ad-hoc signs the whole app
  // bundle consistently. Without this, `codesign --verify` reports:
  //   "code has no resources but signature indicates they must be present"
  // and Gatekeeper refuses to launch the downloaded app with the "damaged"
  // error on macOS Ventura+.
  //
  // We also patch Info.plist here to add LSItemContentTypes (UTI-based
  // file associations) before signing — without it, modern macOS often
  // refuses to surface Fathom in Finder's "Open With" menu even though
  // CFBundleTypeExtensions=['pdf'] is declared. UTI is the post-Mojave
  // canonical path; the legacy extension list is treated as advisory.
  // Modifying the plist after codesign would invalidate the signature,
  // so this happens FIRST inside afterSign, then the codesign call
  // signs the already-patched bundle.
  afterSign: async (context) => {
    if (context.packager.platform.name !== 'mac') return;
    const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
    const plistPath = `${appPath}/Contents/Info.plist`;

    console.log(`\n[afterSign] patching ${plistPath}: add LSItemContentTypes=com.adobe.pdf`);
    // Best-effort delete in case a re-run already added it; ignore failure.
    try {
      execSync(
        `/usr/libexec/PlistBuddy -c "Delete :CFBundleDocumentTypes:0:LSItemContentTypes" "${plistPath}"`,
        { stdio: 'pipe' },
      );
    } catch (_e) {
      /* not present yet — that's the normal case */
    }
    execSync(
      `/usr/libexec/PlistBuddy -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes array" "${plistPath}"`,
      { stdio: 'inherit' },
    );
    execSync(
      `/usr/libexec/PlistBuddy -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.adobe.pdf" "${plistPath}"`,
      { stdio: 'inherit' },
    );

    console.log(`[afterSign] ad-hoc signing ${appPath}`);
    execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' });
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterSign] signature verified ✓\n');
  },
};
