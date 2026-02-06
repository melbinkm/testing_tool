/**
 * Gemini Client using Application Default Credentials (ADC)
 * Uses the same auth as the main AutoPentest app (Google login)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAuth } from 'google-auth-library';

export interface GeminiResponse {
  text: string;
}

/**
 * Get access token from Application Default Credentials
 */
async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/generative-language'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error('Failed to get access token from ADC');
  }
  return token.token;
}

/**
 * Gemini client that uses ADC for authentication
 */
export class GeminiADCClient {
  private model: string;
  private genAI: GoogleGenerativeAI | null = null;

  constructor(model: string = 'gemini-2.0-flash') {
    this.model = model;
  }

  /**
   * Initialize the client with ADC
   */
  async initialize(): Promise<void> {
    // Try API key first (for backward compatibility)
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.error('[gemini-client] Using API key authentication');
      return;
    }

    // Fall back to ADC
    try {
      const accessToken = await getAccessToken();
      // GoogleGenerativeAI can use access token as API key for ADC
      this.genAI = new GoogleGenerativeAI(accessToken);
      console.error('[gemini-client] Using Application Default Credentials');
    } catch (error) {
      console.error('[gemini-client] ADC auth failed:', error);
      throw new Error(
        'No Gemini authentication available. Either set GEMINI_API_KEY or login with: gcloud auth application-default login'
      );
    }
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.genAI !== null;
  }

  /**
   * Generate content using Gemini
   */
  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini client not initialized. Call initialize() first.');
    }

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * Analyze page and determine action
   * Used by browser_act for natural language actions
   */
  async analyzePageForAction(
    action: string,
    pageContent: string,
    visibleElements: string
  ): Promise<{ selector: string; actionType: 'click' | 'fill' | 'select'; value?: string }> {
    const prompt = `You are a browser automation assistant. Given a user's natural language action and the current page state, determine the exact CSS selector and action to perform.

User wants to: "${action}"

Visible interactive elements:
${visibleElements}

Page text content (truncated):
${pageContent.substring(0, 2000)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "selector": "the CSS selector to target",
  "actionType": "click" or "fill" or "select",
  "value": "text to fill (only if actionType is fill)"
}`;

    const response = await this.generate(prompt);

    // Parse JSON from response
    try {
      // Remove any markdown code blocks if present
      const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse Gemini response: ${response}`);
    }
  }

  /**
   * Extract data from page
   * Used by browser_extract
   */
  async extractFromPage(
    instruction: string,
    pageContent: string
  ): Promise<unknown> {
    const prompt = `You are a data extraction assistant. Extract the requested information from the page content.

Instruction: "${instruction}"

Page content:
${pageContent.substring(0, 8000)}

Respond with ONLY the extracted data as JSON (no markdown, no explanation).
If extracting a single value, use: {"result": "value"}
If extracting multiple items, use: {"items": [...]}`;

    const response = await this.generate(prompt);

    try {
      const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      // Return as plain text if not JSON
      return { text: response };
    }
  }
}

/**
 * Singleton instance
 */
let geminiClient: GeminiADCClient | null = null;

export async function getGeminiClient(): Promise<GeminiADCClient> {
  if (!geminiClient) {
    geminiClient = new GeminiADCClient();
    await geminiClient.initialize();
  }
  return geminiClient;
}

export function hasGeminiClient(): boolean {
  return geminiClient !== null && geminiClient.isInitialized();
}
