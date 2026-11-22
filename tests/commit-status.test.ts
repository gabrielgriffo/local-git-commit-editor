import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitStatus, type CommitInfo } from '../src/app/core/models/commit.model.ts';

const base = { is_pushed: false } as CommitInfo;

test('pushed commits are reported as pushed', () => {
  assert.equal(commitStatus({ ...base, is_pushed: true }, true), 'pushed');
});

test('commits not on any remote are unpushed when the repository has a remote', () => {
  assert.equal(commitStatus(base, true), 'unpushed');
});

test('commits are local when the repository has no remote', () => {
  assert.equal(commitStatus(base, false), 'local');
});
