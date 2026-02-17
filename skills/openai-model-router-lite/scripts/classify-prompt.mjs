#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadConfig() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const configPath = path.join(here, 'router-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function normalize(s) {
  return (s ?? '').toString().trim();
}

function toRegex(pat) {
  // If pattern looks like a regex (contains \b or \d etc), treat as regex; else literal substring match.
  const looksRegex = /\\[bdws]/.test(pat) || pat.includes('\\b') || pat.includes('(') || pat.includes('[');
  if (looksRegex) return new RegExp(pat, 'i');
  return new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function scorePrompt(prompt, cfg) {
  const text = prompt;

  // Explicit override tags
  const strongTag = cfg.overrideTags?.strong;
  const cheapTag = cfg.overrideTags?.cheap;
  if (strongTag && text.includes(strongTag)) {
    return { forced: true, model: cfg.models.strong, confidence: 1, reasons: [`forced by tag ${strongTag}`] };
  }
  if (cheapTag && text.includes(cheapTag)) {
    return { forced: true, model: cfg.models.cheap, confidence: 1, reasons: [`forced by tag ${cheapTag}`] };
  }

  let strongScore = 0;
  let cheapScore = 0;
  const reasons = [];

  for (const pat of cfg.signals?.strong?.patterns ?? []) {
    const re = toRegex(pat);
    if (re.test(text)) {
      strongScore += 1;
      if (re.source.length < 60) reasons.push(`strong:${pat}`);
    }
  }

  for (const pat of cfg.signals?.cheap?.patterns ?? []) {
    const re = toRegex(pat);
    if (re.test(text)) {
      cheapScore += 1;
      if (re.source.length < 60) reasons.push(`cheap:${pat}`);
    }
  }

  // Heuristic: longer prompts tend to benefit from stronger model, but keep weight small.
  const len = text.length;
  if (len >= 1200) {
    strongScore += 1;
    reasons.push('strong:length>=1200');
  } else if (len <= 200) {
    // Do not auto-push to cheap just because it's short; many bugs/questions are short.
    reasons.push('note:length<=200');
  }

  const threshold = cfg.thresholds?.strongScore ?? 3;
  const margin = strongScore - cheapScore;

  const chooseStrong = strongScore >= threshold && margin >= 1;
  const model = chooseStrong ? cfg.models.strong : cfg.models.cheap;

  // Confidence: squash margin into 0..1 (simple, transparent)
  const confidence = Math.max(0.05, Math.min(0.99, 0.5 + 0.15 * margin));

  return { forced: false, model, strongScore, cheapScore, confidence, reasons };
}

function main() {
  const cfg = loadConfig();
  const args = process.argv.slice(2);

  const json = args.includes('--json');
  const promptParts = args.filter(a => a !== '--json');
  const prompt = normalize(promptParts.join(' '));

  if (!prompt) {
    console.error('Usage: classify-prompt.mjs "<prompt>" [--json]');
    process.exit(2);
  }

  const result = scorePrompt(prompt, cfg);

  // Optional gating: if confidence is too low, recommend staying cheap
  const minConf = cfg.thresholds?.minConfidence ?? 0;
  const finalModel = result.forced
    ? result.model
    : (result.model === cfg.models.strong && result.confidence < minConf ? cfg.models.cheap : result.model);

  const out = {
    recommendedModel: finalModel,
    models: cfg.models,
    forced: !!result.forced,
    confidence: result.confidence,
    scores: result.forced ? undefined : { strong: result.strongScore, cheap: result.cheapScore },
    reasons: result.reasons?.slice(0, 8)
  };

  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  process.stdout.write(`Recommended model: ${out.recommendedModel}\n`);
  process.stdout.write(`Confidence: ${(out.confidence * 100).toFixed(0)}%\n`);
  if (out.reasons?.length) process.stdout.write(`Signals: ${out.reasons.join(', ')}\n`);
}

main();
