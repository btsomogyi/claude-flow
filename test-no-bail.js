#!/usr/bin/env node
process.env.NODE_OPTIONS = '--experimental-vm-modules';
const { spawn } = require('child_process');

const jest = spawn('./node_modules/.bin/jest', ['--maxWorkers=1', '--forceExit', '--testTimeout=2000'], {
  stdio: 'pipe'
});

let output = '';
jest.stdout.on('data', (data) => {
  output += data.toString();
});

jest.stderr.on('data', (data) => {
  output += data.toString();
});

jest.on('close', (code) => {
  // Only show first 100 lines to avoid massive output
  const lines = output.split('\n').slice(0, 100);
  console.log(lines.join('\n'));
  console.log(`\n... (truncated, exit code: ${code})`);
});