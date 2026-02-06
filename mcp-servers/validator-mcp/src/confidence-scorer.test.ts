import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfidenceScorer,
  CONFIDENCE_THRESHOLDS,
  VALIDATION_WEIGHTS,
} from './confidence-scorer.js';
import {
  ReproResult,
  NegativeControlResult,
  CrossIdentityResult,
  ValidationInputs,
} from './types.js';

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer();
  });

  describe('calculateReproScore', () => {
    it('should return 0 for no attempts', () => {
      const result: ReproResult = {
        finding_id: 'F-001',
        total_attempts: 0,
        successful_attempts: 0,
        failed_attempts: 0,
        success_rate: 0,
        consistent: false,
        attempts: [],
      };

      expect(scorer.calculateReproScore(result)).toBe(0);
    });

    it('should return 1.0 for 100% success rate with consistency', () => {
      const result: ReproResult = {
        finding_id: 'F-001',
        total_attempts: 3,
        successful_attempts: 3,
        failed_attempts: 0,
        success_rate: 1.0,
        consistent: true,
        attempts: [],
      };

      const score = scorer.calculateReproScore(result);
      expect(score).toBeGreaterThanOrEqual(1.0);
    });

    it('should return lower score for lower success rate', () => {
      const result: ReproResult = {
        finding_id: 'F-001',
        total_attempts: 3,
        successful_attempts: 1,
        failed_attempts: 2,
        success_rate: 0.33,
        consistent: true,
        attempts: [],
      };

      const score = scorer.calculateReproScore(result);
      expect(score).toBeLessThan(0.5);
    });

    it('should give bonus for consistency', () => {
      // Use 80% success rate so the bonus can actually be applied (not capped at 1.0)
      const consistentResult: ReproResult = {
        finding_id: 'F-001',
        total_attempts: 5,
        successful_attempts: 4,
        failed_attempts: 1,
        success_rate: 0.8,
        consistent: true,
        attempts: [],
      };

      const inconsistentResult: ReproResult = {
        ...consistentResult,
        consistent: false,
      };

      const consistentScore = scorer.calculateReproScore(consistentResult);
      const inconsistentScore = scorer.calculateReproScore(inconsistentResult);

      expect(consistentScore).toBeGreaterThan(inconsistentScore);
    });

    it('should apply penalty for few attempts', () => {
      const fewAttempts: ReproResult = {
        finding_id: 'F-001',
        total_attempts: 2,
        successful_attempts: 2,
        failed_attempts: 0,
        success_rate: 1.0,
        consistent: true,
        attempts: [],
      };

      const manyAttempts: ReproResult = {
        ...fewAttempts,
        total_attempts: 5,
        successful_attempts: 5,
      };

      const fewScore = scorer.calculateReproScore(fewAttempts);
      const manyScore = scorer.calculateReproScore(manyAttempts);

      expect(fewScore).toBeLessThan(manyScore);
    });
  });

  describe('calculateNegativeControlScore', () => {
    it('should return 1.0 when control passed', () => {
      const result: NegativeControlResult = {
        finding_id: 'F-001',
        control_type: 'unauthenticated',
        passed: true,
        expected_behavior: 'Should reject',
        actual_status: 401,
        actual_behavior: 'Rejected',
        message: 'Passed',
      };

      expect(scorer.calculateNegativeControlScore(result)).toBe(1.0);
    });

    it('should return low score for failed unauthenticated control', () => {
      const result: NegativeControlResult = {
        finding_id: 'F-001',
        control_type: 'unauthenticated',
        passed: false,
        expected_behavior: 'Should reject',
        actual_status: 200,
        actual_behavior: 'Accepted',
        message: 'Failed',
      };

      expect(scorer.calculateNegativeControlScore(result)).toBe(0.1);
    });

    it('should return low score for failed invalid_token control', () => {
      const result: NegativeControlResult = {
        finding_id: 'F-001',
        control_type: 'invalid_token',
        passed: false,
        expected_behavior: 'Should reject',
        actual_status: 200,
        actual_behavior: 'Accepted',
        message: 'Failed',
      };

      expect(scorer.calculateNegativeControlScore(result)).toBe(0.2);
    });

    it('should return higher score for failed modified_request control', () => {
      const result: NegativeControlResult = {
        finding_id: 'F-001',
        control_type: 'modified_request',
        passed: false,
        expected_behavior: 'Should reject',
        actual_status: 200,
        actual_behavior: 'Accepted',
        message: 'Failed',
      };

      expect(scorer.calculateNegativeControlScore(result)).toBe(0.3);
    });
  });

  describe('calculateCrossIdentityScore', () => {
    it('should return 0 for no identities tested', () => {
      const result: CrossIdentityResult = {
        finding_id: 'F-001',
        identities_tested: [],
        results: [],
        authorization_enforced: true,
        violations: [],
        message: 'No identities',
      };

      expect(scorer.calculateCrossIdentityScore(result)).toBe(0);
    });

    it('should return 1.0 when authorization enforced', () => {
      const result: CrossIdentityResult = {
        finding_id: 'F-001',
        identities_tested: ['admin', 'user'],
        results: [],
        authorization_enforced: true,
        violations: [],
        message: 'Authorization enforced',
      };

      expect(scorer.calculateCrossIdentityScore(result)).toBe(1.0);
    });

    it('should return low score for unauthorized access violations', () => {
      const result: CrossIdentityResult = {
        finding_id: 'F-001',
        identities_tested: ['admin', 'user'],
        results: [],
        authorization_enforced: false,
        violations: ['user: Gained unauthorized access (status 200)'],
        message: 'Violations found',
      };

      const score = scorer.calculateCrossIdentityScore(result);
      expect(score).toBeLessThan(0.5);
    });

    it('should return higher score for denied access violations only', () => {
      const result: CrossIdentityResult = {
        finding_id: 'F-001',
        identities_tested: ['admin', 'user'],
        results: [],
        authorization_enforced: false,
        violations: ['admin: Denied expected access (status 403)'],
        message: 'Violations found',
      };

      const score = scorer.calculateCrossIdentityScore(result);
      expect(score).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('getRecommendation', () => {
    it('should return promote for high scores', () => {
      expect(scorer.getRecommendation(0.85)).toBe('promote');
      expect(scorer.getRecommendation(0.9)).toBe('promote');
      expect(scorer.getRecommendation(1.0)).toBe('promote');
    });

    it('should return investigate for medium scores', () => {
      expect(scorer.getRecommendation(0.5)).toBe('investigate');
      expect(scorer.getRecommendation(0.6)).toBe('investigate');
      expect(scorer.getRecommendation(0.75)).toBe('investigate');
    });

    it('should return dismiss for low scores', () => {
      expect(scorer.getRecommendation(0.2)).toBe('dismiss');
      expect(scorer.getRecommendation(0.3)).toBe('dismiss');
      expect(scorer.getRecommendation(0.4)).toBe('dismiss');
    });

    it('should respect custom thresholds', () => {
      const customScorer = new ConfidenceScorer(0.9, 0.7);
      expect(customScorer.getRecommendation(0.85)).toBe('investigate');
      expect(customScorer.getRecommendation(0.95)).toBe('promote');
    });
  });

  describe('calculateConfidence', () => {
    it('should calculate weighted score with all inputs', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
        cross_identity_result: {
          finding_id: 'F-001',
          identities_tested: ['admin', 'user'],
          results: [],
          authorization_enforced: true,
          violations: [],
          message: 'Enforced',
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.finding_id).toBe('F-001');
      expect(confidence.repro_score).toBeGreaterThan(0);
      expect(confidence.negative_control_score).toBe(1.0);
      expect(confidence.cross_identity_score).toBe(1.0);
      expect(confidence.overall_score).toBeGreaterThan(0.8);
      expect(confidence.recommendation).toBe('promote');
    });

    it('should handle missing repro_result', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.repro_score).toBe(0);
      expect(confidence.overall_score).toBeGreaterThan(0);
    });

    it('should handle only repro_result', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.repro_score).toBeGreaterThan(0);
      expect(confidence.negative_control_score).toBe(0);
      expect(confidence.cross_identity_score).toBe(0);
      expect(confidence.overall_score).toBeGreaterThan(0);
    });

    it('should return 0 overall score when no inputs', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.overall_score).toBe(0);
    });

    it('should include factors in result', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.factors).toBeInstanceOf(Array);
      expect(confidence.factors.length).toBeGreaterThan(0);
      expect(confidence.factors.some((f) => f.includes('Reproduction'))).toBe(true);
    });

    it('should include factors for all validation types', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
        cross_identity_result: {
          finding_id: 'F-001',
          identities_tested: ['admin', 'user'],
          results: [],
          authorization_enforced: true,
          violations: [],
          message: 'Enforced',
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.factors.some((f) => f.includes('Reproduction'))).toBe(true);
      expect(confidence.factors.some((f) => f.includes('Negative control'))).toBe(true);
      expect(confidence.factors.some((f) => f.includes('Cross-identity'))).toBe(true);
    });

    it('should indicate when tests were not run', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.factors.some((f) => f.includes('Not tested'))).toBe(true);
    });

    it('should recommend dismiss for failed validations', () => {
      const inputs: ValidationInputs = {
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 0,
          failed_attempts: 3,
          success_rate: 0,
          consistent: false,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: false,
          expected_behavior: 'Reject',
          actual_status: 200,
          actual_behavior: 'Accepted',
          message: 'Failed',
        },
      };

      const confidence = scorer.calculateConfidence(inputs);

      expect(confidence.overall_score).toBeLessThan(0.5);
      expect(confidence.recommendation).toBe('dismiss');
    });
  });

  describe('getThresholds', () => {
    it('should return default thresholds', () => {
      const thresholds = scorer.getThresholds();
      expect(thresholds.promote).toBe(CONFIDENCE_THRESHOLDS.PROMOTE);
      expect(thresholds.investigate).toBe(CONFIDENCE_THRESHOLDS.INVESTIGATE);
    });

    it('should return custom thresholds', () => {
      const customScorer = new ConfidenceScorer(0.9, 0.6);
      const thresholds = customScorer.getThresholds();
      expect(thresholds.promote).toBe(0.9);
      expect(thresholds.investigate).toBe(0.6);
    });
  });

  describe('VALIDATION_WEIGHTS', () => {
    it('should sum to 1.0', () => {
      const sum =
        VALIDATION_WEIGHTS.REPRO +
        VALIDATION_WEIGHTS.NEGATIVE_CONTROL +
        VALIDATION_WEIGHTS.CROSS_IDENTITY;
      expect(sum).toBe(1.0);
    });
  });
});
