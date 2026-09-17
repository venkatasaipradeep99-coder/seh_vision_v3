/**
 * Vision Test Service
 * Handles mobile number validation and saving completed test results
 * to the vision_test_results database table.
 */

export function validateIndianMobile(raw: string): { isValid: boolean; error?: string } {
  const cleaned = (raw || '').trim().replace(/[\s-]/g, '');
  if (!cleaned) {
    return { isValid: false, error: 'Mobile number is mandatory' };
  }
  if (!/^\d+$/.test(cleaned)) {
    return { isValid: false, error: 'Only numeric digits (0-9) are allowed' };
  }
  if (cleaned.length !== 10) {
    return { isValid: false, error: 'Mobile number must be exactly 10 digits' };
  }
  if (!/^[6-9]/.test(cleaned)) {
    return { isValid: false, error: 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9' };
  }
  if (/^(\d)\1{9}$/.test(cleaned)) {
    return { isValid: false, error: 'Invalid mobile number' };
  }
  return { isValid: true };
}

export async function saveVisionTestResult(params: {
  mobileNumber: string;
  visionScore: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch('/api/vision-test-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile_number: params.mobileNumber,
        vision_score: params.visionScore,
      }),
    });

    const json = await res.json();
    return json;
  } catch (err: any) {
    console.error('[VisionTestService] Error saving vision test result:', err);
    return {
      success: false,
      error: err.message || 'Network error saving test results',
    };
  }
}
