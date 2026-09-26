const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const bundles = [
  {
    output: 'modules/init-features.js',
    bom: true,
    sourceDirectory: 'src/js-bundles/init-features',
    fragments: [
      'settings-and-appearance.jsfrag',
      'phone-and-content.jsfrag',
      'narration-and-game-setup.jsfrag',
      'truth-game.jsfrag',
      'watch-together-player.jsfrag',
      'media-search-and-reading.jsfrag',
      'games-and-presets.jsfrag',
      'todo-and-batch-bindings.jsfrag'
    ]
  },
  {
    output: 'modules/init-event-bindingsA.js',
    sourceDirectory: 'src/js-bundles/event-bindings-a',
    fragments: [
      'worldbook-and-character.jsfrag',
      'global-controls-and-music.jsfrag',
      'wallpaper-and-chat-input.jsfrag',
      'console-and-worldbook-editor.jsfrag',
      'chat-settings-and-members.jsfrag'
    ]
  },
  {
    output: 'modules/init-event-bindingsB.js',
    bom: true,
    sourceDirectory: 'src/js-bundles/event-bindings-b',
    fragments: [
      'memory-and-api-history.jsfrag',
      'chat-settings.jsfrag',
      'qzone-and-stickers.jsfrag',
      'calls-shopping-and-sound.jsfrag',
      'mail-and-final-bindings.jsfrag'
    ]
  },
  {
    output: 'modules/ai/trigger-response.js',
    sourceDirectory: 'src/js-bundles/trigger-response',
    fragments: [
      'request-setup.jsfrag',
      'prompt-context.jsfrag',
      'memory-and-social-context.jsfrag',
      'todo-diary-and-album-context.jsfrag',
      'media-preprocessing.jsfrag',
      'response-actions.jsfrag',
      'finalization.jsfrag'
    ]
  }
];

let failed = false;

for (const bundle of bundles) {
  const generatedSource = `${bundle.bom ? '\uFEFF' : ''}${bundle.fragments
    .map(fragment => fs.readFileSync(
      path.join(projectRoot, bundle.sourceDirectory, fragment),
      'utf8'
    ))
    .join('')}`;
  const outputPath = path.join(projectRoot, bundle.output);

  if (process.argv.includes('--check')) {
    if (fs.readFileSync(outputPath, 'utf8') !== generatedSource) {
      console.error(`${bundle.output} is out of sync with its source fragments.`);
      failed = true;
    }
  } else {
    fs.writeFileSync(outputPath, generatedSource);
  }
}

if (failed) process.exit(1);

const action = process.argv.includes('--check') ? 'Verified' : 'Generated';
console.log(`${action} ${bundles.length} scope-preserving script bundles.`);
