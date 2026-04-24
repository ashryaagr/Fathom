/**
 * electron-builder config for Lens.
 *
 * v1 is unsigned (identity: null). macOS will warn on first launch; users must
 * right-click the app and choose "Open" once, or run `xattr -cr /Applications/Lens.app`
 * after dragging it to Applications.
 *
 * The DMG is self-contained — all native modules (better-sqlite3) are rebuilt for
 * Electron's Node ABI via @electron/rebuild before the pack step.
 */
module.exports = {
  appId: 'com.ashrya.fathom',
  productName: 'Fathom',
  directories: {
    output: 'dist',
    buildResources: 'resources',
  },
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
  ],
  // Versionless asset names so a stable "latest" download URL (see README) always
  // resolves to the current DMG/zip without needing to re-edit the link each release.
  artifactName: 'Fathom-${arch}.${ext}',
  mac: {
    category: 'public.app-category.productivity',
    target: [
      { target: 'dmg' },
      { target: 'zip' },
    ],
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    icon: 'resources/icon.icns',
  },
  dmg: {
    title: 'Fathom ${version}',
    writeUpdateInfo: false,
    sign: false,
    icon: 'resources/icon.icns',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // Bundle native modules for the target Electron version.
  npmRebuild: true,
};
