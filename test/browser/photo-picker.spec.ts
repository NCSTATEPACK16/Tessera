import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';
import { withExifOrientation } from './fixtures/exif';

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

  test('a HEIC upload gets the HEIC-specific error, not the generic one', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'photo.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('not a real heic file'),
    });

    // The whole point: an iPhone's default format deserves a message that
    // tells the player what to do, not "try a different file".
    await expect(page.getByRole('alert')).toContainText(/HEIC photos aren/);
    await expect(page.getByRole('button', { name: 'Curated photos' })).toBeVisible();
  });

  test('a portrait JPEG with EXIF orientation 6 is not sliced sideways', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    // A 200×300 portrait tagged orientation 6 ("rotate 90° CW") is *stored*
    // 300×200. Honouring EXIF must yield 200×300 again — PLAN.md's Step 1
    // box is exactly "portrait photos slice sideways".
    const jpeg = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 200;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3d6b8c';
      ctx.fillRect(0, 0, 300, 200);
      const blob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    });

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'portrait.jpg',
      mimeType: 'image/jpeg',
      buffer: withExifOrientation(Buffer.from(jpeg), 6),
    });

    await expect(page.getByRole('button', { name: 'Use this photo' })).toBeVisible();
    // The crop screen's canvas carries the decoded source's dimensions.
    // Portrait means height > width.
    const aspect = await page
      .getByTestId('crop-source-aspect')
      .evaluate((el: HTMLCanvasElement) => el.width / el.height);
    expect(aspect).toBeLessThan(1);
  });

  test('curated photos are grouped by feeling, not by category', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // The three §15 shelves, by their human labels.
    await expect(page.getByRole('heading', { name: 'Wide and calm' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dense and busy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One animal, close' })).toBeVisible();
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
