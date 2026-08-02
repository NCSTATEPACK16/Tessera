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
import { CURATED_PHOTOS } from '@/play/curated';

export type PhotoChoice = { kind: 'curated'; id: string } | { kind: 'upload'; file: File };

export interface PhotoPickerProps {
  onPhotoChosen: (choice: PhotoChoice) => void;
  /** Surfaced by `App.tsx` when a previously chosen upload failed to decode. */
  error?: string | null;
}

type Source = 'curated' | 'upload';

export function PhotoPicker({ onPhotoChosen, error }: PhotoPickerProps): React.ReactElement {
  const [source, setSource] = useState<Source>('curated');
  const [selectedId, setSelectedId] = useState<string>(CURATED_PHOTOS[0]!.id);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined): void => {
    if (!file) return;
    onPhotoChosen({ kind: 'upload', file });
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 1 of 2 — Pick a photo
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Curated photos"
          aria-pressed={source === 'curated'}
          onClick={() => setSource('curated')}
          className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-[12px] ${
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
          className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-[12px] ${
            source === 'upload'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
          }`}
        >
          {source === 'upload' ? '✓ ' : ''}+ Upload Photo
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--accent)] p-3 text-[13px] text-[var(--ink-primary)]">
          {error}
        </div>
      )}

      {source === 'curated' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {CURATED_PHOTOS.map((photo) => {
              const selected = photo.id === selectedId;
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Curated photo: ${photo.name}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(photo.id)}
                  className={`overflow-hidden rounded-[var(--radius-md)] border-2 text-left ${
                    selected ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]'
                  }`}
                >
                  <div
                    className="flex aspect-[4/3] items-center justify-center text-[24px]"
                    style={{ background: 'var(--mat-raised)' }}
                  >
                    {selected ? '✓' : ''}
                  </div>
                  <div className="px-3 py-2" style={{ background: 'var(--mat-raised)' }}>
                    <div className="text-[13px] text-[var(--ink-primary)]">{photo.name}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Choose this photo"
            onClick={() => onPhotoChosen({ kind: 'curated', id: selectedId })}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
          >
            Choose this photo →
          </button>
        </>
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
          <div className="font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
            Tap to pick from your library
            <br />
            or drag a photo here
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload a photo"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}
