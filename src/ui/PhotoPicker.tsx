/**
 * Step 5a's photo picker — the first screen of the setup flow, replacing the
 * old hardcoded synthetic image.
 *
 * Ported in shape from `TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` step
 * 1 (source toggle + curated grid + upload dropzone), restyled onto this
 * repo's real `theme.css` tokens instead of that prototype's inline `T`
 * object.
 */

import { useRef, useState } from 'react';
import { curatedPhotoUrl, photosByShelf, type CuratedShelf } from '@/play/curated';
import { Button } from './kit';

/** §15's three shelves, in display order and with their human labels. */
const SHELVES: readonly { key: CuratedShelf; label: string }[] = [
  { key: 'wide-and-calm', label: 'Wide and calm' },
  { key: 'dense-and-busy', label: 'Dense and busy' },
  { key: 'one-animal-close', label: 'One animal, close' },
];

export type PhotoChoice = { kind: 'curated'; id: string } | { kind: 'upload'; file: File };

export interface PhotoPickerProps {
  onPhotoChosen: (choice: PhotoChoice) => void;
  /** Surfaced by `App.tsx` when a previously chosen upload failed to decode. */
  error?: string | null;
  /**
   * A chosen photo is still decoding. HEIC conversion is the slow case, and
   * the seconds it takes must never read as a freeze — an older player takes
   * silence as their own mistake and starts tapping again.
   */
  busy?: boolean;
  /**
   * v2: the picker is step 1 of a pushed flow, not a hub — the daily and the
   * wall live on their tabs, so the way out is Back (spec §3, B5).
   */
  onBack?: () => void;
  /** Home's Browse Photos/Upload Yours split. Defaults to 'curated' when omitted. */
  initialSource?: Source;
}

type Source = 'curated' | 'upload';

export function PhotoPicker({
  onPhotoChosen,
  error,
  busy,
  onBack,
  initialSource,
}: PhotoPickerProps): React.ReactElement {
  const [source, setSource] = useState<Source>(initialSource ?? 'curated');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined): void => {
    if (!file) return;
    onPhotoChosen({ kind: 'upload', file });
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5"
        style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              aria-label="Back"
              onClick={onBack}
            >
              ←
            </Button>
          )}
          <div>
            <div className="font-[var(--font-display)] text-5 text-[var(--ink-primary)]">
              New puzzle
            </div>
            <div className="mt-1 font-[var(--font-data)] text-1 text-[var(--ink-muted)]">
              Pick a photo
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Curated photos"
            aria-pressed={source === 'curated'}
            onClick={() => setSource('curated')}
            className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-1 ${
              source === 'curated'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {source === 'curated' ? '✓ ' : ''}Curated photos
          </button>
          <button
            type="button"
            aria-label="Upload photo"
            aria-pressed={source === 'upload'}
            onClick={() => setSource('upload')}
            className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-1 ${
              source === 'upload'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {source === 'upload' ? '✓ ' : ''}+ Upload Photo
          </button>
        </div>

        {busy && (
          <div
            role="status"
            className="rounded-[var(--radius-sm)] border border-[var(--edge-hair)] p-3 text-2 text-[var(--ink-primary)]"
          >
            Getting your photo ready…
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--accent)] p-3 text-2 text-[var(--ink-primary)]">
            {error}
          </div>
        )}

        {source === 'curated' ? (
          SHELVES.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-3">
              <h2 className="font-[var(--font-data)] text-1 uppercase tracking-wide text-[var(--ink-muted)]">
                {label}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {photosByShelf(key).map((photo) => {
                  return (
                    // v2 spec §4: a tap advances — no separate confirm. `busy`
                    // guards a second tap while the first photo decodes.
                    <button
                      key={photo.id}
                      type="button"
                      aria-label={`Curated photo: ${photo.name}`}
                      disabled={busy}
                      onClick={() => onPhotoChosen({ kind: 'curated', id: photo.id })}
                      className="overflow-hidden rounded-[var(--radius-md)] border-2 border-[var(--edge-hair)] text-left active:border-[var(--accent)]"
                    >
                      <div
                        className="relative flex aspect-[4/3] items-center justify-center text-5"
                        style={{ background: photo.dominant[0] ?? 'var(--mat-raised)' }}
                      >
                        <img
                          src={curatedPhotoUrl(photo.id)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="px-3 py-2" style={{ background: 'var(--mat-raised)' }}>
                        <div className="text-2 text-[var(--ink-primary)]">
                          {photo.name}
                          {/* Colour is never the only signal (CLAUDE.md) — a text marker, not a badge colour. */}
                          {photo.difficulty === 'hard' && (
                            <span className="ml-1 text-1 text-[var(--ink-muted)]">
                              (hard)
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a photo here or tap to choose a file"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
            className={`flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-10 text-center ${
              dragOver ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]'
            }`}
          >
            <div className="font-[var(--font-data)] text-1 text-[var(--ink-muted)]">
              Tap to pick from your library
              <br />
              or drag a photo here
            </div>
            <input
              ref={fileInput}
              type="file"
              // `image/*` already surfaces HEIC assets in the iOS sheet; the
              // explicit types are for the desktop and Android file dialogs,
              // which filter on the list rather than on the wildcard.
              accept="image/*,image/heic,image/heif,.heic,.heif"
              aria-label="Upload a photo"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

    </div>
  );
}
