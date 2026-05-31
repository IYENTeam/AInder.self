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

test('upload rejects malformed KakaoTalk exports', () => {
  const store = createAinderStore({ seedDemo: true });
  assert.throws(
    () =>
      store.uploadKakaoTxt({
        fileName: 'broken.txt',
        fileText: 'hello\\nworld',
      }),
    /format is invalid|too short/,
  );
});

test('store request context is written into audit and provider records', () => {
  const store = createAinderStore({ seedDemo: true });
  store.setRequestContext('req-123');
  const upload = store.uploadKakaoTxt({ fileName: 'sample.txt' });
  const sanitized = store.sanitizeConversation(upload.id);
  store.generatePersonaProfile(sanitized.id);
  store.clearRequestContext();

  const auditEvents = store.state().auditEvents.slice(-3);
  assert.ok(auditEvents.every((event) => event.requestId === 'req-123'));
  const providerCall = store.state().providerCalls.at(-1);
  assert.equal(providerCall?.requestId, 'req-123');
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

test('versioned file-backed store reloads sessions and provider call history', () => {
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

test('legacy unwrapped persisted state migrates into the versioned envelope and keeps defaults', async () => {
  const { writeFileSync, readFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'ainder-legacy-store-'));
  const persistPath = join(dir, 'state.json');
  try {
    const legacyState = {
      currentUserId: 'legacy-user',
      builderOpenAiKeyConfigured: false,
      cocounKeyConfigured: false,
      retainRawUploads: false,
      users: [],
      uploads: [],
      sanitizedConversations: [],
      personaProfiles: [],
      publicProfiles: [],
      swipeInterests: [],
      conversations: [],
      matchRequests: [],
      matches: [],
      friendPersonas: [],
      councilRuns: [],
      reports: [],
      consents: [],
    };
    writeFileSync(persistPath, JSON.stringify(legacyState, null, 2));

    const reloaded = createAinderStore({ seedDemo: false, persistPath });
    assert.deepEqual(reloaded.state().sessions, []);
    assert.deepEqual(reloaded.state().auditEvents, []);
    assert.deepEqual(reloaded.state().providerCalls, []);

    reloaded.persist();
    const persisted = JSON.parse(readFileSync(persistPath, 'utf8')) as {
      schemaVersion?: number;
      state?: unknown;
    };
    assert.equal(persisted.schemaVersion, 1);
    assert.ok(persisted.state);
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
