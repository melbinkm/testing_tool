import * as crypto from 'crypto';

/**
 * Represents a request to be tested with different identities
 */
export interface DiffTestRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Result of testing a single identity
 */
export interface DiffTestResult {
  identity_id: string;
  status_code: number;
  response_length: number;
  response_hash: string;
  contains_target_data: boolean;
  timing_ms: number;
  error?: string;
}

/**
 * Analysis of differential test results
 */
export interface DiffTestAnalysis {
  status_codes_differ: boolean;
  response_lengths_differ: boolean;
  potential_bola: boolean;
  potential_idor: boolean;
  recommendation: string;
}

/**
 * Complete summary of a differential test
 */
export interface DiffTestSummary {
  request: DiffTestRequest;
  results: DiffTestResult[];
  analysis: DiffTestAnalysis;
}

/**
 * Analyzes differential test results to detect BOLA/IDOR vulnerabilities
 */
export class DifferentialTester {
  private readonly RESPONSE_LENGTH_VARIANCE_THRESHOLD = 0.1; // 10%

  /**
   * Generate a hash for response content comparison
   * @param body Response body to hash
   * @returns SHA-256 hash of the body
   */
  hashResponse(body: string): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  /**
   * Analyze test results to detect BOLA/IDOR patterns
   * @param request The original request
   * @param results Results from testing with different identities
   * @returns Analysis summary
   */
  analyzeResults(request: DiffTestRequest, results: DiffTestResult[]): DiffTestSummary {
    const analysis = this.computeAnalysis(results);

    return {
      request,
      results,
      analysis,
    };
  }

  /**
   * Compute analysis from test results
   */
  private computeAnalysis(results: DiffTestResult[]): DiffTestAnalysis {
    if (results.length === 0) {
      return {
        status_codes_differ: false,
        response_lengths_differ: false,
        potential_bola: false,
        potential_idor: false,
        recommendation: 'No results to analyze',
      };
    }

    if (results.length === 1) {
      return {
        status_codes_differ: false,
        response_lengths_differ: false,
        potential_bola: false,
        potential_idor: false,
        recommendation: 'Single identity tested - no differential comparison possible',
      };
    }

    // Filter out error results
    const successfulResults = results.filter(r => !r.error);

    if (successfulResults.length === 0) {
      return {
        status_codes_differ: false,
        response_lengths_differ: false,
        potential_bola: false,
        potential_idor: false,
        recommendation: 'All requests failed - check network connectivity and authentication',
      };
    }

    // Check if status codes differ
    const statusCodes = new Set(successfulResults.map(r => r.status_code));
    const status_codes_differ = statusCodes.size > 1;

    // Check if response lengths differ significantly
    const response_lengths_differ = this.hasSignificantLengthVariance(
      successfulResults.map(r => r.response_length)
    );

    // Check for BOLA pattern: Multiple users get 2xx with same response hash
    const successResponses = successfulResults.filter(
      r => r.status_code >= 200 && r.status_code < 300
    );
    const successHashes = new Set(successResponses.map(r => r.response_hash));

    // Potential BOLA: Multiple users get 2xx with SAME hash (accessing same object)
    const potential_bola =
      successResponses.length > 1 &&
      successHashes.size === 1 &&
      successResponses.every(r => r.contains_target_data);

    // Potential IDOR: Multiple users get 2xx with DIFFERENT hashes (different data)
    const potential_idor =
      successResponses.length > 1 &&
      successHashes.size > 1 &&
      successResponses.every(r => r.contains_target_data);

    // Generate recommendation
    const recommendation = this.generateRecommendation({
      status_codes_differ,
      response_lengths_differ,
      potential_bola,
      potential_idor,
      successResponses,
      totalResults: results.length,
    });

    return {
      status_codes_differ,
      response_lengths_differ,
      potential_bola,
      potential_idor,
      recommendation,
    };
  }

  /**
   * Check if response lengths have significant variance
   */
  private hasSignificantLengthVariance(lengths: number[]): boolean {
    if (lengths.length < 2) return false;

    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (avg === 0) return false;

    for (const length of lengths) {
      const variance = Math.abs(length - avg) / avg;
      if (variance > this.RESPONSE_LENGTH_VARIANCE_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate human-readable recommendation
   */
  private generateRecommendation(context: {
    status_codes_differ: boolean;
    response_lengths_differ: boolean;
    potential_bola: boolean;
    potential_idor: boolean;
    successResponses: DiffTestResult[];
    totalResults: number;
  }): string {
    const recommendations: string[] = [];

    if (context.potential_bola) {
      recommendations.push(
        'CRITICAL: Potential BOLA vulnerability detected. Multiple identities accessed the same resource with identical responses. Verify authorization controls.'
      );
    }

    if (context.potential_idor) {
      recommendations.push(
        'WARNING: Potential IDOR vulnerability detected. Multiple identities received different data for the same resource. Verify access controls prevent unauthorized data access.'
      );
    }

    if (context.status_codes_differ && !context.potential_bola && !context.potential_idor) {
      recommendations.push(
        'INFO: Status codes differ between identities. This may indicate proper authorization controls, or could warrant further investigation.'
      );
    }

    if (context.response_lengths_differ && !context.potential_idor) {
      recommendations.push(
        'INFO: Response lengths vary significantly. This could indicate different data being returned to different identities.'
      );
    }

    if (context.successResponses.length === 0) {
      recommendations.push(
        'INFO: No successful responses received. Verify the endpoint exists and authentication is configured correctly.'
      );
    } else if (context.successResponses.length === 1 && context.totalResults > 1) {
      recommendations.push(
        'INFO: Only one identity received a successful response. Authorization may be working correctly, or some identities may be misconfigured.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'INFO: No authorization anomalies detected. Responses appear consistent with expected access controls.'
      );
    }

    return recommendations.join(' ');
  }
}
