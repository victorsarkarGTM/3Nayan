import { describe, expect, it } from 'vitest';
import { classifyNameMatch, nameMatchScore, normaliseName } from './name-match.ts';

describe('name matching', () => {
  it("normaliseName strips honorifics and sorts tokens", () =>
    expect(normaliseName('Dr. sharma,  Rahul')).toBe('RAHUL SHARMA'));
  it("'Mr. Rahul Kumar Sharma' vs 'RAHUL K SHARMA' ≥ 0.85", () =>
    expect(nameMatchScore('Mr. Rahul Kumar Sharma', 'RAHUL K SHARMA')).toBeGreaterThanOrEqual(0.85));
  it("'Sharma Rahul' vs 'Rahul Sharma' === 1", () => expect(nameMatchScore('Sharma Rahul', 'Rahul Sharma')).toBe(1));
  it("'Priya Nair' vs 'Rahul Sharma' < 0.5", () => expect(nameMatchScore('Priya Nair', 'Rahul Sharma')).toBeLessThan(0.5));
  it("'Smt. Anita Devi' vs 'ANITA DEVI' === 1", () => expect(nameMatchScore('Smt. Anita Devi', 'ANITA DEVI')).toBe(1));
  it("'Suresh Kumar' vs 'Ramesh Kumar' < 0.85 (different person)", () =>
    expect(nameMatchScore('Suresh Kumar', 'Ramesh Kumar')).toBeLessThan(0.85));
  it("'Rahul Sharma' vs 'Rohit Sharma' < 0.85 (different person)", () =>
    expect(nameMatchScore('Rahul Sharma', 'Rohit Sharma')).toBeLessThan(0.85));
  it("'Anita Devi' vs 'Anitha Devi' ≥ 0.85 (spelling variant)", () =>
    expect(nameMatchScore('Anita Devi', 'Anitha Devi')).toBeGreaterThanOrEqual(0.85));
  it("'P Sharma' vs 'Priya Sharma' < 0.85 (initial-only name must be reviewed)", () =>
    expect(nameMatchScore('P Sharma', 'Priya Sharma')).toBeLessThan(0.85));
  it("single word 'KUMAR' vs 'Rahul Kumar' < 0.85", () => expect(nameMatchScore('KUMAR', 'Rahul Kumar')).toBeLessThan(0.85));
  it("'Kumari' is kept as a name, not dropped as an honorific", () =>
    expect(nameMatchScore('Anita Kumari', 'Anita Singh')).toBeLessThan(0.85));
  it("empty name scores 0", () => expect(nameMatchScore('', 'ANITA DEVI')).toBe(0));
  it("classifyNameMatch([0.9, 0.84]) === 'flagged'", () => expect(classifyNameMatch([0.9, 0.84])).toBe('flagged'));
  it("classifyNameMatch([0.85, 1]) === 'passed'", () => expect(classifyNameMatch([0.85, 1])).toBe('passed'));
});
