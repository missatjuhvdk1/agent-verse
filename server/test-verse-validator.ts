/**
 * Quick test for Verse Validator
 * Run with: bun run server/test-verse-validator.ts
 */

import { getVerseValidator } from './verseValidator';

async function testValidator() {
  console.log('🧪 Testing Verse Validator...\n');

  const validator = getVerseValidator();

  // Test 1: Valid code (should pass syntax check)
  console.log('Test 1: Valid Verse code');
  const validCode = `
using { /Fortnite.com/Devices }
using { /Verse.org/Simulation }

my_device := class(creative_device):
    @editable MyButton : button_device = button_device{}

    OnBegin<override>()<suspends>:void=
        MyButton.InteractedWithEvent.Subscribe(OnButtonPressed)

    OnButtonPressed(Agent:agent):void=
        Print("Button pressed!")
`;

  const result1 = await validator.validate(validCode);
  console.log(validator.formatValidationResult(result1));
  console.log('');

  // Test 2: Code with syntax errors
  console.log('Test 2: Code with syntax errors');
  const badCode = `
using { /Fortnite.com/Devices }

my_device := class(creative_device):
    @editable MyButton : button_device

    OnBegin()<suspends>:void=
        Sleep(1.0);
`;

  const result2 = await validator.validate(badCode);
  console.log(validator.formatValidationResult(result2));
  console.log('');

  // Cleanup
  await validator.cleanup();
  console.log('✅ Tests complete!');
  process.exit(0);
}

testValidator().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
