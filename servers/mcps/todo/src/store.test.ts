import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAinderStore } from './store.js';

test('state() redacts password hashes and raw upload text', () => {
  const store = createAinderStore({ seedDemo: true });
  const upload = store.uploadKakaoTxt({ fileName: 'sample.txt', retainRawUpload: true });
  const snapshot = store.state();
  assert.equal(snapshot.users[0]?.passwordHash, '[redacted]');
  const redactedUpload = snapshot.uploads.find((item) => item.id === upload.id);
  assert.equal(redactedUpload?.rawText, null);
});

test('provider egress is blocked while raw upload lifecycle is unresolved', () => {
  const store = createAinderStore({ seedDemo: true });
  store.uploadKakaoTxt({ fileName: 'sample.txt', retainRawUpload: false });
  assert.throws(() => store.startToblPersonaSimulation('user-target'), /External calls are blocked/);
  const audit = store.state().auditEvents.at(-1);
  assert.equal(audit?.type, 'provider.egress_blocked');
});

test('provider calls are persisted for profile generation, simulation, and Cocoun council', () => {
  const store = createAinderStore({ seedDemo: true });
  const upload = store.uploadKakaoTxt({ fileName: 'sample.txt' });
  const sanitized = store.sanitizeConversation(upload.id);
  const profile = store.generatePersonaProfile(sanitized.id);
  store.confirmPublicProfileFields(
    profile.id,
    profile.traits.filter((trait) => trait.visibility === 'public').map((trait) => trait.id),
  );
  store.publishPublicProfile(profile.id);
  const simulation = store.startToblPersonaSimulation('user-target');
  const report = store.generateMatchReport(simulation.id);
  store.selectFriendPersonaCouncilMembers(report.id, []);

  const providers = store.state().providerCalls.map((call) => `${call.provider}:${call.purpose}`);
  assert.deepEqual(providers, [
    'openai:persona_profile_generation',
    'tobl:persona_simulation',
    'cocoun:friend_persona_council',
  ]);
});

test('persistent store reloads sessions and provider call history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ainder-store-'));
  const persistPath = join(dir, 'state.json');
  try {
    const store = createAinderStore({ seedDemo: true, persistPath });
    store.login('demo', 'demo');
    const upload = store.uploadKakaoTxt({ fileName: 'sample.txt' });
    const sanitized = store.sanitizeConversation(upload.id);
    store.generatePersonaProfile(sanitized.id);
    store.persist();

    const reloaded = createAinderStore({ seedDemo: false, persistPath });
    assert.ok(reloaded.state().sessions.length >= 1);
    assert.equal(reloaded.state().providerCalls.length, 1);
    assert.equal(reloaded.state().providerCalls[0]?.provider, 'openai');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('match request preview excludes full transcript and report stays locked after one consent', () => {
  const store = createAinderStore({ seedDemo: true });
  const upload = store.uploadKakaoTxt({ fileName: 'sample.txt' });
  const sanitized = store.sanitizeConversation(upload.id);
  const profile = store.generatePersonaProfile(sanitized.id);
  store.confirmPublicProfileFields(
    profile.id,
    profile.traits.filter((trait) => trait.visibility === 'public').map((trait) => trait.id),
  );
  store.publishPublicProfile(profile.id);
  const simulation = store.startToblPersonaSimulation('user-target');
  const preview = store.previewMatchRequestContext(simulation.id) as { fullTranscriptAttached: boolean; attachedGoodMoments: string[] };
  assert.equal(preview.fullTranscriptAttached, false);
  assert.ok(preview.attachedGoodMoments.length <= 3);

  const request = store.createMatchRequestFromConversation(simulation.id, '대화해보고 싶어요.');
  const accepted = store.respondMatchRequest(request.id, 'accept');
  assert.ok(accepted.match);
  const report = store.generateMatchReport(simulation.id);
  store.startCocounReportCouncil(simulation.id);
  const locked = store.consentReportReveal(report.id, true);
  assert.equal(locked.status, 'locked');
});
