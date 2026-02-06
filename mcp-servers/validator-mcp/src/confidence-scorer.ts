/**
 * ConfidenceScorer - Calculates confidence scores for findings
 *
 * Combines reproduction, negative control, and cross-identity results
 * to determine overall confidence and promotion recommendation.
 */

import {
  ReproResult,
  NegativeControlResult,
  CrossIdentityResult,
  ConfidenceScore,
  ValidationInputs,
} from './types.js';

/**
 * Thresholds for confidence scoring
 */
export const CONFIDENCE_THRESHOLDS = {
  PROMOTE: 0.8,
  INVESTIGATE: 0.5,
  DISMISS: 0.3,
};

/**
 * Weights for different validation types
 */
export const VALIDATION_WEIGHTS = {
  REPRO: 0.4,
  NEGATIVE_CONTROL: 0.35,
  CROSS_IDENTITY: 0.25,
};

/**
 * Calculates confidence scores based on validation results
 */
export class ConfidenceScorer {
  private readonly promoteThreshold: number;
  private readonly investigateThreshold: number;

  constructor(
    promoteThreshold: number = CONFIDENCE_THRESHOLDS.PROMOTE,
    investigateThreshold: number = CONFIDENCE_THRESHOLDS.INVESTIGATE
  ) {
    this.promoteThreshold = promoteThreshold;
    this.investigateThreshold = investigateThreshold;
  }

  /**
   * Calculate reproduction score
   *
   * Factors:
   * - Success rate (primary factor)
   * - Consistency of responses
   * - Number of attempts
   */
  calculateReproScore(result: ReproResult): number {
    if (result.total_attempts === 0) {
      return 0;
    }

    // Base score from success rate
    let score = result.success_rate;

    // Bonus for consistency
    if (result.consistent && result.successful_attempts > 1) {
      score = Math.min(1.0, score + 0.1);
    }

    // Slight penalty for very few attempts
    if (result.total_attempts < 3) {
      score *= 0.9;
    }

    // Bonus for many successful attempts
    if (result.successful_attempts >= 5) {
      score = Math.min(1.0, score + 0.05);
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Calculate negative control score
   *
   * Factors:
   * - Whether the control passed
   * - Type of control (some are more critical)
   */
  calculateNegativeControlScore(result: NegativeControlResult): number {
    if (result.passed) {
      // Control passed - high confidence
      return 1.0;
    }

    // Control failed - score depends on control type
    switch (result.control_type) {
      case 'unauthenticated':
        // Unauthenticated access is critical
        return 0.1;
      case 'invalid_token':
        // Invalid token bypass is serious
        return 0.2;
      case 'different_user':
        // Unauthorized user access is serious
        return 0.15;
      case 'modified_request':
        // May be less critical depending on context
        return 0.3;
      default:
        return 0.2;
    }
  }

  /**
   * Calculate cross-identity score
   *
   * Factors:
   * - Number of violations
   * - Total identities tested
   * - Types of violations
   */
  calculateCrossIdentityScore(result: CrossIdentityResult): number {
    if (result.identities_tested.length === 0) {
      return 0;
    }

    if (result.authorization_enforced) {
      // No violations - full score
      return 1.0;
    }

    // Calculate based on violation ratio
    const violationRatio = result.violations.length / result.identities_tested.length;

    // Check for unauthorized access violations (more severe)
    const unauthorizedAccessViolations = result.violations.filter((v) =>
      v.includes('unauthorized access')
    ).length;

    if (unauthorizedAccessViolations > 0) {
      // Unauthorized access is critical
      return Math.max(0.1, 0.5 - violationRatio * 0.4);
    }

    // Denied access violations are less severe (could be overly restrictive)
    return Math.max(0.3, 1.0 - violationRatio * 0.7);
  }

  /**
   * Determine recommendation based on overall score
   */
  getRecommendation(overallScore: number): 'promote' | 'investigate' | 'dismiss' {
    if (overallScore >= this.promoteThreshold) {
      return 'promote';
    }
    if (overallScore >= this.investigateThreshold) {
      return 'investigate';
    }
    return 'dismiss';
  }

  /**
   * Generate explanation factors for the score
   */
  generateFactors(
    inputs: ValidationInputs,
    reproScore: number,
    negativeControlScore: number,
    crossIdentityScore: number
  ): string[] {
    const factors: string[] = [];

    // Reproduction factors
    if (inputs.repro_result) {
      const repro = inputs.repro_result;
      if (repro.success_rate >= 1.0) {
        factors.push(`Reproduction: 100% success rate (${repro.successful_attempts}/${repro.total_attempts})`);
      } else if (repro.success_rate >= 0.8) {
        factors.push(`Reproduction: High success rate (${Math.round(repro.success_rate * 100)}%)`);
      } else if (repro.success_rate >= 0.5) {
        factors.push(`Reproduction: Moderate success rate (${Math.round(repro.success_rate * 100)}%)`);
      } else {
        factors.push(`Reproduction: Low success rate (${Math.round(repro.success_rate * 100)}%) - finding may be flaky`);
      }

      if (repro.consistent) {
        factors.push('Reproduction: Responses are consistent');
      } else if (repro.successful_attempts > 1) {
        factors.push('Reproduction: Responses vary between attempts');
      }
    } else {
      factors.push('Reproduction: Not tested');
    }

    // Negative control factors
    if (inputs.negative_control_result) {
      const nc = inputs.negative_control_result;
      if (nc.passed) {
        factors.push(`Negative control (${nc.control_type}): Passed - authorization enforced`);
      } else {
        factors.push(`Negative control (${nc.control_type}): FAILED - ${nc.actual_behavior}`);
      }
    } else {
      factors.push('Negative control: Not tested');
    }

    // Cross-identity factors
    if (inputs.cross_identity_result) {
      const ci = inputs.cross_identity_result;
      if (ci.authorization_enforced) {
        factors.push(`Cross-identity: Authorization enforced across ${ci.identities_tested.length} identities`);
      } else {
        factors.push(`Cross-identity: ${ci.violations.length} violation(s) found`);
        for (const violation of ci.violations.slice(0, 3)) {
          factors.push(`  - ${violation}`);
        }
      }
    } else {
      factors.push('Cross-identity: Not tested');
    }

    return factors;
  }

  /**
   * Calculate overall confidence score
   *
   * @param inputs Validation results to score
   * @returns ConfidenceScore with recommendation
   */
  calculateConfidence(inputs: ValidationInputs): ConfidenceScore {
    // Calculate individual scores
    const reproScore = inputs.repro_result
      ? this.calculateReproScore(inputs.repro_result)
      : 0;

    const negativeControlScore = inputs.negative_control_result
      ? this.calculateNegativeControlScore(inputs.negative_control_result)
      : 0;

    const crossIdentityScore = inputs.cross_identity_result
      ? this.calculateCrossIdentityScore(inputs.cross_identity_result)
      : 0;

    // Calculate weighted overall score
    // Only include weights for tests that were actually performed
    let totalWeight = 0;
    let weightedSum = 0;

    if (inputs.repro_result) {
      weightedSum += reproScore * VALIDATION_WEIGHTS.REPRO;
      totalWeight += VALIDATION_WEIGHTS.REPRO;
    }

    if (inputs.negative_control_result) {
      weightedSum += negativeControlScore * VALIDATION_WEIGHTS.NEGATIVE_CONTROL;
      totalWeight += VALIDATION_WEIGHTS.NEGATIVE_CONTROL;
    }

    if (inputs.cross_identity_result) {
      weightedSum += crossIdentityScore * VALIDATION_WEIGHTS.CROSS_IDENTITY;
      totalWeight += VALIDATION_WEIGHTS.CROSS_IDENTITY;
    }

    const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const roundedOverall = Math.round(overallScore * 100) / 100;

    // Generate recommendation and factors
    const recommendation = this.getRecommendation(roundedOverall);
    const factors = this.generateFactors(inputs, reproScore, negativeControlScore, crossIdentityScore);

    return {
      finding_id: inputs.finding_id,
      repro_score: reproScore,
      negative_control_score: negativeControlScore,
      cross_identity_score: crossIdentityScore,
      overall_score: roundedOverall,
      recommendation,
      factors,
    };
  }

  /**
   * Get thresholds used for recommendations
   */
  getThresholds(): { promote: number; investigate: number } {
    return {
      promote: this.promoteThreshold,
      investigate: this.investigateThreshold,
    };
  }
}
