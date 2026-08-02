import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/stream.js', import.meta.url), 'utf8');
const helperBlock = source.match(/const STORY_META_LEAK_SEGMENT_RE[\s\S]*?function createStoryMetaLeakSanitizer\(\) \{[\s\S]*?\n\}/)?.[0] || '';
const helpers = new Function(`${helperBlock}; return { sanitizeStoryMetaLeakLine, createStoryMetaLeakSanitizer };`)();

test('stream sanitizer removes a standalone leaked choice-writing instruction', () => {
  const sanitizer = helpers.createStoryMetaLeakSanitizer();
  const first = sanitizer.push('정상적인 서사 문장입니다.\n\n선택지에는 4가지가 있어야 하고, 아래 [3. 선택지] 형식으로 쓰세요.\n');
  const last = sanitizer.flush();
  assert.equal(first + last, '정상적인 서사 문장입니다.\n');
});

test('stream sanitizer handles an instruction split across SSE deltas', () => {
  const sanitizer = helpers.createStoryMetaLeakSanitizer();
  const chunks = [
    sanitizer.push('서사가 이어진다.\n선택지에는 4'),
    sanitizer.push('가지가 있어야 하고 아래 [3. 선택지] 형식으로 작성하세요.\n'),
    sanitizer.flush()
  ];
  assert.equal(chunks.join(''), '서사가 이어진다.\n');
});

test('stream sanitizer preserves legitimate narrative and actual numbered choices', () => {
  const sanitizer = helpers.createStoryMetaLeakSanitizer();
  const text = '[3. 선택지]\n1. 그녀에게 상황을 묻는다.\n2. 조용히 기다린다.\n';
  assert.equal(sanitizer.push(text) + sanitizer.flush(), text.trimEnd() + '\n');
});

test('line sanitizer keeps content before a leaked instruction on the same line', () => {
  assert.equal(
    helpers.sanitizeStoryMetaLeakLine('그녀가 대답했다. 선택지에는 네 가지가 있어야 하며 아래 형식으로 쓰세요.'),
    '그녀가 대답했다.'
  );
});

test('stream sanitizer adds no fetch, model call, or timer', () => {
  const helperSource = helperBlock;
  assert.doesNotMatch(helperSource, /fetch\s*\(/);
  assert.doesNotMatch(helperSource, /chat\/completions|DeepSeek|requestDeepSeek/);
  assert.doesNotMatch(helperSource, /setTimeout|setInterval/);
});
