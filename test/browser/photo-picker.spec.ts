import { expect, test } from '@playwright/test';
import { BoardPage, reachPicker } from './board-page';
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
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
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
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
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
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
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

  test('a HEIC mislabelled as a JPEG is still routed to the HEIC decoder', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
    await page.getByRole('button', { name: 'Upload photo' }).click();

    // The case the container sniff exists for: iOS share paths and Windows
    // both hand over HEIC bytes under a JPEG name and MIME type. Neither
    // signal can be trusted, so the `ftyp` box is what decides.
    //
    // The payload after the header is deliberately garbage — libvips ships no
    // HEVC encoder (patent licensing), so no real HEIC fixture can be built in
    // this repo. What this asserts is the *routing*: these bytes reach the
    // decoder rather than the generic "couldn't open that photo" path. That a
    // real HEIC then decodes is the iPad gate, and only a device can prove it.
    const heicWorkers: string[] = [];
    page.on('worker', (w) => {
      if (w.url().includes('heic.worker')) heicWorkers.push(w.url());
    });

    const header = Buffer.alloc(24);
    header.writeUInt32BE(24, 0);
    header.write('ftyp', 4, 'ascii');
    header.write('heic', 8, 'ascii');
    await page.getByLabel('Upload a photo').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.concat([header, Buffer.from('garbage payload')]),
    });

    // The reassurance is on screen before the decoder has even loaded.
    await expect(page.getByRole('status')).toContainText('Getting your photo ready');

    // Generous, and deliberately so: the first HEIC of a session pays a cold
    // ~3 MB WASM fetch and compile, which overruns the 5s default. That cost
    // is the reason the busy state above is not optional.
    await expect(page.getByRole('alert')).toContainText(/HEIC photos aren/, { timeout: 30_000 });
    await expect(page.getByRole('status')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Curated photos' })).toBeVisible();
    expect(heicWorkers).toHaveLength(1);
  });

  test('a JPEG upload never wakes the HEIC decoder', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);

    // The other half of the sniff's job, and the expensive half to get wrong:
    // libheif is ~3 MB of WASM, and the happy path must never pay for it.
    const heicWorkers: string[] = [];
    page.on('worker', (w) => {
      if (w.url().includes('heic.worker')) heicWorkers.push(w.url());
    });

    await page.getByRole('button', { name: 'Upload photo' }).click();
    await page.getByLabel('Upload a photo').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    await expect(page.getByRole('button', { name: 'Use this photo' })).toBeVisible();
    expect(heicWorkers).toHaveLength(0);
  });

  test('a portrait JPEG with EXIF orientation 6 is not sliced sideways', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
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
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
    // The three §15 shelves, by their human labels.
    await expect(page.getByRole('heading', { name: 'Wide and calm' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dense and busy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One animal, close' })).toBeVisible();
  });

  test('rotate cycles in 90-degree steps without breaking the crop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // §16: a fresh Playwright context is a fresh profile, which lands on the
    // guided twelve rather than the picker — see `reachPicker`'s own doc.
    await reachPicker(page);
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
