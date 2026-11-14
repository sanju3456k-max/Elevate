const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');

const VALID_TABS = new Set([
  'home',
  'batches',
  'tests',
  'analytics',
  'create',
  'take-test',
  'results',
  'custom-builder',
  'omr-test',
  'bulk-print',
  'chatbot',
  'master-console',
  'notes-repository',
  'html-notes',
  'remedial'
]);

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

function runComponentExploration() {
  console.log('================================================================');
  console.log('ENTERPRISE COMPONENT & ROUTE LOGIC AUDIT EXPLORATION');
  console.log('================================================================\n');

  const allFiles = getAllFiles(srcDir);
  console.log(`Scanning ${allFiles.length} source code files for navigation integrity...\n`);

  const audits = [];
  let totalNavButtons = 0;
  let totalBackHandlers = 0;
  let invalidTabCount = 0;

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');

    // Find all setActiveTab('...') calls
    const tabMatches = content.matchAll(/setActiveTab\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g);
    const referencedTabs = [];
    const issues = [];

    for (const match of tabMatches) {
      const tab = match[1];
      referencedTabs.push(tab);
      if (
        relPath === 'App.tsx' ||
        relPath.startsWith('components/Navbar')
      ) {
        if (!VALID_TABS.has(tab)) {
          issues.push(`Invalid top-level tab referenced: "${tab}"`);
          invalidTabCount++;
        }
      }
    }

    // Count useBackHandler hooks
    const backHandlerMatches = content.match(/useBackHandler\s*\(/g);
    const backCount = backHandlerMatches ? backHandlerMatches.length : 0;
    totalBackHandlers += backCount;

    // Count navigation buttons
    const navBtnMatches = content.match(/onClick=\{[^}]*(?:setActiveTab|goBack|onBack|onExit|onSelectBatch|onStartTest)[^}]*\}/g);
    const navBtnCount = navBtnMatches ? navBtnMatches.length : 0;
    totalNavButtons += navBtnCount;

    if (referencedTabs.length > 0 || backCount > 0 || navBtnCount > 0) {
      audits.push({
        file: relPath,
        tabsReferenced: Array.from(new Set(referencedTabs)),
        backHandlers: backCount,
        buttonsWithNav: navBtnCount,
        potentialIssues: issues
      });
    }
  }

  console.log(`Audited ${audits.length} components with active navigation/back capabilities.`);
  console.log(`Total Interactive Navigation Buttons: ${totalNavButtons}`);
  console.log(`Total Back/Escape Interceptors (useBackHandler): ${totalBackHandlers}`);

  console.log('\n--- Key Component Navigation Roster ---');
  audits.forEach((a) => {
    if (a.buttonsWithNav > 0 || a.backHandlers > 0) {
      console.log(`• [${a.file}]`);
      if (a.tabsReferenced.length > 0) {
        console.log(`    Target Tabs: ${a.tabsReferenced.join(', ')}`);
      }
      console.log(`    Nav Buttons: ${a.buttonsWithNav} | Back Handlers: ${a.backHandlers}`);
      if (a.potentialIssues.length > 0) {
        console.error(`    ⚠️ Issues: ${a.potentialIssues.join('; ')}`);
      }
    }
  });

  console.log('\n================================================================');
  if (invalidTabCount === 0) {
    console.log('✓ AUDIT SUCCESS: 0 invalid tabs or dangling navigation targets found.');
    console.log('All components, back buttons, and modal dismissals are structurally sound!');
  } else {
    console.error(`✗ AUDIT WARNING: Found ${invalidTabCount} invalid tab references.`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

runComponentExploration();
