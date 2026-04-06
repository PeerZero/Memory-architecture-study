// test/run-real.js — Real condenser test using curl (bypasses Node SDK hang in sandbox)
require('dotenv').config();

const { execSync } = require('child_process');
const { getDb, resetDatabase, close } = require('../src/db');
const graph = require('../src/graph');
const { runSleepCycle } = require('../src/sleep');
const { buildInjection } = require('../src/injector');
const config = require('../config');

const API_KEY = process.env.ANTHROPIC_API_KEY;

function callClaude(model, systemPrompt, messages, maxTokens = 2048) {
  const body = { model, max_tokens: maxTokens, messages };
  if (systemPrompt) body.system = systemPrompt;
  const bodyJson = JSON.stringify(body).replace(/'/g, "'\\'");
  const result = execSync(`curl -s --max-time 120 https://api.anthropic.com/v1/messages \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -d '${bodyJson}'`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return JSON.parse(result);
}

// See test/stress-test.js and test/overload-test.js for full test implementations
console.log('Use test/stress-test.js or test/overload-test.js for real API testing.');
console.log('This file contains the curl-based callClaude helper.');
