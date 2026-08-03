import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

// A minimal valid 160x120 solid-red PNG, inlined so the spec has no on-disk
// fixture to go stale or need licensing — `page.setInputFiles` accepts a
// buffer directly. It has to be a real-ish resolution, not a 1x1 or 2x2 pixel
// stub: the cutter derives world-to-image scale from source width divided by
// grid columns, and a too-tiny source trips `PlaySession.assertPathScale`'s
// sanity check rather than producing a playable board.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAAyUlEQVR42u3RAQkAAAzDsPo3' +
  '/fsYgSpoutJwFgAWYAEWYAEWYAEGLMACLMACLMACDFiABViABViABViAAQuwAAuwAAuwAAM' +
  'WYAEWYAEWYAEGLMACLMACLMACLMCABViABViABViAAQuwAAuwAAuwAAO2ALAAC7AAC7AACz' +
  'BgARZgARZgARZgwAIswAIswAIswAIMWIAFWIAFWIAFGLAAC7AAC7AACzBgARZgARZgARZgA' +
  'QYswAIswAIswAIMWIAFWIAFWIAFGLCmex6SuVf52qjUAAAAAElFTkSuQmCC';

test.describe('photo picker and crop', () => {
  test('choosing a curated photo and confirming the default crop reaches a playable board', async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    await expect(board.chips.first()).toBeVisible();
  });

  test('uploading a photo skips the curated grid and reaches the crop screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    await expect(page.getByRole('button', { name: 'Use this photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Use this photo' }).click();
    // Step 5b's setup screen, accepting every default.
    await page.getByRole('button', { name: 'Start cutting' }).click();

    const board = new BoardPage(page);
    await board.waitForCut();
    await expect(board.chips.first()).toBeVisible();
  });

  test('a corrupt upload shows an inline error and stays on the picker', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'not-a-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('this is not image data'),
    });

    await expect(page.getByRole('alert')).toBeVisible();
    // Still on the picker, not stuck on a blank screen or a dead crop step.
    await expect(page.getByRole('button', { name: 'Curated photos' })).toBeVisible();
  });

  test('rotate cycles in 90-degree steps without breaking the crop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Choose this photo' }).click();

    const rotate = page.getByRole('button', { name: 'Rotate 90 degrees' });
    await rotate.click();
    await rotate.click();
    await rotate.click();
    await rotate.click(); // back to 0 degrees

    await page.getByRole('button', { name: 'Use this photo' }).click();
    await page.getByRole('button', { name: 'Start cutting' }).click();
    const board = new BoardPage(page);
    await board.waitForCut();
    await expect(board.chips.first()).toBeVisible();
  });
});
